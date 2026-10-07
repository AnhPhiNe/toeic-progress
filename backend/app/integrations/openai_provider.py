"""Single-attempt TOEIC extraction through the official OpenAI Responses API."""

import asyncio
import json
import logging
import math
import time

import httpx
from fastapi import HTTPException

from app.core.config import Settings
from app.core.runtime import request_id_context
from app.schemas.models import MistakeDraft
from app.services.ai_grounding import ground_draft
from app.services.toeic_prompt import OPENAI_TOEIC_PROMPT

logger = logging.getLogger("toeic.runtime")


class OpenAIProvider:
    def __init__(self, settings: Settings, client: httpx.AsyncClient):
        self.settings, self.client = settings, client

    async def generate(self, text: str, safety_identifier: str | None = None) -> MistakeDraft:
        key = self.settings.openai_api_key.get_secret_value().strip()
        if not key:
            raise HTTPException(503, "AI chưa có key OpenAI được cấu hình.")
        payload = {
            "model": self.settings.openai_model,
            "instructions": OPENAI_TOEIC_PROMPT,
            "input": [{"role": "user", "content": [{"type": "input_text", "text": text}]}],
            "reasoning": {"effort": self.settings.openai_reasoning_effort},
            "text": {"format": {
                "type": "json_schema", "name": "toeic_mistake", "strict": True,
                "schema": MistakeDraft.model_json_schema(),
            }},
            "max_output_tokens": self.settings.openai_max_output_tokens,
            "store": False,
            "service_tier": "default",
        }
        if safety_identifier:
            payload["safety_identifier"] = safety_identifier
        started = time.monotonic()
        try:
            async with asyncio.timeout(self.settings.openai_timeout_seconds):
                response = await self.client.post(
                    "https://api.openai.com/v1/responses",
                    headers={"Authorization": f"Bearer {key}"}, json=payload,
                    timeout=self.settings.openai_timeout_seconds,
                )
        except (httpx.HTTPError, TimeoutError) as error:
            logger.warning(json.dumps({
                "event": "openai_transport_error", "request_id": request_id_context.get(),
                "model": self.settings.openai_model, "error_type": type(error).__name__,
                "duration_ms": round((time.monotonic() - started) * 1000, 2),
            }))
            # A timed-out request may already be generating a billed result.
            # Never automatically retry, change keys, or send it to Gemini.
            raise HTTPException(503, "AI phản hồi chậm hoặc kết nối bị gián đoạn. Vui lòng thử lại sau.") from error
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
                    raise HTTPException(503, "AI tạm hết ngân sách. Bạn có thể nhập thủ công.")
                try:
                    delay = max(1, min(86400, math.ceil(float(response.headers.get("Retry-After", "60")))))
                except (ValueError, OverflowError):
                    delay = 60
                raise HTTPException(429, "AI đang bận. Vui lòng thử lại sau.", headers={"Retry-After": str(delay)})
            raise HTTPException(503, "OpenAI chưa xử lý được yêu cầu. Bạn có thể nhập thủ công.")
        try:
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
                for content in item.get("content", []):
                    if content.get("type") == "refusal":
                        raise ValueError("Refused output")
                    if content.get("type") == "output_text":
                        chunks.append(content["text"])
            if not chunks:
                raise ValueError("Missing output")
            return ground_draft(text, MistakeDraft.model_validate_json("".join(chunks)), allow_ai_answer=True)
        except (ValueError, KeyError, TypeError, AttributeError) as error:
            raise HTTPException(502, "AI trả bản nháp chưa hoàn chỉnh hoặc chưa hợp lệ. Hãy nhập thủ công hoặc bổ sung nội dung.") from error
