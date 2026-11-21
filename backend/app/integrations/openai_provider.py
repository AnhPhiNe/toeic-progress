"""Single-attempt TOEIC extraction through the official OpenAI Responses API."""

import asyncio
import json
import logging
import math
import re
import time

import httpx
from fastapi import HTTPException
from pydantic import ValidationError

from app.core.config import Settings
from app.core.runtime import request_id_context
from app.schemas.models import (
    RESULTS_OUTPUT_SCHEMA,
    MistakeDraft,
    OpenAIDraftOutput,
    OpenAIPageExplanationOutput,
    OpenAIPageItem,
    OpenAIPageOutput,
    OpenAIPasteOutput,
    OpenAIResultsOutput,
    PageMistakeDraft,
    page_output_schema,
    part_of_question,
)
from app.services.ai_grounding import ground_draft, ground_pasted_draft
from app.services.toeic_prompt import (
    FREEFORM_INPUT_INSTRUCTIONS,
    OPENAI_TOEIC_PROMPT,
    PAGE_READING_PROMPT,
    PART1_IMAGE_INSTRUCTIONS,
    PART7_IMAGE_INSTRUCTIONS,
    PERSISTENT_IMAGE_INSTRUCTIONS,
    RESULTS_READING_PROMPT,
)

logger = logging.getLogger("toeic.runtime")


def schema_issues(error: ValidationError) -> list[dict]:
    """Log only known field names/error codes, never source values or raw messages."""
    fields = set(OpenAIPasteOutput.model_fields) | {"label", "pos", "meaning", "quickTip", "translation",
        "questionType", "evidence", "paraphrase", "analysis", "keyVocabulary"}
    rules = {
        "Value error, AI options must have an A-D label and nonempty text": "option_labels",
        "Value error, AI option labels must be unique": "duplicate_option_labels",
        "Value error, Each AI option must have exactly one meaning": "option_meaning_coverage",
        "Value error, AI option meanings must not be blank": "empty_option_meanings",
    }
    return [{"field": ".".join(str(value) if isinstance(value, int) or value in fields else "unknown_field"
                               for value in issue["loc"]) or "draft",
             "code": issue["type"], "rule": rules.get(issue["msg"], "field_validation")}
            for issue in error.errors(include_input=False, include_context=False)[:8]]


class OpenAIError(HTTPException):
    """A failed OpenAI request. `code` lets a caller replace the wording; the response is unchanged otherwise."""

    def __init__(self, status_code: int, detail: str, code: str, headers: dict | None = None):
        super().__init__(status_code, detail, headers=headers)
        self.code = code


