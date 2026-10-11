"""Bound ingress, share account limits in PostgreSQL, and emit metadata-only request logs."""

import hashlib
import hmac
import ipaddress
import json
import logging
import math
import time
from collections import OrderedDict
from contextvars import ContextVar
from uuid import uuid4

from fastapi import HTTPException
from starlette.datastructures import MutableHeaders
from starlette.responses import JSONResponse

from app.core.config import Settings

logger = logging.getLogger("toeic.runtime")
request_id_context: ContextVar[str | None] = ContextVar("request_id", default=None)
ROUTES = {
    "/health": "health",
    "/ready": "ready",
    "/api/v1/sync": "sync",
    "/api/v1/ai/usage": "usage",
    "/api/v1/ai/extract": "ai",
    "/api/v1/account": "destructive",
    "/api/v1/data/reset": "destructive",
    "/api/v1/mistake-images": "sync",
    "/api/v1/mistake-images/urls": "sync",
    "/api/v1/mistake-images/cleanup": "destructive",
}


def header_value(scope, name: str) -> str | None:
    wanted = name.lower().encode("latin-1")
    for key, value in scope.get("headers") or []:
        if key.lower() == wanted:
            return value.decode("latin-1").strip()
    return None


def client_address(scope, settings: Settings) -> str:
    """Client IP for per-IP limits.

    Only the configured edge header is trusted, and only when it holds exactly one valid IP;
    otherwise the socket peer is used. X-Forwarded-For is never read because the hosting
    proxy appends to a client-supplied value instead of replacing it.
    """
    socket_ip = (scope.get("client") or ("unknown", 0))[0]
    if settings.client_ip_header:
        candidate = header_value(scope, settings.client_ip_header)
        if candidate:
            try:
                return str(ipaddress.ip_address(candidate))
            except ValueError:
                pass
    return socket_ip


def configure_logging():
    if not any(getattr(handler, "toeic_handler", False) for handler in logger.handlers):
        handler = logging.StreamHandler()
        handler.toeic_handler = True
        handler.setFormatter(logging.Formatter("%(message)s"))
        logger.addHandler(handler)
    logger.setLevel(logging.INFO)


async def reserve_account_request(gateway, settings: Settings, user_id: str, path: str):
    if not settings.api_limits_enabled:
        return
    group = ROUTES.get(path)
    if group not in ("sync", "usage", "ai", "destructive"):
        return
    limit = {
        "sync": settings.api_sync_minute_limit,
        "usage": settings.api_usage_minute_limit,
        "ai": settings.api_ai_minute_limit,
        "destructive": settings.api_destructive_minute_limit,
    }[group]
    result = await gateway.rpc(
        "reserve_api_request",
        {
            "p_owner_id": user_id,
            "p_scope": group,
            "p_account_limit": settings.api_account_minute_limit,
            "p_scope_limit": limit,
        },
    )
    if result.get("allowed") is not True:
        delay = max(1, min(60, int(result.get("retry_after", 60))))
        raise HTTPException(
            429, "Bạn thao tác quá nhanh. Vui lòng chờ rồi thử lại.", headers={"Retry-After": str(delay)}
        )


