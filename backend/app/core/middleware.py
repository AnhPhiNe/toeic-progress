import asyncio

from fastapi.responses import JSONResponse

# Routes that take original test-page or paper-result photos: bigger body (bytes) and longer upload timeout.
LARGE_BODY_PATHS = {
    "/api/v1/ai/extract-page": 12 * 1024 * 1024,
    "/api/v1/ai/read-results": 10 * 1024 * 1024,
}


class BodyLimitMiddleware:
    def __init__(self, app, maximum=4 * 1024 * 1024, timeout=10, large_timeout=45, large_paths=None):
        self.app, self.maximum, self.timeout, self.large_timeout = app, maximum, timeout, large_timeout
        self.large_paths = LARGE_BODY_PATHS if large_paths is None else large_paths

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        if scope.get("method") in ("GET", "HEAD"):
            return await self.app(scope, receive, send)
        body = bytearray()
        large = self.large_paths.get(scope.get("path", ""))
        maximum, timeout = (large, self.large_timeout) if large else (self.maximum, self.timeout)
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
        delivered = False

        async def replay():
            nonlocal delivered
            if not delivered:
                delivered = True
                return {"type": "http.request", "body": bytes(body), "more_body": False}
            return await receive()

        await self.app(scope, replay, send)
