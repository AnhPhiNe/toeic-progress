import json
from contextlib import contextmanager
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.main import create_app

OWNER = "11111111-1111-4111-8111-111111111111"
STAMP = "2026-10-23T00:00:00Z"
OPENAI = "api.openai.com"
SESSION = {"id": "attempt-a", "updated_at": STAMP, "skill_type": "LR", "session_type": "FULL_TEST",
           "test_name": "ETS A", "study_date": "2026-10-23", "scaled_listening": 350, "scaled_reading": 300,
           "total_score": 650, **{f"part{part}_correct": maximum - 1 for part, maximum in enumerate([6, 25, 39, 30, 30, 16, 54], 1)}}
NOTE = {"id": "note-a", "updated_at": STAMP, "session_id": "attempt-a", "part": 5,
        "category": "ADVANCED_GRAMMAR", "question_context": "The report must be ____.",
        "user_mistake": "A", "correct_answer": "B submitted", "trap_tip": "Đối chiếu cấu trúc bị động.",
        "options": ["A submit", "B submitted"], "tags": [], "extra": {"answerSource": "PROVIDED"}}
ADVICE = {"priorities": [{"title": "Part 5: câu bị động", "observation": "Part 1 bạn làm chắc tay. Câu bị động ở Part 5 bạn đã ghi lại nên sửa trước.",
                          "practice": "Mở Sổ tay, làm lại câu đã lưu, gạch chân động từ và giải thích vì sao loại từng phương án.",
                          "part": 5, "evidenceIds": ["note-a"], "minutes": 15}]}


def completed(text: str, status="completed"):
    return {"status": status, "usage": {"input_tokens": 1200, "output_tokens": 900},
            "output": [{"type": "reasoning"}, {"type": "message", "role": "assistant", "status": "completed",
                                               "content": [{"type": "output_text", "text": text}]}]}


@contextmanager
def analysis_api(*, session=SESSION, notes=None, advice=ADVICE, raw=None, guest=False, grant="active", quota=True,
                 key="private-openai-key", provider_status=200, provider_json=None, output_status="completed",
                 transport_error=None, retry_after="60", **settings_patch):
    calls = []

    def respond(request):
        body = json.loads(request.content) if request.content else None
        calls.append((request.url, body, dict(request.headers)))
        path = request.url.path
        if path == "/auth/v1/user":
            return httpx.Response(200, json={"id": OWNER, "is_anonymous": guest})
        if path == "/rest/v1/rpc/get_ai_access":
            return httpx.Response(200, json={"status": grant, "plan": "free", "monthlyLimit": 10, "unlimited": False})
        if path == "/rest/v1/study_sessions":
            return httpx.Response(200, json=[session] if session else [])
        if path == "/rest/v1/mistakes":
            return httpx.Response(200, json=[NOTE] if notes is None else notes)
        if path.endswith("/reserve_ai_request"):
            return httpx.Response(200, json={"allowed": quota, "remaining": 9, "limit": 10})
        if path == "/rest/v1/rpc/ai_quota_status":
            return httpx.Response(200, json=[])
        if request.url.host == OPENAI:
            if transport_error:
                raise transport_error("Never expose private provider details or private-openai-key", request=request)
            if provider_status != 200:
                return httpx.Response(provider_status, json=provider_json or {"error": {"message": "private upstream details"}},
                                      headers={"Retry-After": retry_after})
            return httpx.Response(200, json=completed(raw if raw is not None else json.dumps(advice), output_status))
        raise AssertionError(f"Unexpected path {path}")

    settings = Settings(_env_file=None, supabase_url="https://database.example", supabase_publishable_key="public",
                        supabase_secret_key="backend-secret", rate_limit_secret="rate-secret",
                        openai_api_key=key, ai_access_managed=True, **settings_patch)
    with TestClient(create_app(settings, httpx.MockTransport(respond))) as client:
        client.headers["Authorization"] = "Bearer learner-token"
        yield client, calls


