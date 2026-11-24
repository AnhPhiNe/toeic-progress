import asyncio
import hashlib
import json

from fastapi import APIRouter, Depends, HTTPException, Request

from app.api.dependencies import ai_authorized, identity
from app.core.image_input import MAX_IMAGE_BYTES, MAX_PAGE_IMAGE_BYTES, validate_images_async
from app.core.runtime import client_address
from app.integrations.openai_provider import PrepaidBudget, explanation_cost, model_cost, prepaid_budget, source_part
from app.schemas.attempt_analysis import AnalyzeAttemptRequest
from app.schemas.models import ExplainBatchRequest, ExtractRequest, PageExtractRequest, ResultsReadRequest
from app.services import explain_tickets
from app.services.attempt_analysis import generate_analysis, load_snapshot, snapshot_hash

router = APIRouter()


@router.post("/api/v1/ai/analyze-attempt")
async def analyze_attempt(body: AnalyzeAttemptRequest, request: Request, user=Depends(ai_authorized)):
    settings = request.app.state.settings
    access = request.state.ai_access
    gateway = request.app.state.gateway
    snapshot = await load_snapshot(gateway, user["id"], body)
    reservation, unlimited = await reserve_ai(
        request, user, access, body.request_id, None, snapshot_hash(snapshot),
        provider_cost=model_cost(settings.openai_advice_model, settings.openai_advice_reasoning_effort, 0),
    )
    # Reservation is committed before generation; OpenAI gets exactly one request.
    report = await generate_analysis(gateway, snapshot, user["id"], plan=access.plan)
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
            "p_user_id": user["id"],
            "p_guest": user["is_anonymous"],
            "p_limit": access.limit,
        },
    )
    return {**result, **extra}


@router.post("/api/v1/ai/extract")
async def extract(body: ExtractRequest, request: Request, user=Depends(ai_authorized)):
    settings = request.app.state.settings
    access = request.state.ai_access
    gateway = request.app.state.gateway
    source_images = [image.dataUrl for image in body.images]
    if source_images:
        try:
            await validate_images_async(source_images, MAX_IMAGE_BYTES)
        except ValueError as error:
            raise HTTPException(422, str(error)) from error
    if body.sourceImageIds:
        if user["is_anonymous"]:
            raise HTTPException(403, "Đăng nhập Google để lưu và dùng lại ảnh nguồn.")
        source_images = await gateway.source_images.load(user["id"], body.sourceImageIds)
    extraction_text = body.input.as_text() if body.input is not None else body.text
    input_hash = hashlib.sha256(extraction_text.encode())
    for image in source_images:
        input_hash.update(b"\0" + hashlib.sha256(image.encode()).digest())
    reservation, unlimited = await reserve_ai(
        request, user, access, body.request_id, body.captcha_token, input_hash.hexdigest(),
        provider_cost=explanation_cost(source_part(extraction_text), bool(source_images)),
    )
    # Reservation is committed before generation, including failed attempts.
    # OpenAI posts one request and does not retry ambiguous billed generations.
    if body.input is not None:
        result = await gateway.generate(extraction_text, user["id"],
                                        source_options=body.input.options or None, source_answer=body.input.sourceAnswer,
                                        images=source_images, persistent_images=bool(body.sourceImageIds),
                                        pin_question=bool(body.input.savedCard),
                                        plan=access.plan)
    else:
        result = await gateway.generate(extraction_text, user["id"], plan=access.plan)
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


# A capture is read as one request per question group, sharing one batch id.
# Cap batch chunks and cumulative ticketed questions to prevent OpenAI cost amplification.
AI_BATCH_MAX_REQUESTS = 4
AI_BATCH_MAX_EXPLAIN_QUESTIONS = 16
AI_BATCH_TTL_SECONDS = 3600


async def prepay_provider_budget(request: Request, user: dict, access, cost: int) -> None:
    """Reserve the provider budget for the OpenAI calls this request will make, before anything else is spent.

    A refusal raises 429 while the learner's AI use and explanation attempts are still untouched; the later OpenAI
    calls draw from this credit instead of reserving again. Units reserved for a request the quota then refuses are
    not returned, which the per-owner daily cap bounds.
    """
    settings = request.app.state.settings
    credit = PrepaidBudget(0)
    prepaid_budget.set(credit)
    if cost <= 0 or not settings.ai_provider_budget_enabled or not settings.database_ready:
        return
    await request.app.state.gateway.reserve_provider_budget(user["id"], cost=cost, plan=access.plan)
    credit.units = cost


