import asyncio
import json

import httpx
import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from app.core.config import Settings
from app.integrations.gemini import GeminiProvider, provider_cooldown

TEXT = "Reports should ____ submitted. (A) are (B) be. Đáp án chuẩn: B."
DRAFT = {
    "part": 5, "category": "ADVANCED_GRAMMAR", "questionContext": TEXT,
    "userMistake": "", "correctAnswer": "(B) be", "trapTip": "Kiểm tra cấu trúc.",
    "options": ["(A) are", "(B) be"], "tags": [], "missingInformation": [], "answerSource": "PROVIDED",
}


def quota(reason="RPM", model="gemini-3.8-flash", retry="2s"):
    metric = {
        "RPM": "GenerateContentRequestsPerMinutePerProjectPerModel-FreeTier",
        "TPM": "GenerateContentInputTokensPerMinutePerProjectPerModel-FreeTier",
        "RPD": "GenerateContentRequestsPerDayPerProjectPerModel-FreeTier",
    }[reason]
    return {"error": {"details": [
        {"@type": "type.googleapis.com/google.rpc.QuotaFailure", "violations": [
            {"quotaId": metric, "quotaDimensions": {"model": model}},
        ]},
        {"@type": "type.googleapis.com/google.rpc.RetryInfo", "retryDelay": retry},
    ]}}


@pytest.mark.parametrize("reason,seconds", [("RPM", 60), ("TPM", 60), ("RPD", 86400)])
def test_quota_types_and_minimum_cooldowns(reason, seconds):
    result = provider_cooldown(httpx.Response(429, json=quota(reason)), "gemini-3.8-flash", Settings(_env_file=None))
    assert (result.scope, result.reason, result.seconds) == ("model", reason.lower(), seconds)


def test_provider_retry_after_is_respected_even_when_longer_than_our_minimum():
    result = provider_cooldown(
        httpx.Response(429, json=quota(retry="120s"), headers={"Retry-After": "180"}),
        "gemini-3.8-flash", Settings(_env_file=None),
    )
    assert result.seconds == 180


def test_malformed_quota_details_remain_conservative():
    body = {"error": {"details": [{"@type": "google.rpc.QuotaFailure", "violations": None}]}}
    result = provider_cooldown(httpx.Response(429, json=body), "gemini-3.8-flash", Settings(_env_file=None))
    assert (result.scope, result.reason) == ("project", "unknown_quota")


def test_unknown_or_project_quota_is_not_mistaken_for_an_independent_model_bucket():
    result = provider_cooldown(httpx.Response(429, json={"error": {}}), "gemini-3.8-flash", Settings(_env_file=None))
    assert (result.scope, result.reason, result.seconds) == ("project", "unknown_quota", 60)
    body = quota()
    body["error"]["details"][0]["violations"][0]["quotaDimensions"] = {}
    assert provider_cooldown(httpx.Response(429, json=body), "gemini-3.8-flash", Settings(_env_file=None)).scope == "project"


class MockReservations:
    """Scripted boundary for provider tests. Real atomic scheduling is tested in SQL."""
    def __init__(self):
        self.blocks = set()
        self.calls = []

    async def __call__(self, name, body):
        self.calls.append((name, body))
        if name == "reserve_gemini_attempt":
            for project in body["p_projects"]:
                if ("project", project["id"]) in self.blocks or ("model", project["id"], body["p_model"]) in self.blocks:
                    continue
                for key in project["key_ids"]:
                    if ("key", key) not in self.blocks:
                        return {"allowed": True, "project_id": project["id"], "key_id": key}
            return {"allowed": False, "code": "quota", "retry_after": 60}
        claim = next(parameters for action, parameters in reversed(self.calls[:-1])
                     if action == "reserve_gemini_attempt" and parameters["p_id"] == body["p_id"])
        if body["p_scope"]:
            projects = claim["p_projects"]
            for project in projects:
                if ("project", project["id"]) in self.blocks or ("model", project["id"], claim["p_model"]) in self.blocks:
                    continue
                key = next((key for key in project["key_ids"] if ("key", key) not in self.blocks), None)
                if key is None:
                    continue
                item = ("key", key) if body["p_scope"] == "key" else (
                    ("model", project["id"], claim["p_model"]) if body["p_scope"] == "model" else ("project", project["id"])
                )
                self.blocks.add(item)
                break


def successful_response():
    return httpx.Response(200, json={"candidates": [{"finishReason": "STOP", "content": {"parts": [
        {"text": json.dumps(DRAFT)},
    ]}}]})


def run_provider(responder, **settings_changes):
    async def run():
        settings = Settings(_env_file=None, gemini_api_key="key-one", **settings_changes)
        pool = MockReservations()
        calls = []

        def transport(request):
            calls.append(request)
            return responder(request, len(calls))

        async with httpx.AsyncClient(transport=httpx.MockTransport(transport)) as client:
            try:
                result = await GeminiProvider(settings, client, pool).generate(TEXT)
            except HTTPException as error:
                result = error
        return result, calls, pool.calls
    return asyncio.run(run())


def test_default_model_order_and_fallback_after_identified_rpm():
    result, calls, operations = run_provider(lambda _request, n: httpx.Response(429, json=quota()) if n == 1 else successful_response())
    assert result.correctAnswer == "(B) be"
    assert [request.url.path.split("/")[-1] for request in calls] == [
        "gemini-3.8-flash:generateContent", "gemini-3.7-flash:generateContent",
    ]
    assert next(body for name, body in operations if name == "finish_gemini_attempt")["p_seconds"] == 60


