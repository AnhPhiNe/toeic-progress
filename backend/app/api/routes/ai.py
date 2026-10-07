import hashlib

from fastapi import APIRouter, Depends, HTTPException, Request

from app.api.dependencies import identity
from app.schemas.models import ExtractRequest

router = APIRouter()


@router.get("/api/v1/ai/usage")
async def usage(request: Request, user=Depends(identity)):
    settings = request.app.state.settings
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
    gateway = request.app.state.gateway
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
            "p_user_limit": settings.ai_guest_limit if user["is_anonymous"] else settings.ai_account_monthly_limit,
            "p_day_limit": settings.ai_global_daily_limit,
            "p_minute_limit": settings.ai_global_minute_limit,
            "p_ip_limit": settings.ai_ip_daily_limit,
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
    # One user reservation covers bounded model failover. Every outbound attempt
    # separately reserves shared project/model RPM/TPM/RPD capacity.
    result = await gateway.generate(body.text)
    return {
        "draft": result.model_dump(),
        "usage": {
            "remaining": reservation["remaining"],
            "limit": reservation["limit"],
            "guest": user["is_anonymous"],
        },
    }