async def reserve_ai(request: Request, user: dict, access, request_id, captcha_token: str | None, input_hash: str,
                     batch_id=None, *, provider_cost: int):
    """Count one AI request against every quota before generation; a refused request raises.

    The provider budget (`provider_cost` units) is reserved first, so a budget refusal never spends the AI use.
    With a batch id, only the first request of that batch is charged to the account. Later requests of the same
    batch still count against the shared minute/day/IP safety caps, and a batch accepts a limited number of requests.
    """
    settings, gateway = request.app.state.settings, request.app.state.gateway
    unlimited = access.unlimited
    ip_hash = gateway.ip_hash(client_address(request.scope, settings))
    if user["is_anonymous"]:
        await gateway.verify_captcha(captcha_token)
    # Pre-check batch state & learner/shared quota (read-only) before reserving shared provider budget
    # so an exhausted account or full batch cannot burn global provider_minute/day caps without spending a use.
    if settings.ai_provider_budget_enabled and settings.database_ready:
        active_batch = False
        if batch_id is not None:
            active_batch, batch_full = await gateway.ai_batch_state(
                user["id"], str(batch_id), AI_BATCH_MAX_REQUESTS, AI_BATCH_TTL_SECONDS
            )
            if batch_full:
                raise HTTPException(
                    429,
                    f"Một lần chụp đọc tối đa {AI_BATCH_MAX_REQUESTS} nhóm câu. Hãy bắt đầu lần chụp mới để đọc phần còn lại.",
                )
        if not unlimited:
            exhausted = await gateway.explain_ai_limit(
                user["id"], user["is_anonymous"], ip_hash, access.limit, include_account=not active_batch
            )
            if exhausted is not None:
                detail, delay = exhausted
                raise HTTPException(429, detail, headers={"Retry-After": str(delay)} if delay else None)
    await prepay_provider_budget(request, user, access, provider_cost)
    parameters = {
        "p_user_id": user["id"],
        "p_guest": user["is_anonymous"],
        "p_request_id": str(request_id),
        "p_input_hash": input_hash,
        "p_ip_hash": ip_hash,
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
            raise HTTPException(429, f"Một lần chụp đọc tối đa {AI_BATCH_MAX_REQUESTS} nhóm câu. Hãy bắt đầu lần chụp mới để đọc phần còn lại.")
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
async def extract_page(body: PageExtractRequest, request: Request, user=Depends(ai_authorized)):
    """Read several wrong questions from screenshots of an on-screen test; one request counts as one AI use."""
    settings = request.app.state.settings
    access = request.state.ai_access
    try:
        await validate_images_async(
            [image.dataUrl for image in body.context_images] + [image.dataUrl for image in body.images],
            MAX_PAGE_IMAGE_BYTES,
        )
    except ValueError as error:
        raise HTTPException(422, str(error)) from error
    questions = [question.model_dump() for question in body.questions]
    input_hash = hashlib.sha256(json.dumps(questions, separators=(",", ":")).encode())
    input_hash.update(json.dumps(body.slices).encode())
    for image in body.context_images:
        input_hash.update(b"\1" + hashlib.sha256(image.dataUrl.encode()).digest())
    for image in body.images:
        input_hash.update(b"\0" + hashlib.sha256(image.dataUrl.encode()).digest())
    reservation, unlimited = await reserve_ai(
        request, user, access, body.request_id, body.captcha_token, input_hash.hexdigest(), body.batch_id,
        provider_cost=request.app.state.gateway.openai.page_cost(body.photoMode, len(body.images) + len(body.context_images)),
    )
    found, missing, rejection_reasons = await request.app.state.gateway.generate_page(
        questions,
        [image.dataUrl for image in body.images],
        user["id"],
        [image.dataUrl for image in body.context_images],
        body.slices,
        photo_mode=body.photoMode,
        plan=access.plan,
    )
    # The explanations for these questions are written next, without counting another use,
    # bounded across all chunks of a batch_id to prevent cost amplification.
    ticket = None
    explain_numbers: list[int] = []
    if settings.rate_limit_secret and found:
        eligible = [
            (number, draft)
            for number, draft in found
            if draft.part != 1 and draft.question and len(draft.options) >= 2
        ]
        if eligible and body.batch_id is not None:
            quota = await request.app.state.gateway.rpc(
                "reserve_batch_explain_quota",
                {
                    "p_user_id": user["id"],
                    "p_batch_id": str(body.batch_id),
                    "p_count": len(eligible),
                    "p_max_questions": AI_BATCH_MAX_EXPLAIN_QUESTIONS,
                },
            )
            granted = int(quota.get("granted", 0)) if isinstance(quota, dict) else 0
            eligible = eligible[: max(0, granted)]
        if eligible:
            explain_numbers = [number for number, _ in eligible]
            ticket = explain_tickets.issue(settings.rate_limit_secret, user["id"], str(body.request_id), {
                number: explain_tickets.item_digest(number, draft.question or "", draft.options, draft.context or "")
                for number, draft in eligible
            })
    return {
        "items": [{"number": number, "draft": {**draft.model_dump(),
                   "userChoiceState": "CHOSEN" if draft.userChoice else "BLANK"}}
                  for number, draft in found],
        "missing": missing,
        "rejectionReasons": rejection_reasons,
        "explainTicket": ticket,
        # Only these numbers may be sent to explain-batch with this ticket (at most
        # AI_BATCH_MAX_EXPLAIN_QUESTIONS per capture); the rest keep their cards unexplained.
        "explainNumbers": explain_numbers,
        "explainLimit": AI_BATCH_MAX_EXPLAIN_QUESTIONS,
        "usage": {
            "remaining": None if unlimited else reservation["remaining"],
            "limit": None if unlimited else reservation["limit"],
            "guest": user["is_anonymous"],
            "unlimited": unlimited,
            **(access.usage_fields() if settings.ai_access_managed else {}),
        },
    }


@router.post("/api/v1/ai/read-results")
async def read_results(body: ResultsReadRequest, request: Request, user=Depends(ai_authorized)):
    """Read which questions a result page marks wrong or skipped; one request counts as one AI use."""
    settings = request.app.state.settings
    access = request.state.ai_access
    try:
        await validate_images_async([image.dataUrl for image in body.images], MAX_PAGE_IMAGE_BYTES)
    except ValueError as error:
        raise HTTPException(422, str(error)) from error
    input_hash = hashlib.sha256(b"results")
    for image in body.images:
        input_hash.update(hashlib.sha256(image.dataUrl.encode()).digest())
    reservation, unlimited = await reserve_ai(
        request, user, access, body.request_id, body.captcha_token, input_hash.hexdigest(),
        provider_cost=request.app.state.gateway.openai.results_cost(body.photoMode, len(body.images)),
    )
    wrong, skipped, scores, timing = await request.app.state.gateway.read_results(
        [image.dataUrl for image in body.images],
        user["id"],
        photo_mode=body.photoMode,
        plan=access.plan,
    )
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
async def explain_batch(body: ExplainBatchRequest, request: Request, user=Depends(ai_authorized)):
    """Explain questions a screenshot reading already counted; the ticket stands in for a new AI use."""
    settings = request.app.state.settings
    access = request.state.ai_access
    if user["is_anonymous"]:
        raise HTTPException(403, "Đăng nhập Google để dùng tính năng giải thích theo mẻ.")
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
    # Reserve the provider budget only for items not already settled on this worker:
    # avoids burning global provider_minute budget on replays while still protecting ticket attempts.
    uncached_cost = sum(
        explanation_cost(item.input.part)
        for item in body.items
        if not ledger.is_settled(user["id"], ticket["i"], item.number)
    )
    await prepay_provider_budget(request, user, access, uncached_cost)
    gateway = request.app.state.gateway

    async def generate(item):
        learner = item.input
        try:
            result = await gateway.generate(learner.as_text(), user["id"], source_options=learner.options,
                                            source_answer=learner.sourceAnswer, pin_question=True,
                                            endpoint="explain_batch", plan=access.plan)
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