def test_unknown_quota_stops_the_project_and_sends_no_blind_fallback():
    result, calls, _ = run_provider(lambda _request, _n: httpx.Response(429, json={"error": {}}))
    assert result.status_code == 429 and len(calls) == 1
    assert result.headers["Retry-After"] == "60"


def test_daily_model_quota_falls_back_and_keeps_a_24h_marker():
    result, calls, operations = run_provider(
        lambda _request, n: httpx.Response(429, json=quota("RPD")) if n == 1 else successful_response()
    )
    assert result.correctAnswer == "(B) be" and len(calls) == 2
    marker = next(body for name, body in operations if name == "finish_gemini_attempt")
    assert marker["p_scope"] == "model" and marker["p_seconds"] == 86400


def test_all_four_models_are_tried_in_priority_order_when_each_is_unavailable():
    result, calls, _ = run_provider(lambda _request, _n: httpx.Response(503))
    assert result.status_code == 429 and len(calls) == 4
    assert [r.url.path.split("/")[-1].split(":")[0] for r in calls] == Settings(_env_file=None).effective_gemini_models


def test_503_can_fall_back_but_invalid_json_or_truncated_answer_cannot():
    result, calls, _ = run_provider(lambda _r, n: httpx.Response(503) if n == 1 else successful_response())
    assert result.correctAnswer == "(B) be" and len(calls) == 2
    result, calls, _ = run_provider(lambda _r, _n: httpx.Response(200, json={"candidates": [{"finishReason": "MAX_TOKENS"}]}))
    assert result.status_code == 502 and len(calls) == 1


def test_network_timeout_is_ambiguous_and_does_not_duplicate_generation():
    def timeout(request, _n):
        raise httpx.ReadTimeout("must not echo upstream secrets", request=request)
    result, calls, operations = run_provider(timeout)
    assert result.status_code == 503 and len(calls) == 1
    assert "upstream" not in result.detail
    assert operations[-1][1]["p_reason"] == "network"


def test_outbound_attempts_are_bounded():
    result, calls, _ = run_provider(lambda _r, _n: httpx.Response(503), gemini_max_attempts=2)
    assert isinstance(result, HTTPException) and len(calls) == 2


def test_total_deadline_also_bounds_a_slow_reservation_rpc():
    async def run():
        settings = Settings(_env_file=None, gemini_api_key="key-one").model_copy(
            update={"gemini_total_timeout_seconds": 0.01}
        )
        async def stalled_rpc(_name, _body):
            await asyncio.Event().wait()
        async with httpx.AsyncClient(transport=httpx.MockTransport(lambda _r: pytest.fail("No outbound generation"))) as client:
            with pytest.raises(HTTPException) as failure:
                await GeminiProvider(settings, client, stalled_rpc).generate(TEXT)
            assert failure.value.status_code == 503
    asyncio.run(run())


def test_only_a_structurally_invalid_key_is_immediately_rotated():
    async def run():
        settings = Settings(_env_file=None, gemini_api_keys=["invalid-key", "healthy-key"])
        pool, keys = MockReservations(), []

        def transport(request):
            keys.append(request.headers["x-goog-api-key"])
            if len(keys) == 1:
                return httpx.Response(400, json={"error": {"details": [
                    {"@type": "type.googleapis.com/google.rpc.ErrorInfo", "reason": "API_KEY_INVALID"},
                ]}})
            return successful_response()
        async with httpx.AsyncClient(transport=httpx.MockTransport(transport)) as client:
            assert (await GeminiProvider(settings, client, pool).generate(TEXT)).correctAnswer == "(B) be"
        assert keys == ["invalid-key", "healthy-key"]
        assert next(body for name, body in pool.calls if name == "finish_gemini_attempt")["p_reason"] == "invalid_key"
    asyncio.run(run())


def test_independent_project_can_continue_when_another_is_throttled():
    async def run():
        settings = Settings(_env_file=None, gemini_projects=[
            {"project_id": "toeic-one", "api_keys": ["key-one", "key-two"]},
            {"project_id": "toeic-two", "api_keys": ["key-three"]},
        ])
        pool = MockReservations()
        keys = []

        def transport(request):
            keys.append(request.headers["x-goog-api-key"])
            return httpx.Response(429, json={"error": {}}) if len(keys) == 1 else successful_response()
        async with httpx.AsyncClient(transport=httpx.MockTransport(transport)) as client:
            assert (await GeminiProvider(settings, client, pool).generate(TEXT)).correctAnswer == "(B) be"
        assert keys == ["key-one", "key-three"], "All keys in a throttled project must be skipped"
        assert "key-one" not in json.dumps(pool.calls) and TEXT not in json.dumps(pool.calls)
    asyncio.run(run())


def test_key_pool_config_keeps_secrets_out_of_repr_and_rejects_duplicate_assignment():
    settings = Settings(_env_file=None, gemini_projects=[{"project_id": "toeic-one", "api_keys": ["private-key"]}])
    assert "private-key" not in repr(settings) and "private-key" not in settings.model_dump_json()
    with pytest.raises(ValidationError, match="distinct"):
        Settings(_env_file=None, gemini_projects=[
            {"project_id": "toeic-one", "api_keys": ["same-key"]},
            {"project_id": "toeic-two", "api_keys": ["same-key"]},
        ])
    with pytest.raises(ValidationError, match="not both"):
        Settings(_env_file=None, gemini_api_key="legacy", gemini_projects=[
            {"project_id": "toeic-one", "api_keys": ["new-key"]},
        ])