class OpenAIProvider:
    def __init__(self, settings: Settings, client: httpx.AsyncClient, *, budget_guard=None, usage_recorder=None):
        self.settings, self.client = settings, client
        self.budget_guard = budget_guard
        self.usage_recorder = usage_recorder

    async def _record_usage(self, owner_id: str | None, endpoint: str, model: str, effort: str,
                            input_tokens: int, cached_tokens: int, output_tokens: int,
                            duration_ms: int, status: str) -> None:
        if self.usage_recorder is None:
            return
        try:
            await self.usage_recorder(
                owner_id=owner_id, endpoint=endpoint, model=model, effort=effort,
                input_tokens=input_tokens, cached_tokens=cached_tokens, output_tokens=output_tokens,
                duration_ms=duration_ms, status=status,
            )
        except Exception as error:  # noqa: BLE001 - ledger recording is strictly best-effort
            logger.warning(json.dumps({
                "event": "ai_usage_record_failed", "request_id": request_id_context.get(),
                "endpoint": endpoint, "error_type": type(error).__name__,
            }))

    async def _respond(self, key: str, payload: dict, timeout: float, *,
                       endpoint: str = "extract", owner_id: str | None = None) -> str:
        """One billed attempt: guard provider budget, send the request and return joined output text. Never retried."""
        if self.budget_guard is not None:
            await self.budget_guard(owner_id)
        model = str(payload.get("model") or self.settings.openai_model)
        effort = str((payload.get("reasoning") or {}).get("effort") or "")
        started = time.monotonic()
        try:
            async with asyncio.timeout(timeout):
                response = await self.client.post(
                    "https://api.openai.com/v1/responses",
                    headers={"Authorization": f"Bearer {key}"}, json=payload,
                    timeout=timeout,
                )
        except (httpx.HTTPError, TimeoutError) as error:
            duration_ms = round((time.monotonic() - started) * 1000, 2)
            timed_out = isinstance(error, (httpx.TimeoutException, TimeoutError))
            logger.warning(json.dumps({
                "event": "openai_transport_error", "request_id": request_id_context.get(),
                "model": model, "effort": effort, "endpoint": endpoint,
                "error_type": type(error).__name__, "duration_ms": duration_ms,
            }))
            await self._record_usage(owner_id, endpoint, model, effort, 0, 0, 0, int(duration_ms),
                                     "timeout" if timed_out else "connection")
            # A timed-out request may already be generating a billed result.
            # Never automatically retry a possibly billed generation or change keys.
            message = (
                "OpenAI phản hồi quá thời gian chờ; chưa nhận được kết quả phân tích."
                if timed_out
                else "Kết nối tới OpenAI bị gián đoạn; chưa nhận được kết quả phân tích."
            )
            raise OpenAIError(503, message + " Nội dung đang nhập vẫn được giữ. Bạn có thể thử lại hoặc lưu thủ công.",
                              "TIMEOUT" if timed_out else "CONNECTION") from error
        duration_ms = round((time.monotonic() - started) * 1000, 2)
        logger.info(json.dumps({
            "event": "openai_attempt", "request_id": request_id_context.get(), "model": model,
            "effort": effort, "endpoint": endpoint, "status": response.status_code, "duration_ms": duration_ms,
        }))
        if not response.is_success:
            await self._record_usage(owner_id, endpoint, model, effort, 0, 0, 0, int(duration_ms),
                                     f"http_{response.status_code}")
            if response.status_code == 429:
                try:
                    quota = response.json().get("error", {})
                    billing = quota.get("code") in ("insufficient_quota", "billing_hard_limit_reached", "budget_exceeded")
                except (ValueError, AttributeError):
                    billing = False
                if billing:
                    raise OpenAIError(503, "Dịch vụ OpenAI đã hết ngân sách hoặc hạn mức thanh toán. "
                                      "Đây không phải giới hạn lượt của tài khoản bạn. Bạn vẫn có thể lưu thủ công.", "BILLING")
                try:
                    delay = max(1, min(86400, math.ceil(float(response.headers.get("Retry-After", "60")))))
                except (ValueError, OverflowError):
                    delay = 60
                raise OpenAIError(429, "OpenAI đang giới hạn tốc độ xử lý. Nội dung đang nhập vẫn được giữ.", "RATE",
                                  headers={"Retry-After": str(delay)})
            if response.status_code in (401, 403):
                raise OpenAIError(503, "Ứng dụng chưa được OpenAI cho phép xử lý yêu cầu. "
                                  "Cần kiểm tra cấu hình dịch vụ; bạn vẫn có thể lưu thủ công.", "ACCESS")
            if response.status_code >= 500:
                raise OpenAIError(503, "Dịch vụ OpenAI tạm gặp sự cố. Hãy thử lại sau hoặc lưu thủ công.", "UNAVAILABLE")
            raise OpenAIError(503, "OpenAI từ chối yêu cầu phân tích. "
                              "Cần kiểm tra cấu hình dịch vụ; bạn vẫn có thể lưu thủ công.", "CONFIG")
        value = response.json()
        usage = value.get("usage") or {}
        input_tokens = usage.get("input_tokens") if isinstance(usage.get("input_tokens"), int) and not isinstance(usage.get("input_tokens"), bool) else 0
        output_tokens = usage.get("output_tokens") if isinstance(usage.get("output_tokens"), int) and not isinstance(usage.get("output_tokens"), bool) else 0
        details = usage.get("input_tokens_details") if isinstance(usage.get("input_tokens_details"), dict) else {}
        cached_tokens = details.get("cached_tokens") if isinstance(details.get("cached_tokens"), int) and not isinstance(details.get("cached_tokens"), bool) else 0
        # Record counts only. No raw output, prompt, key, email or headers.
        logger.info(json.dumps({
            "event": "openai_usage", "request_id": request_id_context.get(),
            "model": model, "effort": effort, "endpoint": endpoint,
            **{name: usage[name] for name in ("input_tokens", "output_tokens")
               if isinstance(usage.get(name), int) and not isinstance(usage[name], bool)},
            **({"cached_tokens": cached_tokens} if cached_tokens else {}),
        }))
        if value.get("status") != "completed":
            await self._record_usage(owner_id, endpoint, model, effort, input_tokens, cached_tokens, output_tokens,
                                     int(duration_ms), "incomplete")
            raise ValueError("Incomplete output")
        chunks = []
        for item in value.get("output", []):
            if item.get("type") != "message" or item.get("role") != "assistant":
                continue
            if item.get("status") != "completed":
                await self._record_usage(owner_id, endpoint, model, effort, input_tokens, cached_tokens, output_tokens,
                                         int(duration_ms), "incomplete_message")
                raise ValueError("Incomplete message")
            for block in item.get("content", []):
                if block.get("type") == "refusal":
                    await self._record_usage(owner_id, endpoint, model, effort, input_tokens, cached_tokens, output_tokens,
                                             int(duration_ms), "refused")
                    raise ValueError("Refused output")
                if block.get("type") == "output_text":
                    chunks.append(block["text"])
        if not chunks:
            await self._record_usage(owner_id, endpoint, model, effort, input_tokens, cached_tokens, output_tokens,
                                     int(duration_ms), "empty")
            raise ValueError("Missing output")
        await self._record_usage(owner_id, endpoint, model, effort, input_tokens, cached_tokens, output_tokens,
                                 int(duration_ms), "ok")
        return "".join(chunks)

    async def generate(self, text: str, safety_identifier: str | None = None, *,
                       source_options: list[str] | None = None, source_answer: str | None = None,
                       images: list[str] | None = None, persistent_images: bool = False, pin_question: bool = False,
                       endpoint: str = "extract", owner_id: str | None = None) -> MistakeDraft:
        key = self.settings.openai_api_key.get_secret_value().strip()
        if not key:
            raise HTTPException(503, "AI chưa có key OpenAI được cấu hình.")
        try:
            source = json.loads(text)
        except ValueError:
            source = {}
        if not isinstance(source, dict):
            source = {}
        freeform = isinstance(source.get("rawText"), str)
        output_model = OpenAIPasteOutput if freeform else OpenAIPageExplanationOutput if pin_question else OpenAIDraftOutput
        schema = output_model.ai_schema()
        if source_options is not None or freeform:
            if isinstance(source, dict) and isinstance(source.get("part"), int) and not isinstance(source["part"], bool) and 1 <= source["part"] <= 7:
                schema["properties"]["part"] = {"type": "integer", "enum": [source["part"]]}
            if isinstance(source, dict) and source.get("errorCategory") in schema["properties"]["category"]["enum"]:
                schema["properties"]["category"]["enum"] = [source["errorCategory"]]
        if source_options is not None:
            # Select an exact source option rather than regenerating its wording/punctuation.
            # Empty remains available when the question lacks decisive context.
            # Strict output string literals cannot contain newlines/tabs. Fold
            # formatting whitespace; grounding restores the original source option.
            schema["properties"]["correctAnswer"]["enum"] = ["", *(" ".join(option.split()) for option in source_options)]
            schema["properties"]["ownAnswer"]["enum"] = schema["properties"]["correctAnswer"]["enum"]
        if images:
            if source.get("part") not in (1, 7) or (source.get("part") == 1 and len(images) != 1):
                raise HTTPException(422, "Ảnh chỉ hỗ trợ Part 1 (một tranh) hoặc Part 7.")
            if not freeform and (source_options is None or len(source_options) != 4 or not isinstance(source.get("question"), str) or not source["question"].strip()):
                raise HTTPException(422, "Dán câu hỏi và đủ A–D; ảnh chỉ cung cấp ngữ cảnh.")
            if not freeform:
                schema["properties"]["question"]["enum"] = [" ".join(source["question"].split())]
        if pin_question and not freeform and isinstance(source.get("question"), str) and source["question"].strip():
            # The question was already read exactly (from a screenshot); the explanation must not retype it.
            schema["properties"]["question"]["enum"] = [" ".join(source["question"].split())]
            # The passage was already read from the screenshot: retain its full
            # text rather than asking the model to summarize or retype it.
            schema["properties"]["context"]["enum"] = [""]
        image_instructions = (PART1_IMAGE_INSTRUCTIONS if images and source["part"] == 1 else PART7_IMAGE_INSTRUCTIONS) if images else ""
        if persistent_images:
            schema["properties"]["context"]["enum"] = [""]
            image_instructions += PERSISTENT_IMAGE_INSTRUCTIONS
        content = [{"type": "input_text", "text": text}]
        content.extend({"type": "input_image", "image_url": image, "detail": "high"} for image in (images or []))
        source_part = source.get("part")
        heavy_explain = bool(images) or (isinstance(source_part, int) and not isinstance(source_part, bool) and source_part in (1, 7))
        model = self.settings.openai_part7_model if heavy_explain else self.settings.openai_model
        effort = self.settings.openai_part7_effort if heavy_explain else self.settings.openai_reasoning_effort
        payload = {
            "model": model,
            "instructions": OPENAI_TOEIC_PROMPT + image_instructions + (FREEFORM_INPUT_INSTRUCTIONS if freeform else ""),
            "input": [{"role": "user", "content": content}],
            "reasoning": {"effort": effort},
            "text": {"format": {
                "type": "json_schema", "name": "toeic_mistake", "strict": True,
                "schema": schema,
            }},
            "max_output_tokens": self.settings.openai_max_output_tokens,
            "store": False,
            "service_tier": "default",
        }
        if safety_identifier:
            payload["safety_identifier"] = safety_identifier
        phase = "response"
        try:
            text_output = await self._respond(key, payload, self.settings.openai_timeout_seconds,
                                              endpoint=endpoint, owner_id=owner_id)
            phase = "schema"
            output = output_model.model_validate_json(text_output)
            if isinstance(output, OpenAIPasteOutput) and output.inputIssue:
                message = {
                    "MULTIPLE_QUESTIONS": "Nội dung có nhiều câu hỏi. Giữ lại một câu cần ghi lỗi rồi phân tích lại.",
                    "MISSING_QUESTION": "Chưa tìm thấy câu hỏi trong nội dung đã dán. Bổ sung câu cần phân tích.",
                    "MISSING_OPTIONS": "Chưa đọc được đủ phương án của câu hỏi. Dán thêm nội dung các phương án từ đề.",
                }[output.inputIssue]
                raise HTTPException(422, message + " Nội dung đang nhập vẫn được giữ.")
            draft = output.to_draft()
            phase = "source_verification"
            if freeform:
                return ground_pasted_draft(source, draft, image_source=bool(images), persistent_images=persistent_images)
            grounded = ground_draft(text, draft, allow_ai_answer=True, source_options=source_options,
                                    source_answer=source_answer, image_source=bool(images), persistent_images=persistent_images)
            if pin_question:
                grounded.question = source["question"]
                grounded.context = source.get("context", "")
                grounded.questionContext = "\n\n".join(field for field in (grounded.question, grounded.context) if field)
            # AI solved the question itself and disagrees with the source's answer: the source may be wrong.
            own = re.match(r"^\s*\(([A-D])\)", output.ownAnswer or "")
            if source_answer and own and grounded.answerSource == "PROVIDED" and own[1] != source_answer.upper():
                grounded.answerDoubt = own[1]
            return grounded
        except (ValueError, KeyError, TypeError, AttributeError) as error:
            logger.warning(json.dumps({"event": "openai_invalid_draft", "request_id": request_id_context.get(),
                                       "phase": phase, "error_type": type(error).__name__,
                                       **({"issues": schema_issues(error)} if isinstance(error, ValidationError) else {})}))
            if phase == "source_verification":
                raise HTTPException(502, "Câu hỏi hoặc phương án AI trích chưa khớp nguyên văn nội dung đã dán. "
                                    "Chưa tạo bản nháp; nội dung được giữ để thử lại hoặc chỉnh thủ công.") from error
            raise HTTPException(502, "Kết quả OpenAI trả về chưa đủ hoặc không đúng định dạng nên chưa tạo được bản nháp. "
                                "Nội dung đang nhập vẫn được giữ; hãy thử lại hoặc lưu thủ công.") from error

    def _build_page_payload(self, questions: list[dict], images: list[str], context_images: list[str],
                            slices: list[tuple[int, int]], *, model: str, effort: str,
                            safety_identifier: str | None) -> dict:
        numbers = [question["number"] for question in questions]
        content = [{"type": "input_text", "text": json.dumps({"questions": questions}, ensure_ascii=False, separators=(",", ":"))}]
        runs = {first: last for first, last in slices}

        def add_images(urls: list[str], offset: int):
            for index, image in enumerate(urls, start=offset + 1):
                if index in runs:
                    # A tall screenshot cut into parts: they are one page, read top to bottom.
                    content.append({"type": "input_text", "text": f"SLICED_IMAGE: ảnh {index}–{runs[index]} là {runs[index] - index + 1} phần liên tiếp "
                                    "của cùng một ảnh, đọc nối tiếp từ trên xuống như một trang; chỗ nối chồng nhau vài dòng, không chép lặp."})
                if runs:
                    content.append({"type": "input_text", "text": f"Ảnh {index}"})
                content.append({"type": "input_image", "image_url": image, "detail": "high"})

        if context_images:
            # One passage group: its pages first, labelled, then the question pages that refer to them.
            content.append({"type": "input_text", "text": "PASSAGE_IMAGES"})
            add_images(context_images, 0)
            content.append({"type": "input_text", "text": "QUESTION_IMAGES"})
        add_images(images, len(context_images))
        payload = {
            "model": model,
            "instructions": PAGE_READING_PROMPT,
            "input": [{"role": "user", "content": content}],
            "reasoning": {"effort": effort},
            "text": {"format": {"type": "json_schema", "name": "toeic_page", "strict": True, "schema": page_output_schema(numbers)}},
            "max_output_tokens": self.settings.openai_page_max_output_tokens,
            "store": False,
            "service_tier": "default",
        }
        if safety_identifier:
            payload["safety_identifier"] = safety_identifier
        return payload

    def _parse_page_items(self, raw_items: list[dict], numbers: list[int]) -> tuple[list[tuple[int, MistakeDraft]], list[dict], int]:
        found: list[tuple[int, MistakeDraft]] = []
        rejection_reasons: list[dict] = []
        rejected = 0
        for raw in raw_items:
            raw_number = raw.get("number") if isinstance(raw, dict) and isinstance(raw.get("number"), int) and not isinstance(raw.get("number"), bool) else None
            try:
                item = OpenAIPageItem.model_validate(raw)
            except ValidationError as error:
                rejected += 1
                too_long = any(issue.get("loc") == ("context",) and issue.get("type") == "string_too_long" for issue in error.errors())
                rejection_reasons.append({
                    "number": raw_number,
                    "code": "context_too_long" if too_long else "invalid_item_format",
                    "detail": (
                        f"Đoạn văn của câu {raw_number} vượt giới hạn 8.000 ký tự."
                        if too_long and raw_number is not None
                        else f"Câu {raw_number} chưa đủ định dạng chuẩn để đọc tự động."
                        if raw_number is not None
                        else "Một mục ảnh trả về chưa đúng định dạng."
                    ),
                })
                continue
            if item.number not in numbers or any(number == item.number for number, _ in found):
                rejected += 1
                if item.number not in numbers:
                    rejection_reasons.append({
                        "number": item.number,
                        "code": "out_of_requested_range",
                        "detail": f"Câu {item.number} không nằm trong danh sách câu cần đọc.",
                    })
                continue
            draft, reason = page_item_draft(item)
            if draft is None:
                rejected += 1
                if reason is not None:
                    rejection_reasons.append({"number": item.number, "code": reason[0], "detail": reason[1]})
                continue
            found.append((item.number, draft))
        return found, rejection_reasons, rejected

    async def generate_page(self, questions: list[dict], images: list[str],
                            safety_identifier: str | None = None,
                            context_images: list[str] | None = None,
                            slices: list[tuple[int, int]] | None = None,
                            *, photo_mode: bool = False,
                            owner_id: str | None = None) -> tuple[list[tuple[int, MistakeDraft]], list[int], list[dict]]:
        """Read wrong questions from screenshots or paper photos. Returns (found, missing, rejection_reasons)."""
        key = self.settings.openai_api_key.get_secret_value().strip()
        if not key:
            raise HTTPException(503, "AI chưa có key OpenAI được cấu hình.")
        numbers = [question["number"] for question in questions]
        context_images = context_images or []
        slices = slices or []
        model = self.settings.openai_paper_ocr_model if photo_mode else self.settings.openai_ocr_model
        effort = self.settings.openai_paper_ocr_effort if photo_mode else self.settings.openai_ocr_effort
        payload = self._build_page_payload(questions, images, context_images, slices,
                                           model=model, effort=effort, safety_identifier=safety_identifier)
        phase = "response"
        try:
            text_output = await self._respond(key, payload, self.settings.openai_page_timeout_seconds,
                                              endpoint="extract_page", owner_id=owner_id)
            phase = "schema"
            output = OpenAIPageOutput.model_validate_json(text_output)
        except (ValueError, KeyError, TypeError, AttributeError) as error:
            logger.warning(json.dumps({"event": "openai_invalid_page", "request_id": request_id_context.get(),
                                       "phase": phase, "error_type": type(error).__name__,
                                       **({"issues": schema_issues(error)} if isinstance(error, ValidationError) else {})}))
            raise HTTPException(502, "Kết quả OpenAI trả về chưa đủ hoặc không đúng định dạng nên chưa đọc được ảnh. "
                                "Các câu vẫn được giữ; hãy thử lại hoặc ghi tay.") from error
        found, rejection_reasons, rejected = self._parse_page_items(output.items, numbers)

        # Automatic max-1 escalation when OCR misses completely (screen) or misses >50% (paper photo) without rejections.
        escalate_model = self.settings.openai_paper_ocr_model
        escalate_effort = "medium"
        should_escalate = (
            rejected == 0
            and (model, effort) != (escalate_model, escalate_effort)
            and (
                (photo_mode and (len(found) == 0 or len(found) * 2 < len(numbers)))
                or (not photo_mode and len(found) == 0)
            )
        )
        if should_escalate:
            seen_first = {number for number, _ in found}
            retry_questions = [q for q in questions if q["number"] not in seen_first]
            if retry_questions:
                retry_numbers = [q["number"] for q in retry_questions]
                retry_payload = self._build_page_payload(
                    retry_questions, images, context_images, slices,
                    model=escalate_model, effort=escalate_effort, safety_identifier=safety_identifier,
                )
                try:
                    retry_text = await self._respond(key, retry_payload, self.settings.openai_page_timeout_seconds,
                                                     endpoint="extract_page_escalate", owner_id=owner_id)
                    retry_output = OpenAIPageOutput.model_validate_json(retry_text)
                    retry_found, retry_reasons, retry_rejected = self._parse_page_items(retry_output.items, retry_numbers)
                    found.extend(retry_found)
                    rejection_reasons.extend(retry_reasons)
                    rejected += retry_rejected
                except (HTTPException, ValueError, KeyError, TypeError, AttributeError) as error:
                    logger.warning(json.dumps({
                        "event": "openai_page_escalation_failed", "request_id": request_id_context.get(),
                        "error_type": type(error).__name__,
                    }))

        if rejected:
            logger.warning(json.dumps({"event": "openai_page_items_rejected", "request_id": request_id_context.get(), "count": rejected}))
        seen = {number for number, _ in found}
        # Drop stale rejection reasons for numbers recovered during escalation.
        final_reasons = [reason for reason in rejection_reasons if reason["number"] not in seen]
        return sorted(found, key=lambda pair: pair[0]), [number for number in numbers if number not in seen], final_reasons


