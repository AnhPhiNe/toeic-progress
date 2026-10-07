import asyncio
import json

import httpx
import pytest
from fastapi import HTTPException

from app.core.config import Settings
from app.integrations.openai_provider import OpenAIProvider

TEXT = "Reports should ____ submitted. (A) are (B) be. Tôi chọn A. Đáp án chuẩn: B."
DRAFT = {
    "part": 5, "category": "ADVANCED_GRAMMAR", "questionContext": TEXT,
    "userMistake": "Chọn A", "correctAnswer": "(B) be", "trapTip": "Kiểm tra cấu trúc bị động.",
    "options": ["(A) are", "(B) be"], "tags": [], "missingInformation": [], "answerSource": "PROVIDED",
}


def completed(**changes):
    return {
        "status": "completed", "usage": {"input_tokens": 300, "output_tokens": 600},
        "output": [{"type": "reasoning"}, {
            "type": "message", "role": "assistant", "status": "completed",
            "content": [{"type": "output_text", "text": json.dumps(DRAFT)}],
        }], **changes,
    }


def run_provider(responder, text=TEXT, **changes):
    async def run():
        calls = []
        settings = Settings(_env_file=None, ai_provider="openai", openai_api_key="private-openai-key", **changes)
        def transport(request):
            calls.append(request)
            return responder(request)
        async with httpx.AsyncClient(transport=httpx.MockTransport(transport)) as client:
            try:
                result = await OpenAIProvider(settings, client).generate(text, "opaque-user-hash")
            except HTTPException as error:
                result = error
        return result, calls
    return asyncio.run(run())


def test_official_responses_api_uses_medium_and_strict_schema_without_sampling_or_storage():
    result, calls = run_provider(lambda _request: httpx.Response(200, json=completed()))
    assert result.correctAnswer == "(B) be" and len(calls) == 1
    request = calls[0]
    assert str(request.url) == "https://api.openai.com/v1/responses"
    assert request.headers["authorization"] == "Bearer private-openai-key"
    body = json.loads(request.content)
    assert body["model"] == "gpt-6-luna" and body["reasoning"] == {"effort": "medium"}
    assert body["store"] is False and body["service_tier"] == "default"
    assert body["max_output_tokens"] == 8192 and body["safety_identifier"] == "opaque-user-hash"
    assert "temperature" not in body and "top_p" not in body
    schema = body["text"]["format"]["schema"]
    assert schema["additionalProperties"] is False
    assert set(schema["required"]) == set(schema["properties"])


def test_high_is_an_explicit_configuration_change():
    _result, calls = run_provider(lambda _request: httpx.Response(200, json=completed()), openai_reasoning_effort="high")
    assert json.loads(calls[0].content)["reasoning"] == {"effort": "high"}


@pytest.mark.parametrize("value", [
    completed(status="incomplete", incomplete_details={"reason": "max_output_tokens"}),
    completed(output=[{"type": "message", "role": "assistant", "status": "completed",
                       "content": [{"type": "refusal", "refusal": "Cannot process"}]}]),
    completed(output=[]),
    completed(output=[{"type": "message", "role": "assistant", "status": "completed",
                       "content": [{"type": "output_text", "text": "not JSON"}]}]),
])
def test_incomplete_refused_or_malformed_output_is_not_retried_or_saved(value):
    result, calls = run_provider(lambda _request: httpx.Response(200, json=value))
    assert result.status_code == 502 and len(calls) == 1


def test_missing_answer_is_grounded_even_if_provider_invents_one():
    result, _calls = run_provider(lambda _request: httpx.Response(200, json=completed()), text="Reports should ____ submitted. (A) are (B) be. Tôi chọn A.")
    assert result.correctAnswer == "" and result.answerSource == "MISSING"


@pytest.mark.parametrize("billing", [False, True])
def test_rate_limits_and_billing_are_distinct_without_key_rotation(billing):
    result, calls = run_provider(lambda _request: httpx.Response(
        429, json={"error": {"code": "insufficient_quota" if billing else "rate_limit_exceeded"}},
        headers={"Retry-After": "75"},
    ))
    assert result.status_code == (503 if billing else 429) and len(calls) == 1
    if not billing:
        assert result.headers["Retry-After"] == "75"


def test_timeout_does_not_duplicate_billed_requests_or_log_keys(caplog):
    def timeout(request):
        raise httpx.ReadTimeout("private-openai-key", request=request)
    result, calls = run_provider(timeout)
    assert result.status_code == 503 and len(calls) == 1
    assert "private-openai-key" not in result.detail
    assert not any("private-openai-key" in record.message for record in caplog.records)


def test_openai_configuration_does_not_depend_on_gemini_credentials():
    settings = Settings(
        _env_file=None, ai_provider="openai", openai_api_key="private-openai-key",
        supabase_url="https://database.example", supabase_publishable_key="public", supabase_secret_key="server",
        turnstile_secret_key="turnstile", rate_limit_secret="rate",
    )
    assert settings.ai_ready and not settings.effective_gemini_projects
    assert "private-openai-key" not in repr(settings) and "private-openai-key" not in settings.model_dump_json()
    assert not settings.model_copy(update={"openai_api_key": Settings(_env_file=None).openai_api_key}).ai_ready
