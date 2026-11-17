import asyncio
import hashlib
import json

from fastapi import APIRouter, Depends, HTTPException, Request

from app.api.dependencies import identity
from app.core.runtime import client_address
from app.schemas.attempt_analysis import AnalyzeAttemptRequest
from app.schemas.models import ExplainBatchRequest, ExtractRequest, PageExtractRequest, ResultsReadRequest
from app.services import explain_tickets
from app.services.attempt_analysis import generate_analysis, load_snapshot, snapshot_hash

router = APIRouter()


@router.post("/api/v1/ai/analyze-attempt")
async def analyze_attempt(body: AnalyzeAttemptRequest, request: Request, user=Depends(identity)):
    settings = request.app.state.settings
    access = request.state.ai_access
    if user["is_anonymous"]:
        raise HTTPException(403, "Đăng nhập để phân tích lần làm đã đồng bộ của tài khoản.")
    if not access.enabled:
        raise access.denied()
    if not settings.attempt_analysis_ready:
        raise HTTPException(503, "AI gợi ý ôn tập chưa được cấu hình. Bạn vẫn có thể xem thống kê và ôn Sổ tay.")
    gateway = request.app.state.gateway
    snapshot = await load_snapshot(gateway, user["id"], body)
    reservation, unlimited = await reserve_ai(request, user, access, body.request_id, None, snapshot_hash(snapshot))
    # Reservation is committed before generation; OpenAI gets exactly one request.
    report = await generate_analysis(gateway, snapshot, user["id"])
    return {"report": report, "usage": {"remaining": None if unlimited else reservation["remaining"],
            "limit": None if unlimited else reservation["limit"], "guest": False, "unlimited": unlimited,
            **(access.usage_fields() if settings.ai_access_managed else {})}}


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
        raise access.denied()
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
    reservation, unlimited = await reserve_ai(request, user, access, body.request_id, body.captcha_token, input_hash.hexdigest())
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


# A capture of about ten screenshots is sent as at most four page requests (three images each) sharing one batch id.
AI_BATCH_MAX_REQUESTS = 4
AI_BATCH_TTL_SECONDS = 3600


async def reserve_ai(request: Request, user: dict, access, request_id, captcha_token: str | None, input_hash: str,
                     batch_id=None):
    """Count one AI request against every quota before generation; a refused request raises.

    With a batch id, only the first request of that batch is charged to the account. Later requests of the same
    batch still count against the shared minute/day/IP safety caps, and a batch accepts a limited number of requests.
    """
    settings, gateway = request.app.state.settings, request.app.state.gateway
    unlimited = access.unlimited
    if user["is_anonymous"]:
        await gateway.verify_captcha(captcha_token)
    parameters = {
        "p_owner_id": user["id"],
        "p_guest": user["is_anonymous"],
        "p_request_id": str(request_id),
        "p_input_hash": input_hash,
        "p_ip_hash": gateway.ip_hash(client_address(request.scope, settings)),
        # These RPC parameters are service-role only. NULL leaves the
        # corresponding cap unset while still recording usage/idempotency.
        "p_user_limit": access.limit,
        "p_day_limit": None if unlimited else settings.ai_global_daily_limit,
        "p_minute_limit": None if unlimited else settings.ai_global_minute_limit,
        "p_ip_limit": None if unlimited else settings.ai_ip_daily_limit,
    }
    if batch_id is None:
        reservation = await gateway.rpc("reserve_ai_request", parameters)
    else:
        reservation = await gateway.rpc("reserve_ai_batch_request", {
            **parameters, "p_batch_id": str(batch_id),
            "p_max_chunks": AI_BATCH_MAX_REQUESTS, "p_ttl_seconds": AI_BATCH_TTL_SECONDS,
        })
    if not reservation["allowed"]:
        duplicate = reservation.get("code") == "duplicate"
        if duplicate:
            raise HTTPException(409, "Yêu cầu này đã được tiếp nhận trước đó. Kiểm tra bản nháp đã có trước khi gửi lại.")
        if reservation.get("code") == "batch_full":
            raise HTTPException(429, f"Một lần chụp đọc tối đa {AI_BATCH_MAX_REQUESTS} lượt ảnh (khoảng 10 ảnh). Hãy bắt đầu lần chụp mới để đọc phần còn lại.")
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
    return reservation, unlimited