def payload(**patch):
    return {"attemptId": "attempt-a", "sessionVersion": STAMP, "noteVersions": {"note-a": STAMP},
            "request_id": "22222222-2222-4222-8222-222222222222", "consent": True, "provider": "openai", **patch}


def openai_calls(calls):
    return [(url, body, headers) for url, body, headers in calls if url.host == OPENAI]


def test_analysis_is_owner_scoped_quota_counted_and_sent_once_to_luna_with_a_strict_schema():
    with analysis_api() as (client, calls):
        response = client.post("/api/v1/ai/analyze-attempt", json=payload())
        assert response.status_code == 200, response.json()
        report = response.json()["report"]
        assert report["version"] == 2 and report["model"] == "gpt-6-luna"
        assert report["priorities"] == ADVICE["priorities"]
        assert report["parts"][4] == {"part": 5, "correct": 29, "total": 30, "wrong": 1}
        assert report["linkedNotes"] == report["sampledNotes"] == 1
        assert len(report["signature"]) == 64
        assert response.json()["usage"]["remaining"] == 9
        reads = [url for url, _, _ in calls if url.path in ("/rest/v1/study_sessions", "/rest/v1/mistakes")]
        assert all(url.params["user_id"] == "eq." + OWNER and "deleted_at" not in url.params for url in reads)
        assert reads[0].params["id"] == reads[1].params["session_id"] == "eq.attempt-a"
        reserve = next(body for url, body, _ in calls if url.path.endswith("/reserve_ai_request"))
        assert reserve["p_user_id"] == OWNER
        provider = openai_calls(calls)
        assert len(provider) == 1
        url, body, headers = provider[0]
        assert str(url) == "https://api.openai.com/v1/responses"
        assert headers["authorization"] == "Bearer private-openai-key"
        assert body["model"] == "gpt-6-luna" and body["reasoning"] == {"effort": "medium"}
        assert body["store"] is False and body["service_tier"] == "default" and body["max_output_tokens"] == 6144
        assert "temperature" not in body and "top_p" not in body
        assert len(body["safety_identifier"]) == 64 and OWNER not in json.dumps(body)
        assert "backend-secret" not in json.dumps(body)
        assert "thân mật kiểu bạn bè" in body["instructions"] and "Sổ tay" in body["instructions"]
        fmt = body["text"]["format"]
        assert fmt["type"] == "json_schema" and fmt["strict"] is True
        schema = fmt["schema"]
        assert schema["additionalProperties"] is False and "$defs" not in schema
        priority = schema["properties"]["priorities"]["items"]
        assert priority["additionalProperties"] is False
        assert set(priority["required"]) == set(priority["properties"])
        assert schema["properties"]["priorities"]["maxItems"] == 2
        # Generation is narrowed to this attempt's own Parts and saved wrong questions.
        assert priority["properties"]["evidenceIds"]["items"]["enum"] == ["note-a"]
        assert priority["properties"]["part"]["anyOf"][0]["enum"] == [1, 2, 3, 4, 5, 6, 7]


def test_reasoning_effort_and_output_limit_are_settings():
    with analysis_api(openai_advice_reasoning_effort="low", openai_advice_max_output_tokens=4096) as (client, calls):
        assert client.post("/api/v1/ai/analyze-attempt", json=payload()).status_code == 200
        body = openai_calls(calls)[0][1]
        assert body["reasoning"] == {"effort": "low"} and body["max_output_tokens"] == 4096