def _normalize_option_label(option: str) -> tuple[str, str] | None:
    match = re.match(r"^\s*(?:\(([A-Da-d])\)|([A-Da-d])[.):\-])\s*(\S.*)$", option, re.DOTALL)
    if not match:
        return None
    letter = (match[1] or match[2]).upper()
    return letter, f"({letter}) {match[3].strip()}"


def page_item_draft(item: OpenAIPageItem) -> tuple[MistakeDraft | None, tuple[str, str] | None]:
    """Check one question copied from a screenshot or paper photo; return (draft, None) or (None, (code, detail))."""
    part = part_of_question(item.number)
    labels: list[str] = []
    normalized_options: list[str] = []
    for option in item.options:
        parsed = _normalize_option_label(option)
        if parsed is None:
            return None, ("invalid_option_label", f"Câu {item.number} có phương án thiếu nhãn (A)–(D) hoặc bị cắt chữ.")
        letter, canonical = parsed
        labels.append(letter)
        normalized_options.append(canonical)
    expected = list("ABCD"[:3 if part == 2 else 4])
    if normalized_options and labels != expected:
        return None, (
            "missing_options",
            f"Câu {item.number} chưa đủ phương án {'A–C' if part == 2 else 'A–D'} (chỉ đọc được {', '.join(labels)}).",
        )
    question = item.question.strip()
    context = item.context.strip()
    if not question and not context:
        return None, ("empty_content", f"Câu {item.number} chưa đọc rõ nội dung câu hỏi trên ảnh.")

    warnings: list[str] = []
    # A Part 6 passage marks each blank with its number; if the passage clearly shows OTHER Part 6 numbers
    # without this item's number, it belongs to a different text on another screenshot and must not be saved wrong.
    # If no conflicting Part 6 blank numbers appear (e.g. paper spine shadow obscured the blank number into '____'),
    # keep the draft and warn the learner to verify the passage.
    if part == 6 and context and not re.search(rf"(?<!\d){item.number}(?!\d)", context):
        other_p6_numbers = {
            int(found) for found in re.findall(r"(?<!\d)(13[1-9]|14[0-6])(?!\d)", context)
            if int(found) != item.number
        }
        if other_p6_numbers:
            return None, (
                "part6_wrong_passage",
                f"Đoạn văn của câu {item.number} bị lẫn sang nhóm Part 6 khác; hãy chụp đúng trang đoạn văn đi kèm.",
            )
        warnings.append("Kiểm tra lại đoạn văn Part 6 của câu này (chưa thấy rõ số chỗ trống trên ảnh).")

    if any("[không rõ]" in chunk for chunk in (question, context, *normalized_options)):
        warnings.append("Ảnh có chỗ mờ được đánh dấu [không rõ] — kiểm tra và sửa nhanh trước khi lưu.")

    folded = {" ".join(option.split()): option for option in normalized_options}
    raw_correct = item.correctAnswer.strip()
    parsed_correct = _normalize_option_label(raw_correct) if raw_correct else None
    canonical_correct = parsed_correct[1] if parsed_correct else raw_correct
    correct = folded.get(" ".join(canonical_correct.split())) if item.answerSource == "PROVIDED" else None
    choice = item.userChoice if item.userChoice in labels else ""
    return PageMistakeDraft(
        part=part, category="OTHER", question=question, context=context, options=normalized_options,
        correctAnswer=correct or "", answerSource="PROVIDED" if correct else "MISSING", userChoice=choice,
        userMistake=next((option for option in normalized_options if option.startswith(f"({choice})")), "") if choice else "",
        tags=[], missingInformation=warnings, trapTip="", optionNotes=[], explanation=None,
    ), None


