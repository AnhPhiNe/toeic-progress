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


async def ai_authorized(request: Request, user=Depends(identity)):
    """Enforce feature flags and AI access BEFORE FastAPI parses/decodes multi-image request bodies."""
    settings = request.app.state.settings
    path = request.url.path
    access = request.state.ai_access
    if path == "/api/v1/ai/analyze-attempt":
        if user["is_anonymous"]:
            raise HTTPException(403, "Đăng nhập để phân tích lần làm đã đồng bộ của tài khoản.")
        if not access.enabled:
            raise access.denied()
        if not settings.attempt_analysis_ready:
            raise HTTPException(503, "AI gợi ý ôn tập chưa được cấu hình. Bạn vẫn có thể xem thống kê và ôn Sổ tay.")
        return user
    if not settings.ai_ready or (path == "/api/v1/ai/explain-batch" and not settings.rate_limit_secret):
        if path == "/api/v1/ai/read-results":
            raise HTTPException(503, "Chức năng phân tích AI đang tắt hoặc chưa cấu hình. Bạn vẫn có thể chạm vào các câu sai.")
        if path == "/api/v1/ai/explain-batch":
            raise HTTPException(503, "Chức năng phân tích AI đang tắt hoặc chưa cấu hình.")
        message = "Chức năng phân tích AI đang được tắt." if not settings.ai_enabled else "Cấu hình dịch vụ phân tích AI chưa đầy đủ."
        suffix = " Bạn vẫn có thể ghi tay." if path == "/api/v1/ai/extract-page" else " Bạn vẫn có thể lưu thủ công."
        raise HTTPException(503, message + suffix)
    if not access.enabled:
        raise access.denied()
    return user


async def source_images_authorized(request: Request, user=Depends(account)):
    """Reject disabled source-image uploads BEFORE Pydantic parses image attachments."""
    if not request.app.state.settings.source_images_enabled:
        raise HTTPException(503, "Lưu ảnh nguồn chưa được bật. Nội dung đang nhập vẫn được giữ.")
    return user