class RuntimeMiddleware:
    """A bounded per-process ingress guard; account and AI quotas remain shared across instances."""

    def __init__(self, app, settings: Settings):
        self.app, self.settings = app, settings
        self.active = 0
        self.ip_windows = OrderedDict()
        # Opaque positive hints bypass only ingress throttling. Identity is
        # still revalidated by Supabase on EVERY request before granting AI.
        self.ai_exempt_tokens = OrderedDict()

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        started = time.monotonic()
        request_id = str(uuid4())
        context_token = request_id_context.set(request_id)
        scope.setdefault("state", {})["request_id"] = request_id
        scope["state"]["verified_ai_unlimited"] = False
        scope["state"]["ai_limit_exempt"] = False
        path = scope.get("path", "")
        method = scope.get("method", "")
        guarded = method != "OPTIONS" and not (path in ("/health", "/ready") and method in ("GET", "HEAD"))
        acquired = False
        status = 500
        response_started = False
        ip_window = None
        authorization = next((value for name, value in scope.get("headers", []) if name.lower() == b"authorization"), b"")
        token_hash = hmac.new(self.settings.rate_limit_secret.encode(), authorization, hashlib.sha256).hexdigest() if authorization else None

        async def tracked_send(message):
            nonlocal status, response_started
            if message["type"] == "http.response.start":
                response_started = True
                status = message["status"]
                headers = MutableHeaders(scope=message)
                headers["X-Request-ID"] = request_id
                headers["X-Content-Type-Options"] = "nosniff"
                headers["Referrer-Policy"] = "no-referrer"
                if path.startswith("/api/") or path in ("/health", "/ready"):
                    headers["Cache-Control"] = "no-store"
            await send(message)

        try:
            if guarded:
                now = time.monotonic()
                while self.ai_exempt_tokens and next(iter(self.ai_exempt_tokens.values())) <= now:
                    self.ai_exempt_tokens.popitem(last=False)
                # Drop expired windows before admitting new addresses; bound memory under IP churn.
                while self.ip_windows and next(iter(self.ip_windows.values()))[0] <= now:
                    self.ip_windows.popitem(last=False)
                address = client_address(scope, self.settings)
                current = self.ip_windows.get(address)
                if current is None:
                    if len(self.ip_windows) >= 4096:
                        return await JSONResponse(
                            {"detail": "Máy chủ đang bận. Vui lòng thử lại."}, 503, headers={"Retry-After": "5"}
                        )(scope, receive, tracked_send)
                    current = [now + 60, 0]
                    self.ip_windows[address] = current
                current[1] += 1
                ip_window = current
                known_ai_exempt = (
                    path in ("/api/v1/ai/usage", "/api/v1/ai/extract")
                    and token_hash in self.ai_exempt_tokens
                )
                if current[1] > self.settings.ingress_ip_minute_limit and not known_ai_exempt:
                    delay = str(max(1, math.ceil(current[0] - now)))
                    return await JSONResponse(
                        {"detail": "Có quá nhiều yêu cầu. Vui lòng chờ rồi thử lại."},
                        429,
                        headers={"Retry-After": delay},
                    )(scope, receive, tracked_send)
                if self.active >= self.settings.max_concurrent_requests:
                    return await JSONResponse(
                        {"detail": "Máy chủ đang bận. Vui lòng thử lại."}, 503, headers={"Retry-After": "3"}
                    )(scope, receive, tracked_send)
                self.active += 1
                acquired = True
            await self.app(scope, receive, tracked_send)
        except Exception as error:
            # Never log exception messages/tracebacks: they may contain upstream URLs or payloads.
            logger.error(
                json.dumps({"event": "request_error", "request_id": request_id, "error_type": type(error).__name__})
            )
            if not response_started:
                await JSONResponse({"detail": "Máy chủ gặp lỗi. Vui lòng thử lại sau."}, 500)(
                    scope, receive, tracked_send
                )
        finally:
            if scope["state"].get("ai_limit_exempt") is True and ip_window is not None:
                # Verified privileged AI traffic does not spend the IP's spam budget.
                ip_window[1] = max(0, ip_window[1] - 1)
            if token_hash:
                if scope["state"].get("verified_ai_unlimited") is True:
                    self.ai_exempt_tokens.pop(token_hash, None)
                    if len(self.ai_exempt_tokens) >= 1024:
                        self.ai_exempt_tokens.popitem(last=False)
                    self.ai_exempt_tokens[token_hash] = time.monotonic() + 60
                else:
                    self.ai_exempt_tokens.pop(token_hash, None)
            if acquired:
                self.active -= 1
            logger.info(
                json.dumps(
                    {
                        "event": "request",
                        "request_id": request_id,
                        "route": path if path in ROUTES else "unmatched",
                        "method": method if method in ("GET", "POST", "DELETE", "OPTIONS", "HEAD") else "OTHER",
                        "status": status,
                        "duration_ms": round((time.monotonic() - started) * 1000, 2),
                    }
                )
            )
            request_id_context.reset(context_token)
