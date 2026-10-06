from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.runtime import reserve_account_request

bearer = HTTPBearer(auto_error=False)


async def identity(request: Request, credentials: HTTPAuthorizationCredentials | None = Depends(bearer)):
    settings = request.app.state.settings
    if not credentials:
        raise HTTPException(401, "Cần phiên đăng nhập hoặc phiên khách để tiếp tục.")
    gateway = request.app.state.gateway
    user = await gateway.authenticate(credentials.credentials)
    if not user["is_anonymous"] or request.url.path in ("/api/v1/ai/usage", "/api/v1/ai/extract"):
        await reserve_account_request(gateway, settings, user["id"], request.url.path)
    return user


async def account(user=Depends(identity)):
    if user["is_anonymous"]:
        raise HTTPException(403, "Đăng nhập Google để đồng bộ tài khoản.")
    return user
