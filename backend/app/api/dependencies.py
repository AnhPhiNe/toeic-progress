from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.runtime import AI_PATHS, reserve_account_request

bearer = HTTPBearer(auto_error=False)


async def identity(request: Request, credentials: HTTPAuthorizationCredentials | None = Depends(bearer)):
    settings = request.app.state.settings
    if not credentials:
        raise HTTPException(401, "Cần phiên đăng nhập hoặc phiên khách để tiếp tục.")
    gateway = request.app.state.gateway
    user = await gateway.authenticate(credentials.credentials)
    ai_path = request.url.path in AI_PATHS
    access = await gateway.ai_access(user) if ai_path else None
    request.state.ai_access = access
    privileged = access.unlimited if access is not None else not settings.ai_access_managed and settings.unlimited_ai_for(user)
    request.state.verified_ai_unlimited = privileged
    if privileged and ai_path:
        request.state.ai_limit_exempt = True
        return user
    if not user["is_anonymous"] or ai_path:
        await reserve_account_request(gateway, settings, user["id"], request.url.path)
    return user


async def account(user=Depends(identity)):
    if user["is_anonymous"]:
        raise HTTPException(403, "Đăng nhập Google để đồng bộ tài khoản.")
    return user
