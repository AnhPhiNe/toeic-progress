import asyncio

from fastapi.responses import JSONResponse


class BodyLimitMiddleware:
    def __init__(self, app, maximum=4 * 1024 * 1024, timeout=10):
        self.app, self.maximum, self.timeout = app, maximum, timeout

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        if scope.get("method") in ("GET", "HEAD"):
            return await self.app(scope, receive, send)
        body = bytearray()
        try:
            async with asyncio.timeout(self.timeout):
                while True:
                    message = await receive()
                    if message["type"] == "http.disconnect":
                        return
                    body.extend(message.get("body", b""))
                    if len(body) > self.maximum:
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
