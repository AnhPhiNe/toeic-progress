import json
from contextlib import contextmanager

import httpx
import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.main import create_app

OWNER = "11111111-1111-4111-8111-111111111111"
STAMP = "2026-10-23T00:00:00Z"
SESSION = {"id": "attempt-a", "updated_at": STAMP, "skill_type": "LR", "session_type": "FULL_TEST",
           "test_name": "ETS A", "study_date": "2026-10-23", "scaled_listening": 350, "scaled_reading": 300,
           "total_score": 650, **{f"part{part}_correct": maximum - 1 for part, maximum in enumerate([6, 25, 39, 30, 30, 16, 54], 1)}}
NOTE = {"id": "note-a", "updated_at": STAMP, "session_id": "attempt-a", "part": 5,
        "category": "ADVANCED_GRAMMAR", "question_context": "The report must be ____.",
        "user_mistake": "A", "correct_answer": "B submitted", "trap_tip": "Đối chiếu cấu trúc bị động.",
        "options": ["A submit", "B submitted"], "tags": [], "extra": {"answerSource": "PROVIDED"}}
ADVICE = {"priorities": [{"title": "Đối chiếu cấu trúc bị động", "observation": "Câu đã lưu có cấu trúc bị động cần đối chiếu.",
                          "practice": "Làm lại câu đã lưu, gạch chân động từ và giải thích vì sao loại từng phương án.",
                          "part": 5, "evidenceIds": ["note-a"], "minutes": 15}]}


@contextmanager
def analysis_api(*, session=SESSION, notes=None, advice=ADVICE, guest=False, grant="active", quota=True,
                 key="deepinfra-test-secret", provider_status=200, finish="stop"):
    calls = []

    def respond(request):
        body = json.loads(request.content) if request.content else None
        calls.append((request.url, body, dict(request.headers)))
        path = request.url.path
        if path == "/auth/v1/user":
            return httpx.Response(200, json={"id": OWNER, "is_anonymous": guest})
        if path == "/rest/v1/ai_access_grants":
            return httpx.Response(200, json=[{"status": grant, "monthly_limit": 10}])
        if path == "/rest/v1/study_sessions":
            return httpx.Response(200, json=[session] if session else [])
        if path == "/rest/v1/mistakes":
            return httpx.Response(200, json=[NOTE] if notes is None else notes)
        if path.endswith("/reserve_ai_request"):
            return httpx.Response(200, json={"allowed": quota, "remaining": 9, "limit": 10})
        if path == "/rest/v1/ai_usage_counters":
            return httpx.Response(200, json=[])
        if request.url.host == "api.deepinfra.com":
            return httpx.Response(provider_status, json={"choices": [{"finish_reason": finish, "message": {"content": json.dumps(advice)}}]})
        raise AssertionError(f"Unexpected path {path}")

    settings = Settings(_env_file=None, supabase_url="https://database.example", supabase_publishable_key="public",
                        supabase_secret_key="backend-secret", rate_limit_secret="rate-secret", deepinfra_api_key=key,
                        openai_api_key="openai-test", ai_access_managed=True)
    with TestClient(create_app(settings, httpx.MockTransport(respond))) as client:
        client.headers["Authorization"] = "Bearer learner-token"
        yield client, calls


def payload(**patch):
    return {"attemptId": "attempt-a", "sessionVersion": STAMP, "noteVersions": {"note-a": STAMP},
            "request_id": "22222222-2222-4222-8222-222222222222", "consent": True, **patch}


def test_analysis_is_owner_scoped_quota_counted_and_numeric_facts_are_server_computed():
    with analysis_api() as (client, calls):
        response = client.post("/api/v1/ai/analyze-attempt", json=payload())
        assert response.status_code == 200, response.json()
        report = response.json()["report"]
        assert report["parts"][4] == {"part": 5, "correct": 29, "total": 30, "wrong": 1}
        assert report["linkedNotes"] == report["sampledNotes"] == 1
        assert len(report["signature"]) == 64
        reads = [url for url, _, _ in calls if url.path in ("/rest/v1/study_sessions", "/rest/v1/mistakes")]
        assert all(url.params["user_id"] == "eq." + OWNER and url.params["deleted_at"] == "is.null" for url in reads)
        assert reads[0].params["id"] == reads[1].params["session_id"] == "eq.attempt-a"
        reserve = next(body for url, body, _ in calls if url.path.endswith("/reserve_ai_request"))
        assert reserve["p_owner_id"] == OWNER
        provider = [(url, body, headers) for url, body, headers in calls if url.host == "api.deepinfra.com"]
        assert len(provider) == 1
        assert provider[0][1]["model"] == "deepseek-ai/DeepSeek-V4.1-Flash-1017"
        assert provider[0][1]["response_format"] == {"type": "json_object"}
        assert provider[0][1]["reasoning_effort"] == "medium"
        assert provider[0][2]["authorization"] == "Bearer deepinfra-test-secret"
        assert "backend-secret" not in json.dumps(provider[0][1])


