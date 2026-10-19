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
    MistakeDraft,
    OpenAIDraftOutput,
    OpenAIPageOutput,
    OpenAIPasteOutput,
    page_output_schema,
    part_of_question,
)
from app.services.ai_grounding import ground_draft, ground_pasted_draft
from app.services.toeic_prompt import (
    FREEFORM_INPUT_INSTRUCTIONS,
    OPENAI_TOEIC_PROMPT,
    PAGE_EXTRACTION_INSTRUCTIONS,
    PART1_IMAGE_INSTRUCTIONS,
    PART7_IMAGE_INSTRUCTIONS,
    PERSISTENT_IMAGE_INSTRUCTIONS,
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


class OpenAIProvider:
    def __init__(self, settings: Settings, client: httpx.AsyncClient):
        self.settings, self.client = settings, client

    async def _respond(self, key: str, payload: dict, timeout: float) -> str:
        """One billed attempt: send the request and return the joined output text. Never retried."""
        started = time.monotonic()
        try:
            async with asyncio.timeout(timeout):
                response = await self.client.post(
                    "https://api.openai.com/v1/responses",
                    headers={"Authorization": f"Bearer {key}"}, json=payload,
                    timeout=timeout,
                )
        except (httpx.HTTPError, TimeoutError) as error:
            logger.warning(json.dumps({
                "event": "openai_transport_error", "request_id": request_id_context.get(),
                "model": self.settings.openai_model, "error_type": type(error).__name__,
                "duration_ms": round((time.monotonic() - started) * 1000, 2),
            }))
            # A timed-out request may already be generating a billed result.
            # Never automatically retry a possibly billed generation or change keys.
            message = (
                "OpenAI phản hồi quá thời gian chờ; chưa nhận được kết quả phân tích."
                if isinstance(error, (httpx.TimeoutException, TimeoutError))
                else "Kết nối tới OpenAI bị gián đoạn; chưa nhận được kết quả phân tích."
            )
            raise HTTPException(503, message + " Nội dung đang nhập vẫn được giữ. Bạn có thể thử lại hoặc lưu thủ công.") from error
        logger.info(json.dumps({
            "event": "openai_attempt", "request_id": request_id_context.get(), "model": self.settings.openai_model,
            "status": response.status_code, "duration_ms": round((time.monotonic() - started) * 1000, 2),
        }))
        if not response.is_success:
            if response.status_code == 429:
                try:
                    quota = response.json().get("error", {})
                    billing = quota.get("code") in ("insufficient_quota", "billing_hard_limit_reached", "budget_exceeded")
                except (ValueError, AttributeError):
                    billing = False
                if billing:
                    raise HTTPException(503, "Dịch vụ OpenAI đã hết ngân sách hoặc hạn mức thanh toán. "
                                        "Đây không phải giới hạn lượt của tài khoản bạn. Bạn vẫn có thể lưu thủ công.")
                try:
                    delay = max(1, min(86400, math.ceil(float(response.headers.get("Retry-After", "60")))))
                except (ValueError, OverflowError):
                    delay = 60
                raise HTTPException(429, "OpenAI đang giới hạn tốc độ xử lý. Nội dung đang nhập vẫn được giữ.",
                                    headers={"Retry-After": str(delay)})
            if response.status_code in (401, 403):
                raise HTTPException(503, "Ứng dụng chưa được OpenAI cho phép xử lý yêu cầu. "
                                    "Cần kiểm tra cấu hình dịch vụ; bạn vẫn có thể lưu thủ công.")
            if response.status_code >= 500:
                raise HTTPException(503, "Dịch vụ OpenAI tạm gặp sự cố. Hãy thử lại sau hoặc lưu thủ công.")
            raise HTTPException(503, "OpenAI từ chối yêu cầu phân tích. "
                                "Cần kiểm tra cấu hình dịch vụ; bạn vẫn có thể lưu thủ công.")
        value = response.json()
        usage = value.get("usage") or {}
        # Record counts only. No raw output, prompt, key, email or headers.
        logger.info(json.dumps({
            "event": "openai_usage", "request_id": request_id_context.get(),
            **{name: usage[name] for name in ("input_tokens", "output_tokens")
               if isinstance(usage.get(name), int) and not isinstance(usage[name], bool)},
        }))
        if value.get("status") != "completed":
            raise ValueError("Incomplete output")
        chunks = []
        for item in value.get("output", []):
            if item.get("type") != "message" or item.get("role") != "assistant":
                continue
            if item.get("status") != "completed":
                raise ValueError("Incomplete message")
            for block in item.get("content", []):
                if block.get("type") == "refusal":
                    raise ValueError("Refused output")
                if block.get("type") == "output_text":
                    chunks.append(block["text"])
        if not chunks:
            raise ValueError("Missing output")
        return "".join(chunks)

    async def generate(self, text: str, safety_identifier: str | None = None, *,
                       source_options: list[str] | None = None, source_answer: str | None = None,
                       images: list[str] | None = None, persistent_images: bool = False) -> MistakeDraft:
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
        output_model = OpenAIPasteOutput if freeform else OpenAIDraftOutput
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
        if images:
            if source.get("part") not in (1, 7) or (source.get("part") == 1 and len(images) != 1):
                raise HTTPException(422, "Ảnh chỉ hỗ trợ Part 1 (một tranh) hoặc Part 7.")
            if not freeform and (source_options is None or len(source_options) != 4 or not isinstance(source.get("question"), str) or not source["question"].strip()):
                raise HTTPException(422, "Dán câu hỏi và đủ A–D; ảnh chỉ cung cấp ngữ cảnh.")
            if not freeform:
                schema["properties"]["question"]["enum"] = [" ".join(source["question"].split())]
        image_instructions = (PART1_IMAGE_INSTRUCTIONS if images and source["part"] == 1 else PART7_IMAGE_INSTRUCTIONS) if images else ""
        if persistent_images:
            schema["properties"]["context"]["enum"] = [""]
            image_instructions += PERSISTENT_IMAGE_INSTRUCTIONS
        content = [{"type": "input_text", "text": text}]
        content.extend({"type": "input_image", "image_url": image, "detail": "high"} for image in (images or []))
        payload = {
            "model": self.settings.openai_model,
            "instructions": OPENAI_TOEIC_PROMPT + image_instructions + (FREEFORM_INPUT_INSTRUCTIONS if freeform else ""),
            "input": [{"role": "user", "content": content}],
            "reasoning": {"effort": self.settings.openai_reasoning_effort},
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
            text_output = await self._respond(key, payload, self.settings.openai_timeout_seconds)
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
            return ground_draft(text, draft, allow_ai_answer=True, source_options=source_options,
                                source_answer=source_answer, image_source=bool(images), persistent_images=persistent_images)
        except (ValueError, KeyError, TypeError, AttributeError) as error:
            logger.warning(json.dumps({"event": "openai_invalid_draft", "request_id": request_id_context.get(),
                                       "phase": phase, "error_type": type(error).__name__,
                                       **({"issues": schema_issues(error)} if isinstance(error, ValidationError) else {})}))
            if phase == "source_verification":
                raise HTTPException(502, "Câu hỏi hoặc phương án AI trích chưa khớp nguyên văn nội dung đã dán. "
                                    "Chưa tạo bản nháp; nội dung được giữ để thử lại hoặc chỉnh thủ công.") from error
            raise HTTPException(502, "Kết quả OpenAI trả về chưa đủ hoặc không đúng định dạng nên chưa tạo được bản nháp. "
                                "Nội dung đang nhập vẫn được giữ; hãy thử lại hoặc lưu thủ công.") from error

    async def generate_page(self, questions: list[dict], images: list[str],
                            safety_identifier: str | None = None) -> tuple[list[tuple[int, MistakeDraft]], list[int]]:
        """Read the learner's wrong questions from screenshots. Returns (number, draft) pairs and numbers not found."""
        key = self.settings.openai_api_key.get_secret_value().strip()
        if not key:
            raise HTTPException(503, "AI chưa có key OpenAI được cấu hình.")
        numbers = [question["number"] for question in questions]
        content = [{"type": "input_text", "text": json.dumps({"questions": questions}, ensure_ascii=False, separators=(",", ":"))}]
        content.extend({"type": "input_image", "image_url": image, "detail": "high"} for image in images)
        payload = {
            "model": self.settings.openai_model,
            "instructions": OPENAI_TOEIC_PROMPT + PAGE_EXTRACTION_INSTRUCTIONS,
            "input": [{"role": "user", "content": content}],
            "reasoning": {"effort": self.settings.openai_reasoning_effort},
            "text": {"format": {"type": "json_schema", "name": "toeic_page", "strict": True, "schema": page_output_schema(numbers)}},
            "max_output_tokens": self.settings.openai_page_max_output_tokens,
            "store": False,
            "service_tier": "default",
        }
        if safety_identifier:
            payload["safety_identifier"] = safety_identifier
        phase = "response"
        try:
            text_output = await self._respond(key, payload, self.settings.openai_page_timeout_seconds)
            phase = "schema"
            output = OpenAIPageOutput.model_validate_json(text_output)
        except (ValueError, KeyError, TypeError, AttributeError) as error:
            logger.warning(json.dumps({"event": "openai_invalid_page", "request_id": request_id_context.get(),
                                       "phase": phase, "error_type": type(error).__name__,
                                       **({"issues": schema_issues(error)} if isinstance(error, ValidationError) else {})}))
            raise HTTPException(502, "Kết quả OpenAI trả về chưa đủ hoặc không đúng định dạng nên chưa đọc được ảnh. "
                                "Các câu vẫn được giữ; hãy thử lại hoặc ghi tay.") from error
        found: list[tuple[int, MistakeDraft]] = []
        rejected = 0
        for item in output.items:
            if item.number not in numbers or any(number == item.number for number, _ in found):
                rejected += 1
                continue
            draft = page_item_draft(item)
            if draft is None:
                rejected += 1
                continue
            found.append((item.number, draft))
        if rejected:
            logger.warning(json.dumps({"event": "openai_page_items_rejected", "request_id": request_id_context.get(), "count": rejected}))
        seen = {number for number, _ in found}
        return sorted(found, key=lambda pair: pair[0]), [number for number in numbers if number not in seen]


def page_item_draft(item) -> MistakeDraft | None:
    """Check one item read from a screenshot; an item that does not fit its question is left for another try."""
    part = part_of_question(item.number)
    labels = [re.match(r"^\s*\(([A-Da-d])\)", option)[1].upper() for option in item.options]
    if item.options and labels != list("ABCD"[:3 if part == 2 else 4]):
        return None
    folded = {" ".join(option.split()): option for option in item.options}
    draft = item.to_draft()
    draft.part = part
    if draft.answerSource != "MISSING":
        option = folded.get(" ".join(draft.correctAnswer.split()))
        if option is None:
            draft.answerSource, draft.correctAnswer = "MISSING", ""
        else:
            draft.correctAnswer = option
    if draft.userChoice not in labels:
        draft.userChoice = ""
    draft.userMistake = next((option for option in item.options if option.startswith(f"({draft.userChoice})")), "") if draft.userChoice else ""
    return draft