def test_analysis_receives_only_valid_confirmed_elapsed_times_without_deriving_scopes():
    timing = {"source": "IMAGE_CONFIRMED", "totalSeconds": 6721, "listeningSeconds": None,
              "readingSeconds": None, "parts": {f"part{part}": None for part in range(1, 8)}}
    with analysis_api(session={**SESSION, "extra": {"resultTiming": timing, "partDurations": {"part5": 14}}}) as (client, calls):
        assert client.post("/api/v1/ai/analyze-attempt", json=payload()).status_code == 200
        request = openai_calls(calls)[0][1]
        snapshot = json.loads(request["input"][0]["content"][0]["text"])
        assert snapshot["confirmedElapsedTiming"] == timing
        assert "không chứng minh thiếu giờ" in request["instructions"]
        assert "extra" in next(url for url, _, _ in calls if url.path == "/rest/v1/study_sessions").params["select"]
    with analysis_api(session={**SESSION, "extra": {"resultTiming": {"source": "AI", "totalSeconds": 6721}}}) as (client, calls):
        assert client.post("/api/v1/ai/analyze-attempt", json=payload()).status_code == 200
        request = openai_calls(calls)[0][1]
        assert json.loads(request["input"][0]["content"][0]["text"])["confirmedElapsedTiming"] is None


@pytest.mark.parametrize("patch", [{"sessionVersion": "2026-10-22T00:00:00Z"}, {"noteVersions": {}},
                                  {"noteVersions": {"note-a": "2026-10-22T00:00:00Z"}},
                                  {"noteVersions": {"note-a": STAMP, "other-attempt-note": STAMP}}])
def test_unsynced_selected_snapshot_does_not_spend_quota_or_call_provider(patch):
    with analysis_api() as (client, calls):
        response = client.post("/api/v1/ai/analyze-attempt", json=payload(**patch))
        assert response.status_code == 409
        assert response.headers["X-Error-Code"] == "ANALYSIS_WAIT_SYNC"
        assert not any(url.host == OPENAI or url.path.endswith("/reserve_ai_request") for url, _, _ in calls)


@pytest.mark.parametrize("kwargs,expected", [({"guest": True}, 403), ({"grant": "pending"}, 403),
                                            ({"grant": "blocked"}, 403), ({"key": ""}, 503),
                                            ({"ai_enabled": False}, 503),
                                            ({"quota": False}, 429), ({"session": None}, 404)])
def test_analysis_denied_without_upstream_generation(kwargs, expected):
    with analysis_api(**kwargs) as (client, calls):
        assert client.post("/api/v1/ai/analyze-attempt", json=payload()).status_code == expected
        assert not openai_calls(calls)


@pytest.mark.parametrize("patch", [{"consent": False}, {"provider": "deepinfra"}, {"provider": None}])
def test_missing_consent_or_another_recipient_is_refused_before_quota(patch):
    body = payload(**patch)
    if patch.get("provider", "") is None:
        body.pop("provider")
    with analysis_api() as (client, calls):
        assert client.post("/api/v1/ai/analyze-attempt", json=body).status_code == 422
        assert not any(url.host == OPENAI or url.path.endswith("/reserve_ai_request") for url, _, _ in calls)


@pytest.mark.parametrize("patch", [{"evidenceIds": ["foreign-note"]}, {"part": 6}, {"title": "Đảm bảo tăng 100 điểm"},
                                  {"practice": "Mở https://untrusted.example để học."}, {"evidenceIds": [], "part": None}])
def test_ungrounded_or_unsafe_advice_is_rejected_without_retry(patch, caplog):
    advice = {"priorities": [{**ADVICE["priorities"][0], **patch}]}
    with analysis_api(advice=advice) as (client, calls):
        reply = client.post("/api/v1/ai/analyze-attempt", json=payload())
        assert reply.status_code == 502
        assert reply.headers["X-Error-Code"] == "ANALYSIS_INVALID_OUTPUT"
        assert len(openai_calls(calls)) == 1
        # Logs carry no advice text or learner data.
        assert "untrusted.example" not in caplog.text and "bị động" not in caplog.text