def test_analysis_receives_only_valid_confirmed_elapsed_times_without_deriving_scopes():
    timing = {"source": "IMAGE_CONFIRMED", "totalSeconds": 6721, "listeningSeconds": None,
              "readingSeconds": None, "parts": {f"part{part}": None for part in range(1, 8)}}
    with analysis_api(session={**SESSION, "extra": {"resultTiming": timing, "partDurations": {"part5": 14}}}) as (client, calls):
        assert client.post("/api/v1/ai/analyze-attempt", json=payload()).status_code == 200
        request = next(body for url, body, _ in calls if url.host == "api.deepinfra.com")
        snapshot = json.loads(request["messages"][1]["content"])
        assert snapshot["confirmedElapsedTiming"] == timing
        assert "không chứng minh thiếu giờ" in request["messages"][0]["content"]
        assert "extra" in next(url for url, _, _ in calls if url.path == "/rest/v1/study_sessions").params["select"]
    with analysis_api(session={**SESSION, "extra": {"resultTiming": {"source": "AI", "totalSeconds": 6721}}}) as (client, calls):
        assert client.post("/api/v1/ai/analyze-attempt", json=payload()).status_code == 200
        request = next(body for url, body, _ in calls if url.host == "api.deepinfra.com")
        assert json.loads(request["messages"][1]["content"])["confirmedElapsedTiming"] is None


@pytest.mark.parametrize("patch", [{"sessionVersion": "2026-10-22T00:00:00Z"}, {"noteVersions": {}},
                                  {"noteVersions": {"note-a": "2026-10-22T00:00:00Z"}},
                                  {"noteVersions": {"note-a": STAMP, "other-attempt-note": STAMP}}])
def test_unsynced_selected_snapshot_does_not_spend_quota_or_call_provider(patch):
    with analysis_api() as (client, calls):
        response = client.post("/api/v1/ai/analyze-attempt", json=payload(**patch))
        assert response.status_code == 409
        assert response.headers["X-Error-Code"] == "ANALYSIS_WAIT_SYNC"
        assert not any(url.host == "api.deepinfra.com" or url.path.endswith("/reserve_ai_request") for url, _, _ in calls)


@pytest.mark.parametrize("kwargs,expected", [({"guest": True}, 403), ({"grant": "pending"}, 403),
                                            ({"grant": "blocked"}, 403), ({"key": ""}, 503),
                                            ({"quota": False}, 429), ({"session": None}, 404)])
def test_analysis_denied_without_upstream_generation(kwargs, expected):
    with analysis_api(**kwargs) as (client, calls):
        assert client.post("/api/v1/ai/analyze-attempt", json=payload()).status_code == expected
        assert not any(url.host == "api.deepinfra.com" for url, _, _ in calls)


@pytest.mark.parametrize("patch", [{"evidenceIds": ["foreign-note"]}, {"part": 6}, {"title": "Đảm bảo tăng 100 điểm"},
                                  {"practice": "Mở https://untrusted.example để học."}, {"evidenceIds": [], "part": None}])
def test_unverifiable_or_unsafe_model_advice_is_not_displayed_or_retried(patch):
    advice = {"priorities": [{**ADVICE["priorities"][0], **patch}]}
    with analysis_api(advice=advice) as (client, calls):
        assert client.post("/api/v1/ai/analyze-attempt", json=payload()).status_code == 502
        assert sum(url.host == "api.deepinfra.com" for url, _, _ in calls) == 1


