import hashlib

from fastapi import APIRouter, Depends, HTTPException, Request

from app.api.dependencies import identity
from app.core.runtime import client_address
from app.schemas.models import ExtractRequest

router = APIRouter()


@router.get("/api/v1/ai/usage")
async def usage(request: Request, user=Depends(identity)):
    settings = request.app.state.settings
    access = request.state.ai_access
    extra = access.usage_fields() if settings.ai_access_managed else {}
    if not access.enabled:
        return {"remaining": 0, "limit": access.limit, "guest": user["is_anonymous"], **extra}
    if access.unlimited:
        return {"remaining": None, "limit": None, "guest": False, "unlimited": True, **extra}
    result = await request.app.state.gateway.rpc(
        "get_ai_usage",
        {
            "p_owner_id": user["id"],
            "p_guest": user["is_anonymous"],
            "p_limit": access.limit,
        },
    )
    return {**result, **extra}


@router.post("/api/v1/ai/extract")
async def extract(body: ExtractRequest, request: Request, user=Depends(identity)):
    settings = request.app.state.settings
    if not settings.ai_ready:
        message = "Chức năng phân tích AI đang được tắt." if not settings.ai_enabled else "Cấu hình dịch vụ phân tích AI chưa đầy đủ."
        raise HTTPException(503, message + " Bạn vẫn có thể lưu thủ công.")
    access = request.state.ai_access
    if not access.enabled:
        raise HTTPException(403, access.message)
    gateway = request.app.state.gateway
    source_images = [image.dataUrl for image in body.images]
    if body.sourceImageIds:
        if user["is_anonymous"]:
            raise HTTPException(403, "Đăng nhập Google để lưu và dùng lại ảnh nguồn.")
        source_images = await gateway.source_images.load(user["id"], body.sourceImageIds)
    extraction_text = body.input.as_text() if body.input is not None else body.text
    input_hash = hashlib.sha256(extraction_text.encode())
    for image in source_images:
        input_hash.update(b"\0" + hashlib.sha256(image.encode()).digest())
    unlimited = access.unlimited
    if user["is_anonymous"]:
        await gateway.verify_captcha(body.captcha_token)
    reservation = await gateway.rpc(
        "reserve_ai_request",
        {
            "p_owner_id": user["id"],
            "p_guest": user["is_anonymous"],
            "p_request_id": str(body.request_id),
            "p_input_hash": input_hash.hexdigest(),
            "p_ip_hash": gateway.ip_hash(client_address(request.scope, settings)),
            # These RPC parameters are service-role only. NULL leaves the
            # corresponding cap unset while still recording usage/idempotency.
            "p_user_limit": access.limit,
            "p_day_limit": None if unlimited else settings.ai_global_daily_limit,
            "p_minute_limit": None if unlimited else settings.ai_global_minute_limit,
            "p_ip_limit": None if unlimited else settings.ai_ip_daily_limit,
        },
    )
    if not reservation["allowed"]:
        duplicate = reservation.get("code") == "duplicate"
        if duplicate:
            raise HTTPException(409, "Yêu cầu này đã được tiếp nhận trước đó. Kiểm tra bản nháp đã có trước khi gửi lại.")
        explanation = await gateway.explain_ai_limit(
            user["id"], user["is_anonymous"], gateway.ip_hash(client_address(request.scope, settings)),
            access.limit,
        )
        detail, delay = explanation or (
            "Ứng dụng đã chặn yêu cầu do giới hạn lượt phân tích AI, nhưng chưa đọc được hạn mức cụ thể. "
            "Bạn vẫn có thể lưu thủ công; liên hệ hỗ trợ nếu lỗi tiếp tục.", None,
        )
        raise HTTPException(
            429, detail, headers={"Retry-After": str(delay)} if delay else None,
        )
    # Reservation is committed before generation, including failed attempts.
    # OpenAI posts one request and does not retry ambiguous billed generations.
    if body.input is not None:
        result = await gateway.generate(extraction_text, user["id"],
                                        source_options=body.input.options or None, source_answer=body.input.sourceAnswer,
                                        images=source_images, persistent_images=bool(body.sourceImageIds))
    else:
        result = await gateway.generate(extraction_text, user["id"])
    draft = result.model_dump()
    if body.input is not None:
        learner = body.input
        selected = next((option for option in result.options if option.startswith(f"({learner.userChoice})")), "")
        description = selected if learner.userChoiceState == "CHOSEN" else "Bỏ trống" if learner.userChoiceState == "BLANK" else "Không nhớ"
        draft.update(userChoice=learner.userChoice, userChoiceState=learner.userChoiceState,
                     userReason=learner.userReason, userMistake=description + (" - " + learner.userReason if learner.userReason.strip() else ""))
        if learner.part is not None:
            draft["part"] = learner.part
        if learner.errorCategory is not None:
            draft["category"] = learner.errorCategory
    return {
        "draft": draft,
        "usage": {
            "remaining": None if unlimited else reservation["remaining"],
            "limit": None if unlimited else reservation["limit"],
            "guest": user["is_anonymous"],
            "unlimited": unlimited,
            **(access.usage_fields() if settings.ai_access_managed else {}),
        },
    }
