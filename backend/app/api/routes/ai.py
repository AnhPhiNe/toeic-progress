import hashlib

from fastapi import APIRouter, Depends, HTTPException, Request

from app.api.dependencies import identity
from app.schemas.models import ExtractRequest

router = APIRouter()


@router.get("/api/v1/ai/usage")
async def usage(request: Request, user=Depends(identity)):
    settings = request.app.state.settings
    if settings.unlimited_ai_for(user):
        return {"remaining": None, "limit": None, "guest": False, "unlimited": True}
    return await request.app.state.gateway.rpc(
        "get_ai_usage",
        {
            "p_owner_id": user["id"],
            "p_guest": user["is_anonymous"],
            "p_limit": settings.ai_guest_limit if user["is_anonymous"] else settings.ai_account_monthly_limit,
        },
    )


@router.post("/api/v1/ai/extract")
async def extract(body: ExtractRequest, request: Request, user=Depends(identity)):
    settings = request.app.state.settings
    if not settings.ai_ready:
        raise HTTPException(503, "AI chưa được cấu hình. Bạn có thể nhập thủ công hoặc xem mẫu minh họa.")
    if body.provider != settings.ai_provider and not (body.provider is None and settings.ai_provider == "gemini"):
        raise HTTPException(409, "Nhà cung cấp AI đã thay đổi. Tải lại trang và xác nhận gửi nội dung trước khi thử lại.")
    gateway = request.app.state.gateway
    unlimited = settings.unlimited_ai_for(user)
    if user["is_anonymous"]:
        await gateway.verify_captcha(body.captcha_token)
    reservation = await gateway.rpc(
        "reserve_ai_request",
        {
            "p_owner_id": user["id"],
            "p_guest": user["is_anonymous"],
            "p_request_id": str(body.request_id),
            "p_input_hash": hashlib.sha256(body.text.encode()).hexdigest(),
            "p_ip_hash": gateway.ip_hash(request.client.host if request.client else "unknown"),
            # These RPC parameters are service-role only. NULL leaves the
            # corresponding cap unset while still recording usage/idempotency.
            "p_user_limit": None if unlimited else (
                settings.ai_guest_limit if user["is_anonymous"] else settings.ai_account_monthly_limit
            ),
            "p_day_limit": None if unlimited else settings.ai_global_daily_limit,
            "p_minute_limit": None if unlimited else settings.ai_global_minute_limit,
            "p_ip_limit": None if unlimited else settings.ai_ip_daily_limit,
        },
    )
    if not reservation["allowed"]:
        duplicate = reservation.get("code") == "duplicate"
        raise HTTPException(
            409 if duplicate else 429,
            "Yêu cầu đã được xử lý; kiểm tra bản nháp trước đó."
            if duplicate
            else "Đã hết lượt hoặc AI đang bận. Bạn vẫn có thể nhập thủ công.",
        )
    # Reservation is committed before calling Gemini, including failed attempts.
    # Gemini's bounded failover reserves each attempt in its provider pool.
    # OpenAI posts one request and does not retry ambiguous billed generations.
    result = await gateway.generate(body.text, user["id"])
    return {
        "draft": result.model_dump(),
        "usage": {
            "remaining": None if unlimited else reservation["remaining"],
            "limit": None if unlimited else reservation["limit"],
            "guest": user["is_anonymous"],
            "unlimited": unlimited,
        },
    }