@router.post("/api/v1/ai/extract-page")
async def extract_page(body: PageExtractRequest, request: Request, user=Depends(identity)):
    """Read several wrong questions from screenshots of an on-screen test; one request counts as one AI use."""
    settings = request.app.state.settings
    if not settings.ai_ready:
        message = "Chức năng phân tích AI đang được tắt." if not settings.ai_enabled else "Cấu hình dịch vụ phân tích AI chưa đầy đủ."
        raise HTTPException(503, message + " Bạn vẫn có thể ghi tay.")
    access = request.state.ai_access
    if not access.enabled:
        raise access.denied()
    questions = [question.model_dump() for question in body.questions]
    input_hash = hashlib.sha256(json.dumps(questions, separators=(",", ":")).encode())
    for image in body.images:
        input_hash.update(b"\0" + hashlib.sha256(image.dataUrl.encode()).digest())
    reservation, unlimited = await reserve_ai(request, user, access, body.request_id, body.captcha_token, input_hash.hexdigest(),
                                              body.batch_id)
    found, missing = await request.app.state.gateway.generate_page(questions, [image.dataUrl for image in body.images], user["id"])
    # The explanations for these questions are written next, without counting another use.
    ticket = explain_tickets.issue(settings.rate_limit_secret, user["id"], str(body.request_id), {
        number: explain_tickets.item_digest(number, draft.question or "", draft.options, draft.context or "")
        for number, draft in found if draft.part != 1 and draft.question and len(draft.options) >= 2
    }) if settings.rate_limit_secret and found else None
    return {
        "items": [{"number": number, "draft": {**draft.model_dump(),
                   "userChoiceState": "CHOSEN" if draft.userChoice else "UNKNOWN"}} for number, draft in found],
        "missing": missing,
        "explainTicket": ticket,
        "usage": {
            "remaining": None if unlimited else reservation["remaining"],
            "limit": None if unlimited else reservation["limit"],
            "guest": user["is_anonymous"],
            "unlimited": unlimited,
            **(access.usage_fields() if settings.ai_access_managed else {}),
        },
    }


@router.post("/api/v1/ai/read-results")
async def read_results(body: ResultsReadRequest, request: Request, user=Depends(identity)):
    """Read which questions a result page marks wrong or skipped; one request counts as one AI use."""
    settings = request.app.state.settings
    if not settings.ai_ready:
        raise HTTPException(503, "Chức năng phân tích AI đang tắt hoặc chưa cấu hình. Bạn vẫn có thể chạm vào các câu sai.")
    access = request.state.ai_access
    if not access.enabled:
        raise access.denied()
    input_hash = hashlib.sha256(b"results")
    for image in body.images:
        input_hash.update(hashlib.sha256(image.dataUrl.encode()).digest())
    reservation, unlimited = await reserve_ai(request, user, access, body.request_id, body.captcha_token, input_hash.hexdigest())
    wrong, skipped, scores, timing = await request.app.state.gateway.read_results([image.dataUrl for image in body.images], user["id"])
    return {
        "wrong": wrong,
        "skipped": skipped,
        "scores": scores,
        "timing": timing,
        "usage": {
            "remaining": None if unlimited else reservation["remaining"],
            "limit": None if unlimited else reservation["limit"],
            "guest": user["is_anonymous"],
            "unlimited": unlimited,
            **(access.usage_fields() if settings.ai_access_managed else {}),
        },
    }


@router.post("/api/v1/ai/explain-batch")
async def explain_batch(body: ExplainBatchRequest, request: Request, user=Depends(identity)):
    """Explain questions a screenshot reading already counted; the ticket stands in for a new AI use."""
    settings = request.app.state.settings
    if not settings.ai_ready or not settings.rate_limit_secret:
        raise HTTPException(503, "Chức năng phân tích AI đang tắt hoặc chưa cấu hình.")
    access = request.state.ai_access
    if not access.enabled:
        raise access.denied()
    ticket = explain_tickets.verify(settings.rate_limit_secret, body.ticket, user["id"])
    if ticket is None:
        raise HTTPException(403, "Lượt viết lời giải kèm ảnh đã hết hạn hoặc không hợp lệ. Bấm Giải thích với AI trên thẻ để dùng một lượt mới.",
                            headers={"X-Error-Code": "EXPLAIN_TICKET_INVALID"})
    ledger = request.app.state.ticket_uses
    for item in body.items:
        digest = explain_tickets.item_digest(item.number, item.input.question, item.input.options, item.input.context)
        if ticket["d"].get(str(item.number)) != digest:
            raise HTTPException(403, "Nội dung câu đã khác với lúc đọc ảnh. Bấm Giải thích với AI trên thẻ để dùng một lượt mới.",
                                headers={"X-Error-Code": "EXPLAIN_TICKET_CONTENT_CHANGED"})
    gateway = request.app.state.gateway

    async def generate(item):
        learner = item.input
        try:
            result = await gateway.generate(learner.as_text(), user["id"], source_options=learner.options,
                                            source_answer=learner.sourceAnswer, pin_question=True)
        except HTTPException:
            return None
        # Match the frontend's useful-explanation contract. An empty structured
        # answer must remain retryable, not become a cached unusable success.
        if result.explanation is None or not result.explanation.quickTip.strip():
            return None
        draft = result.model_dump()
        selected = next((option for option in result.options if option.startswith(f"({learner.userChoice})")), "")
        draft.update(part=learner.part, userChoice=learner.userChoice, userChoiceState=learner.userChoiceState, userReason=learner.userReason,
                     userMistake=selected if learner.userChoiceState == "CHOSEN" else "Bỏ trống" if learner.userChoiceState == "BLANK" else "Không nhớ")
        return draft

    results = await asyncio.gather(*(ledger.run(
        user["id"], ticket["i"], item.number, ticket["e"], str(body.request_id),
        hashlib.sha256(item.input.as_text().encode()).hexdigest(), lambda item=item: generate(item),
    ) for item in body.items))
    return {
        "items": [{"number": result["number"], "draft": result["draft"]} for result in results if result["draft"] is not None],
        "failed": [result["number"] for result in results if result["draft"] is None],
        "retry": [{key: result[key] for key in ("number", "status", "remainingAttempts")} for result in results],
    }