@pytest.mark.parametrize("kwargs", [
    {"raw": "not JSON"},
    {"raw": json.dumps({"priorities": []})},
    {"raw": json.dumps({"priorities": [{**ADVICE["priorities"][0], "extra": "field"}]})},
    {"raw": json.dumps({"priorities": [{key: value for key, value in ADVICE["priorities"][0].items() if key != "minutes"}]})},
    {"output_status": "incomplete"},
])
def test_schema_invalid_or_incomplete_output_is_502_and_not_retried(kwargs):
    with analysis_api(**kwargs) as (client, calls):
        reply = client.post("/api/v1/ai/analyze-attempt", json=payload())
        assert reply.status_code == 502
        assert reply.headers["X-Error-Code"] == "ANALYSIS_INVALID_OUTPUT"
        assert len(openai_calls(calls)) == 1
        assert sum(url.path.endswith("/reserve_ai_request") for url, _, _ in calls) == 1


@pytest.mark.parametrize("error,status,code,message", [
    (httpx.ReadTimeout, 504, "ANALYSIS_PROVIDER_TIMEOUT", "60 giây"),
    (httpx.ConnectTimeout, 504, "ANALYSIS_PROVIDER_TIMEOUT", "60 giây"),
    (httpx.ConnectError, 503, "ANALYSIS_PROVIDER_CONNECTION", "kết nối ổn định"),
    (httpx.ReadError, 503, "ANALYSIS_PROVIDER_CONNECTION", "kết nối ổn định"),
])
def test_timeout_and_transport_failures_are_not_retried_or_logged_with_secrets(error, status, code, message, caplog):
    with analysis_api(transport_error=error) as (client, calls):
        reply = client.post("/api/v1/ai/analyze-attempt", json=payload())
        assert reply.status_code == status
        assert reply.headers["X-Error-Code"] == code
        assert message in reply.json()["detail"]
        assert len(openai_calls(calls)) == 1
        assert error.__name__ in caplog.text
        assert reply.headers["X-Request-ID"] in caplog.text
        assert "private-openai-key" not in reply.text + caplog.text
        assert "private provider details" not in reply.text + caplog.text


def test_timeout_uses_the_advice_timeout_setting():
    with analysis_api(transport_error=httpx.ReadTimeout, openai_advice_timeout_seconds=30) as (client, _calls):
        assert "30 giây" in client.post("/api/v1/ai/analyze-attempt", json=payload()).json()["detail"]


@pytest.mark.parametrize("status,provider_json,code,text", [
    (400, None, "ANALYSIS_PROVIDER_CONFIG", "cấu hình model"),
    (404, None, "ANALYSIS_PROVIDER_CONFIG", "cấu hình model"),
    (401, None, "ANALYSIS_PROVIDER_ACCESS", "khóa và quyền dịch vụ"),
    (403, None, "ANALYSIS_PROVIDER_ACCESS", "khóa và quyền dịch vụ"),
    (429, {"error": {"code": "insufficient_quota"}}, "ANALYSIS_PROVIDER_BILLING", "hạn mức thanh toán"),
    (429, {"error": {"code": "rate_limit_exceeded"}}, "ANALYSIS_PROVIDER_RATE", "giới hạn tốc độ"),
    (500, None, "ANALYSIS_PROVIDER_UNAVAILABLE", "tạm gặp sự cố"),
])
def test_upstream_failure_has_specific_safe_feedback_without_retry(status, provider_json, code, text):
    with analysis_api(provider_status=status, provider_json=provider_json, retry_after="75") as (client, calls):
        reply = client.post("/api/v1/ai/analyze-attempt", json=payload())
        rate = code == "ANALYSIS_PROVIDER_RATE"
        assert reply.status_code == (429 if rate else 503)
        assert reply.headers["X-Error-Code"] == code
        assert text in reply.json()["detail"]
        assert "private-openai-key" not in reply.text and "private upstream details" not in reply.text
        if rate:
            assert reply.headers["Retry-After"] == "75"
        assert len(openai_calls(calls)) == 1


