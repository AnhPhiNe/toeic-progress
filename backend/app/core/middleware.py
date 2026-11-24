import asyncio

from fastapi.responses import JSONResponse

# Routes that take original test-page or paper-result photos: bigger body (bytes) and longer upload timeout.
LARGE_BODY_PATHS = {
    "/api/v1/ai/extract": 6 * 1024 * 1024,
    "/api/v1/ai/extract-page": 12 * 1024 * 1024,
    "/api/v1/ai/read-results": 10 * 1024 * 1024,
}
BODY_METHODS = frozenset({"POST", "PUT", "PATCH"})


def _has_bearer_header(scope) -> bool:
    for key, value in scope.get("headers") or []:
        if key.lower() == b"authorization":
            scheme, _, token = value.decode("latin-1").strip().partition(" ")
            if scheme.lower() == "bearer" and token.strip():
                return True
    return False


def _declared_content_length(scope) -> int | None:
    for key, value in scope.get("headers") or []:
        if key.lower() == b"content-length":
            try:
                return int(value.decode("latin-1").strip())
            except ValueError:
                return None
    return None


class BodyLimitMiddleware:
    def __init__(self, app, maximum=4 * 1024 * 1024, timeout=10, large_timeout=45, large_paths=None):
        self.app, self.maximum, self.timeout, self.large_timeout = app, maximum, timeout, large_timeout
        self.large_paths = LARGE_BODY_PATHS if large_paths is None else large_paths

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        method = scope.get("method", "")
        if method not in BODY_METHODS:
            return await self.app(scope, receive, send)
        path = scope.get("path", "")
        # Never buffer multi-megabyte request bodies (or wait 45s) for unauthenticated /api/* callers.
        if path.startswith("/api/") and not _has_bearer_header(scope):
            return await JSONResponse({"detail": "Cần phiên đăng nhập hoặc phiên khách để tiếp tục."}, status_code=401)(
                scope, receive, send
            )
        large = self.large_paths.get(path) if method == "POST" else None
        maximum, timeout = (large, self.large_timeout) if large else (self.maximum, self.timeout)
        declared = _declared_content_length(scope)
        if declared is not None and declared > maximum:
            return await JSONResponse({"detail": "Yêu cầu quá lớn."}, status_code=413)(scope, receive, send)
        body = bytearray()
        try:
            async with asyncio.timeout(timeout):
                while True:
                    message = await receive()
                    if message["type"] == "http.disconnect":
                        return
                    body.extend(message.get("body", b""))
                    if len(body) > maximum:
                        return await JSONResponse({"detail": "Yêu cầu quá lớn."}, status_code=413)(scope, receive, send)
                    if not message.get("more_body"):
                        break
        except TimeoutError:
            return await JSONResponse({"detail": "Gửi dữ liệu quá lâu. Vui lòng thử lại."}, status_code=408)(
                scope, receive, send
            )
        payload = bytes(body)
        body.clear()
        delivered = False

        async def replay():
            nonlocal delivered, payload
            if not delivered:
                delivered = True
                data, payload = payload, b""
                return {"type": "http.request", "body": data, "more_body": False}
            return await receive()

        await self.app(scope, replay, send)
