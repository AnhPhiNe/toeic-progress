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
# Paths that read the learner's AI access and count against AI quotas.
AI_PATHS = ("/api/v1/ai/usage", "/api/v1/ai/extract", "/api/v1/ai/extract-page", "/api/v1/ai/read-results", "/api/v1/ai/explain-batch", "/api/v1/ai/analyze-attempt")
ROUTES = {
    "/health": "health",
    "/ready": "ready",
    "/api/v1/sync": "sync",
    "/api/v1/ai/usage": "usage",
    "/api/v1/ai/extract": "ai",
    "/api/v1/ai/extract-page": "ai",
    "/api/v1/ai/read-results": "ai",
    "/api/v1/ai/explain-batch": "ai",
    "/api/v1/ai/analyze-attempt": "ai",
    "/api/v1/account": "destructive",
    "/api/v1/data/reset": "destructive",
    "/api/v1/mistake-images": "sync",
    "/api/v1/mistake-images/urls": "sync",
    "/api/v1/mistake-images/cleanup": "destructive",
    # League requests share the sync budget (same DB-backed per-account limits).
    "/api/v1/league": "sync",
    "/api/v1/league/join": "sync",
    "/api/v1/league/leave": "sync",
    "/api/v1/league/me": "sync",
    "/api/v1/rank": "sync",
    "/api/v1/rank/join": "sync",
    "/api/v1/rank/leave": "sync",
    "/api/v1/rank/me": "sync",
}


def header_values(scope, name: str) -> list[str]:
    wanted = name.lower().encode("latin-1")
    return [value.decode("latin-1").strip() for key, value in (scope.get("headers") or []) if key.lower() == wanted]


def header_value(scope, name: str) -> str | None:
    values = header_values(scope, name)
    return values[0] if values else None


def _normalize_ip_bucket(value: str) -> str:
    """Group IPv6 addresses by /64 prefix so one host cannot rotate 2^64 addresses to evade IP limits."""
    parsed = ipaddress.ip_address(value)
    if isinstance(parsed, ipaddress.IPv6Address):
        return str(ipaddress.ip_network(f"{parsed}/64", strict=False))
    return str(parsed)


def client_address(scope, settings: Settings) -> str:
    """Client IP for per-IP limits.

    Only the configured edge header is trusted, and only when it appears once with one valid IP;
    otherwise the socket peer is used. X-Forwarded-For is never read because the hosting
    proxy appends to a client-supplied value instead of replacing it.
    """
    socket_ip = (scope.get("client") or ("unknown", 0))[0]
    if settings.client_ip_header:
        candidates = header_values(scope, settings.client_ip_header)
        if len(candidates) == 1 and candidates[0]:
            try:
                return _normalize_ip_bucket(candidates[0])
            except ValueError:
                pass
    try:
        return _normalize_ip_bucket(socket_ip)
    except ValueError:
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
            "p_user_id": user_id,
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
        self.ai_active = 0
        self.ip_active: dict[str, int] = {}
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
        # Valid CORS preflights are already handled by CORSMiddleware outside this layer;
        # raw OPTIONS requests must NOT bypass ingress rate-limiting or concurrency guards.
        guarded = not (path in ("/health", "/ready") and method in ("GET", "HEAD"))
        is_ai_work = path in AI_PATHS and method == "POST"
        acquired = False
        acquired_ai = False
        acquired_address: str | None = None
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
                headers["X-Frame-Options"] = "DENY"
                if self.settings.environment != "development":
                    headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
                    headers["Content-Security-Policy"] = "default-src 'none'; frame-ancestors 'none'"
                if path.startswith("/api/") or path in ("/health", "/ready", "/debug/client-ip"):
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
                    path in AI_PATHS
                    and token_hash in self.ai_exempt_tokens
                )
                if current[1] > self.settings.ingress_ip_minute_limit and not known_ai_exempt:
                    delay = str(max(1, math.ceil(current[0] - now)))
                    return await JSONResponse(
                        {"detail": "Có quá nhiều yêu cầu. Vui lòng chờ rồi thử lại."},
                        429,
                        headers={"Retry-After": delay},
                    )(scope, receive, tracked_send)
                ai_cap = min(self.settings.max_ai_concurrent_requests, self.settings.max_concurrent_requests)
                per_ip_cap = min(self.settings.max_concurrent_per_ip, self.settings.max_concurrent_requests)
                if (
                    self.active >= self.settings.max_concurrent_requests
                    or (is_ai_work and self.ai_active >= ai_cap)
                    or (not known_ai_exempt and self.ip_active.get(address, 0) >= per_ip_cap)
                ):
                    return await JSONResponse(
                        {"detail": "Máy chủ đang bận. Vui lòng thử lại."}, 503, headers={"Retry-After": "3"}
                    )(scope, receive, tracked_send)
                self.active += 1
                acquired = True
                if is_ai_work:
                    self.ai_active += 1
                    acquired_ai = True
                self.ip_active[address] = self.ip_active.get(address, 0) + 1
                acquired_address = address
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
            if acquired_ai:
                self.ai_active -= 1
            if acquired_address is not None:
                remaining = self.ip_active.get(acquired_address, 1) - 1
                if remaining <= 0:
                    self.ip_active.pop(acquired_address, None)
                else:
                    self.ip_active[acquired_address] = remaining
            logger.info(
                json.dumps(
                    {
                        "event": "request",
                        "request_id": request_id,
                        "route": path if path in ROUTES else "unmatched",
                        "method": method if method in ("GET", "POST", "PATCH", "DELETE", "OPTIONS", "HEAD") else "OTHER",
                        "status": status,
                        "duration_ms": round((time.monotonic() - started) * 1000, 2),
                    }
                )
            )
            request_id_context.reset(context_token)