def test_blank_drafts_and_total_only_are_insufficient_without_spending_ai():
    session = {**SESSION, **{f"part{part}_correct": None for part in range(1, 8)}}
    blank = {**NOTE, "options": [], "correct_answer": "", "trap_tip": "", "user_mistake": "", "extra": {}}
    with analysis_api(session=session, notes=[blank]) as (client, calls):
        assert client.post("/api/v1/ai/analyze-attempt", json=payload()).status_code == 422
        assert not any(url.host == OPENAI or url.path.endswith("/reserve_ai_request") for url, _, _ in calls)


def test_useful_numbered_lesson_steps_and_grammar_notation_are_allowed():
    advice = {"priorities": [{**ADVICE["priorities"][0],
                "practice": "Bước 1: tìm động từ. Bước 2: đối chiếu S + be + V3 ở câu Part 5 trước khi xem đáp án."}]}
    with analysis_api(advice=advice) as (client, _calls):
        response = client.post("/api/v1/ai/analyze-attempt", json=payload())
        assert response.status_code == 200
        assert "V3" in response.json()["report"]["priorities"][0]["practice"]


def test_unknown_part_in_prose_is_rejected_even_when_evidence_id_is_real():
    advice = {"priorities": [{**ADVICE["priorities"][0], "observation": "Bạn nên luyện Part 9 để cải thiện."}]}
    with analysis_api(advice=advice) as (client, _calls):
        assert client.post("/api/v1/ai/analyze-attempt", json=payload()).status_code == 502


@pytest.mark.parametrize("source", ["Another test", ""])
def test_card_moved_to_another_source_is_not_evidence_for_its_historical_session(source):
    notes = [{**NOTE, "extra": {"sourceTestName": source}}]
    # Statistical advice remains possible without claiming a cause from this note.
    advice = {"priorities": [{**ADVICE["priorities"][0], "evidenceIds": []}]}
    with analysis_api(notes=notes, advice=advice) as (client, calls):
        response = client.post("/api/v1/ai/analyze-attempt", json=payload())
        assert response.status_code == 200
        assert response.json()["report"]["linkedNotes"] == 0
        sent = openai_calls(calls)[0][1]
        assert json.loads(sent["input"][0]["content"][0]["text"])["evidence"] == []
        # Without saved questions the model cannot name any evidence ID.
        assert sent["text"]["format"]["schema"]["properties"]["priorities"]["items"]["properties"]["evidenceIds"]["maxItems"] == 0


def test_equivalent_normalized_source_name_retains_attempt_evidence():
    notes = [{**NOTE, "extra": {"sourceTestName": "  ＥＴＳ   A  "}}]
    with analysis_api(notes=notes) as (client, _calls):
        response = client.post("/api/v1/ai/analyze-attempt", json=payload())
        assert response.status_code == 200
        assert response.json()["report"]["linkedNotes"] == 1


def test_extra_client_text_or_owner_is_forbidden_and_auth_required():
    with analysis_api() as (client, _calls):
        assert client.post("/api/v1/ai/analyze-attempt", json=payload(owner="foreign", text="untrusted")).status_code == 422
        client.headers.pop("Authorization")
        assert client.post("/api/v1/ai/analyze-attempt", json=payload()).status_code == 401


def test_health_reports_attempt_advice_with_openai_readiness():
    with analysis_api() as (client, _calls):
        assert client.get("/health").json()["attempt_analysis"] is True
    with analysis_api(key="") as (client, _calls):
        health = client.get("/health").json()
        assert health["attempt_analysis"] is False and health["ai_configured"] is False


def test_no_deepinfra_setting_or_code_path_remains():
    assert not any("deepinfra" in name for name in Settings.model_fields)
    backend = Path(__file__).resolve().parents[1]
    sources = [*backend.joinpath("app").rglob("*.py"), backend / ".env.example", backend / "render.yaml"]
    assert not [path.name for path in sources if "deepinfra" in path.read_text(encoding="utf-8").lower()]