@pytest.mark.parametrize("kwargs", [{"provider_status": 429}, {"finish": "length"}])
def test_provider_failure_is_not_automatically_retried(kwargs):
    with analysis_api(**kwargs) as (client, calls):
        expected = 429 if kwargs.get('provider_status') == 429 else 502
        assert client.post("/api/v1/ai/analyze-attempt", json=payload()).status_code == expected
        assert sum(url.host == "api.deepinfra.com" for url, _, _ in calls) == 1


@pytest.mark.parametrize('status,code,text', [
    (400, 'ANALYSIS_PROVIDER_CONFIG', 'cấu hình model'),
    (404, 'ANALYSIS_PROVIDER_CONFIG', 'cấu hình model'),
    (422, 'ANALYSIS_PROVIDER_CONFIG', 'cấu hình model'),
    (401, 'ANALYSIS_PROVIDER_ACCESS', 'khóa và quyền dịch vụ'),
    (403, 'ANALYSIS_PROVIDER_ACCESS', 'khóa và quyền dịch vụ'),
    (402, 'ANALYSIS_PROVIDER_BILLING', 'hạn mức thanh toán'),
    (429, 'ANALYSIS_PROVIDER_RATE', 'giới hạn tốc độ'),
    (503, 'ANALYSIS_PROVIDER_UNAVAILABLE', 'tạm gặp sự cố'),
])
def test_upstream_failure_has_specific_safe_feedback_without_retry(status, code, text):
    with analysis_api(provider_status=status) as (client, calls):
        reply = client.post('/api/v1/ai/analyze-attempt', json=payload())
        assert reply.status_code == (429 if status == 429 else 503)
        assert reply.headers['X-Error-Code'] == code
        assert text in reply.json()['detail']
        assert 'deepinfra-test-secret' not in reply.text
        if status == 429:
            assert reply.headers['Retry-After'] == '60'
        assert sum(url.host == 'api.deepinfra.com' for url, _, _ in calls) == 1


def test_blank_drafts_and_total_only_are_insufficient_without_spending_ai():
    session = {**SESSION, **{f"part{part}_correct": None for part in range(1, 8)}}
    blank = {**NOTE, "options": [], "correct_answer": "", "trap_tip": "", "user_mistake": "", "extra": {}}
    with analysis_api(session=session, notes=[blank]) as (client, calls):
        assert client.post("/api/v1/ai/analyze-attempt", json=payload()).status_code == 422
        assert not any(url.host == "api.deepinfra.com" or url.path.endswith("/reserve_ai_request") for url, _, _ in calls)


def test_useful_numbered_lesson_steps_and_grammar_notation_are_allowed():
    advice = {"priorities": [{**ADVICE["priorities"][0],
                "practice": "Bước 1: tìm động từ. Bước 2: đối chiếu S + be + V3 ở câu Part 5 trước khi xem đáp án."}]}
    with analysis_api(advice=advice) as (client, calls):
        response = client.post("/api/v1/ai/analyze-attempt", json=payload())
        assert response.status_code == 200
        assert "V3" in response.json()["report"]["priorities"][0]["practice"]


def test_unknown_part_in_prose_is_rejected_even_when_evidence_id_is_real():
    advice = {"priorities": [{**ADVICE["priorities"][0], "observation": "Bạn nên luyện Part 9 để cải thiện."}]}
    with analysis_api(advice=advice) as (client, calls):
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
        sent = next(body for url, body, _ in calls if url.host == "api.deepinfra.com")
        assert json.loads(sent["messages"][1]["content"])["evidence"] == []


def test_equivalent_normalized_source_name_retains_attempt_evidence():
    notes = [{**NOTE, "extra": {"sourceTestName": "  ＥＴＳ   A  "}}]
    with analysis_api(notes=notes) as (client, calls):
        response = client.post("/api/v1/ai/analyze-attempt", json=payload())
        assert response.status_code == 200
        assert response.json()["report"]["linkedNotes"] == 1


def test_extra_client_text_or_owner_is_forbidden_and_auth_required():
    with analysis_api() as (client, calls):
        assert client.post("/api/v1/ai/analyze-attempt", json=payload(owner="foreign", text="untrusted")).status_code == 422
        client.headers.pop("Authorization")
        assert client.post("/api/v1/ai/analyze-attempt", json=payload()).status_code == 401