async def read_results(provider: OpenAIProvider, images: list[str], safety_identifier: str | None = None, *,
                       photo_mode: bool = False, owner_id: str | None = None) -> tuple[list[int], list[int], dict, dict]:
    """Read marked questions and visible source scores; never convert counts into source scores."""
    key = provider.settings.openai_api_key.get_secret_value().strip()
    if not key:
        raise HTTPException(503, "AI chưa có key OpenAI được cấu hình.")
    model = provider.settings.openai_paper_results_model if photo_mode else provider.settings.openai_ocr_model
    effort = provider.settings.openai_paper_results_effort if photo_mode else provider.settings.openai_ocr_effort
    payload = {
        "model": model,
        "instructions": RESULTS_READING_PROMPT,
        "input": [{"role": "user", "content": [{"type": "input_image", "image_url": image, "detail": "high"} for image in images]}],
        "reasoning": {"effort": effort},
        "text": {"format": {"type": "json_schema", "name": "toeic_results", "strict": True, "schema": RESULTS_OUTPUT_SCHEMA}},
        "max_output_tokens": 4096,
        "store": False,
        "service_tier": "default",
    }
    if safety_identifier:
        payload["safety_identifier"] = safety_identifier
    try:
        output = OpenAIResultsOutput.model_validate_json(
            await provider._respond(key, payload, provider.settings.openai_timeout_seconds,
                                    endpoint="read_results", owner_id=owner_id)
        )
    except (ValueError, KeyError, TypeError, AttributeError) as error:
        logger.warning(json.dumps({"event": "openai_invalid_results", "request_id": request_id_context.get(), "error_type": type(error).__name__}))
        raise HTTPException(502, "Chưa đọc được bảng kết quả từ ảnh. Hãy thử lại hoặc chạm vào các câu sai.") from error
    valid = range(1, 201)
    wrong = sorted({number for number in output.wrong if number in valid})
    skipped = sorted({number for number in output.skipped if number in valid} - set(wrong))
    return wrong, skipped, output.scores.model_dump(exclude={"part5Minutes", "part6Minutes", "part7Minutes"}), output.timing.model_dump()
