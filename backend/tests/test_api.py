import json
from contextlib import contextmanager

import httpx
import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.main import create_app

USER_ID = "11111111-1111-4111-8111-111111111111"
DRAFT = {
    "part": 5,
    "category": "ADVANCED_GRAMMAR",
    "questionContext": "Reports must be submitted.",
    "userMistake": "",
    "correctAnswer": "(B) be",
    "trapTip": "Kiểm tra cấu trúc giả định.",
    "options": ["(A) are", "(B) be"],
    "tags": ["grammar"],
    "missingInformation": [],
    "answerSource": "PROVIDED",
}
TEXT = "Reports should ____ submitted. (A) are (B) be. Tôi chọn A. Đáp án chuẩn: B."


@pytest.fixture
def api():
    @contextmanager
    def make(
        *,
        guest=False,
        auth_status=200,
        reservation=None,
        captcha_host="localhost",
        gemini_status=200,
        draft=None,
        finish="STOP",
        backend_key="server-secret",
        api_reservation=None,
        readiness_status=200,
        settings_overrides=None,
    ):
        calls = []
        provider_blocked = False

        def respond(request):
            nonlocal provider_blocked
            body = (
                json.loads(request.content)
                if request.content and request.headers.get("content-type") == "application/json"
                else None
            )
            calls.append((request.url.host, request.url.path, body, dict(request.headers)))
            if request.url.path == "/auth/v1/user":
                return httpx.Response(auth_status, json={"id": USER_ID, "is_anonymous": guest})
            if request.url.path.endswith("/sync_account_records"):
                return httpx.Response(200, json={"cursor": 7, "records": [], "hasRecords": False})
            if request.url.path.endswith("/reserve_api_request"):
                return httpx.Response(200, json=api_reservation or {"allowed": True})
            if request.url.path in ("/rest/v1/api_rate_limits", "/rest/v1/user_profiles", "/rest/v1/ai_provider_state"):
                return httpx.Response(readiness_status, json=[])
            if request.url.path.endswith("/reserve_ai_request"):
                return httpx.Response(200, json=reservation or {"allowed": True, "remaining": 2, "limit": 3})
            if request.url.path.endswith("/get_ai_usage"):
                return httpx.Response(200, json={"remaining": 3, "limit": 3, "guest": guest})
            if request.url.path.endswith("/reserve_gemini_attempt"):
                if provider_blocked:
                    return httpx.Response(200, json={"allowed": False, "code": "quota", "retry_after": 60})
                project = body["p_projects"][0]
                return httpx.Response(200, json={
                    "allowed": True, "project_id": project["id"], "key_id": project["key_ids"][0],
                })
            if request.url.path.endswith("/finish_gemini_attempt"):
                provider_blocked = provider_blocked or body["p_scope"] == "project"
                return httpx.Response(200, json=None)
            if request.url.path.endswith("/reset_learning_data"):
                return httpx.Response(200, json={"cursor": 10, "records": [], "hasRecords": True, "resetBarrier": True})
            if request.url.host == "challenges.cloudflare.com":
                return httpx.Response(200, json={"success": True, "hostname": captcha_host, "action": "toeic-ai"})
            if request.url.host == "generativelanguage.googleapis.com":
                return httpx.Response(
                    gemini_status,
                    json={
                        "candidates": [
                            {"finishReason": finish, "content": {"parts": [{"text": json.dumps(draft or DRAFT)}]}}
                        ]
                    },
                )
            if request.url.path.startswith("/auth/v1/admin/users/"):
                return httpx.Response(200, json={})
            raise AssertionError(f"Unexpected request: {request.url}")

        settings = Settings(
            _env_file=None,
            supabase_url="https://database.example",
            supabase_publishable_key="public-key",
            supabase_secret_key=backend_key,
            gemini_api_key="gemini-secret",
            rate_limit_secret="rate-secret",
            turnstile_secret_key="captcha-secret",
            **(settings_overrides or {}),
        )
        with TestClient(create_app(settings, httpx.MockTransport(respond))) as client:
            client.headers["Authorization"] = "Bearer user-token"
            yield client, calls

    return make


def extraction(**extra):
    return {"text": TEXT, "consent": True, "request_id": "22222222-2222-4222-8222-222222222222", **extra}


def test_unconfigured_backend_starts_and_reports_readiness():
    with TestClient(create_app(Settings(_env_file=None))) as client:
        assert client.get("/health").json()["database_configured"] is False
        assert client.post("/api/v1/sync", json={}).status_code == 401


def test_sync_owner_is_derived_from_verified_token(api):
    with api() as (client, calls):
        assert client.post("/api/v1/sync", json={"records": [], "cursor": 0}).status_code == 200
        rpc = next(call for call in calls if call[1].endswith("/sync_account_records"))
        assert rpc[2]["p_owner_id"] == USER_ID
        assert rpc[3]["authorization"] == "Bearer server-secret"
        assert calls[0][3]["authorization"] == "Bearer user-token"
        assert client.post("/api/v1/sync", json={"records": [], "user_id": "another-owner"}).status_code == 422


def test_valid_json_payload_dates_survive_strict_validation(api):
    with api() as (client, calls):
        record = {
            "entity_type": "vocabLog",
            "record_id": "v1",
            "payload": {"id": "v1", "date": "2026-09-23", "count": 3},
            "updated_at": "2026-09-23T00:00:00Z",
            "deleted_at": None,
        }
        response = client.post("/api/v1/sync", json={"records": [record]})
        assert response.status_code == 200
        rpc = next(call for call in calls if call[1].endswith("/sync_account_records"))
        assert rpc[2]["p_records"][0]["payload"]["date"] == "2026-09-23"


def test_modern_secret_key_is_not_sent_as_a_bearer_jwt(api):
    with api(backend_key="sb_secret_test") as (client, calls):
        assert client.post("/api/v1/sync", json={}).status_code == 200
        assert client.delete("/api/v1/account").status_code == 200
        privileged = [call for call in calls if "/rest/v1/" in call[1] or "/auth/v1/admin/" in call[1]]
        assert len(privileged) == 2
        for call in privileged:
            assert call[3]["apikey"] == "sb_secret_test"
            assert "authorization" not in call[3]


def score_record(**scores):
    return {
        "entity_type": "sessions",
        "record_id": "score-test",
        "updated_at": "2026-10-05T00:00:00Z",
        "deleted_at": None,
        "payload": {
            "id": "score-test",
            "skillType": "LR",
            "sessionType": "FULL_TEST",
            "testName": "Score test",
            "date": "2026-10-05",
            "durationMinutes": 120,
            "createdAt": "2026-10-05T00:00:00Z",
            **scores,
        },
    }


@pytest.mark.parametrize(
    "scores",
    [
        {"scoreSource": "MANUAL_TOTAL", "totalScore": 800},
        {"scoreSource": "MANUAL_SECTIONS", "scaledListening": 445, "scaledReading": 350, "totalScore": 795},
        {
            "scoreSource": "ESTIMATED",
            "scaledListening": 490,
            "scaledReading": 365,
            "totalScore": 855,
            "rawListening": 87,
            "rawReading": 70,
            "scoreConversionVersion": "legacy-reference-v1",
            "partScores": {"part1": 5, "part2": 20, "part3": 35, "part4": 27, "part5": 25, "part6": 12, "part7": 33},
        },
    ],
)
def test_score_provenance_survives_sync_without_recalculating(api, scores):
    with api() as (client, calls):
        assert client.post("/api/v1/sync", json={"records": [score_record(**scores)]}).status_code == 200
        rpc = next(call for call in calls if call[1].endswith("/sync_account_records"))
        payload = rpc[2]["p_records"][0]["payload"]
        for key, value in scores.items():
            assert payload[key] == value
        if scores["scoreSource"] == "MANUAL_TOTAL":
            assert "scaledListening" not in payload and "scaledReading" not in payload and "partScores" not in payload


@pytest.mark.parametrize(
    "scores",
    [
        {"scoreSource": "MANUAL_TOTAL", "totalScore": 800, "scaledListening": 400},
        {"scoreSource": "MANUAL_TOTAL", "totalScore": 801},
        {"scoreSource": "MANUAL_TOTAL", "totalScore": 995},
        {"scoreSource": "MANUAL_SECTIONS", "scaledListening": 445, "scaledReading": 350, "totalScore": 855},
        {"scoreSource": "MANUAL_SECTIONS", "scaledListening": 444, "scaledReading": 350, "totalScore": 794},
        {"scoreSource": "MANUAL_SECTIONS", "scaledListening": 0, "scaledReading": 350, "totalScore": 350},
        {"scoreSource": "ESTIMATED", "scaledListening": 445, "scaledReading": 350, "totalScore": 795},
    ],
)
def test_invalid_new_scores_cannot_reach_database(api, scores):
    with api() as (client, calls):
        assert client.post("/api/v1/sync", json={"records": [score_record(**scores)]}).status_code == 422
        assert not any(call[1].endswith("/sync_account_records") for call in calls)


def test_legacy_server_key_configuration_is_still_supported():
    settings = Settings(
        _env_file=None,
        supabase_url="https://database.example",
        supabase_publishable_key="public",
        supabase_service_role_key="legacy-jwt",
    )
    assert settings.database_ready
    assert settings.admin_key == "legacy-jwt"


@pytest.mark.parametrize(
    "path,method", [("/api/v1/sync", "POST"), ("/api/v1/account", "DELETE"), ("/api/v1/data/reset", "POST")]
)
def test_anonymous_identity_cannot_access_account_storage(api, path, method):
    with api(guest=True) as (client, calls):
        assert (
            client.request(
                method, path, json=({"confirm": True} if path.endswith("/reset") else {}) if method == "POST" else None
            ).status_code
            == 403
        )
        assert not any("/rest/v1/" in call[1] or "/admin/" in call[1] for call in calls)


def test_invalid_token_cannot_reach_database(api):
    with api(auth_status=401) as (client, calls):
        assert client.post("/api/v1/sync", json={}).status_code == 401
        assert len(calls) == 1


def test_reset_requires_explicit_confirmation_and_derives_owner_from_token(api):
    with api() as (client, calls):
        assert client.post("/api/v1/data/reset", json={"confirm": False}).status_code == 422
        assert not any("reset_learning_data" in call[1] for call in calls)
        response = client.post("/api/v1/data/reset", json={"confirm": True})
        assert response.status_code == 200
        rpc = next(call for call in calls if "reset_learning_data" in call[1])
        assert rpc[2] == {"p_owner_id": USER_ID}
        assert client.post("/api/v1/data/reset", json={"confirm": True, "p_owner_id": "other"}).status_code == 422


def test_deleted_record_payload_is_compacted_before_database_call(api):
    with api() as (client, calls):
        value = {
            "entity_type": "mistakes",
            "record_id": "m1",
            "payload": {"id": "m1", "questionContext": "Private old text"},
            "updated_at": "2026-10-06T00:00:00Z",
            "deleted_at": "2026-10-06T00:00:00Z",
        }
        assert client.post("/api/v1/sync", json={"records": [value]}).status_code == 200
        rpc = next(call for call in calls if "sync_account_records" in call[1])
        assert rpc[2]["p_records"][0]["payload"] == {"id": "m1"}


@pytest.mark.parametrize(
    "payload",
    [
        {"id": "v1", "date": "2026-02-30", "count": 3},
        {"id": "v1", "date": "2026-09-23", "count": -1},
        {"id": "wrong-id", "date": "2026-09-23", "count": 3},
        {"id": "v1", "date": "2026-09-23", "count": "3"},
    ],
)
def test_invalid_records_are_rejected_before_rpc(api, payload):
    with api() as (client, calls):
        record = {
            "entity_type": "vocabLog",
            "record_id": "v1",
            "payload": payload,
            "updated_at": "2026-09-23T00:00:00Z",
            "deleted_at": None,
        }
        response = client.post("/api/v1/sync", json={"records": [record]})
        assert response.status_code == 422
        assert not any("/rest/v1/" in call[1] for call in calls)


def test_guest_requires_captcha_before_reserving_quota(api):
    with api(guest=True) as (client, calls):
        assert client.post("/api/v1/ai/extract", json=extraction()).status_code == 403
        assert not any("reserve_ai" in call[1] for call in calls)


def test_captcha_from_another_hostname_is_rejected(api):
    with api(guest=True, captcha_host="attacker.example") as (client, calls):
        assert client.post("/api/v1/ai/extract", json=extraction(captcha_token="token")).status_code == 403
        assert not any("reserve_ai" in call[1] for call in calls)


def test_guest_reserves_quota_before_exactly_one_provider_request(api):
    with api(guest=True) as (client, calls):
        response = client.post("/api/v1/ai/extract", json=extraction(captcha_token="token"))
        assert response.status_code == 200
        assert response.json()["usage"]["remaining"] == 2
        assert response.json()["draft"]["correctAnswer"] == "(B) be"
        rpc_index = next(i for i, call in enumerate(calls) if "reserve_ai" in call[1])
        ai_indices = [i for i, call in enumerate(calls) if call[0] == "generativelanguage.googleapis.com"]
        assert len(ai_indices) == 1 and rpc_index < ai_indices[0]
        assert calls[ai_indices[0]][3]["x-goog-api-key"] == "gemini-secret"
        assert calls[rpc_index][2]["p_guest"] is True
        assert len(calls[rpc_index][2]["p_ip_hash"]) == 64
        assert "testclient" not in json.dumps(calls[rpc_index][2])


@pytest.mark.parametrize("code,status", [("quota", 429), ("duplicate", 409)])
def test_rejected_reservation_never_calls_gemini(api, code, status):
    with api(reservation={"allowed": False, "code": code}) as (client, calls):
        assert client.post("/api/v1/ai/extract", json=extraction()).status_code == status
        assert not any(call[0] == "generativelanguage.googleapis.com" for call in calls)


def test_unknown_provider_quota_does_not_rotate_into_the_same_project(api):
    with api(gemini_status=429) as (client, calls):
        assert client.post("/api/v1/ai/extract", json=extraction()).status_code == 429
        assert sum(call[0] == "generativelanguage.googleapis.com" for call in calls) == 1
        finish = next(call for call in calls if call[1].endswith("finish_gemini_attempt"))
        assert finish[2]["p_scope"] == "project" and finish[2]["p_seconds"] == 60


def test_truncated_provider_output_is_not_saved_as_a_draft(api):
    with api(finish="MAX_TOKENS") as (client, _calls):
        assert client.post("/api/v1/ai/extract", json=extraction()).status_code == 502


def test_missing_consent_and_oversized_input_do_not_call_provider(api):
    with api() as (client, calls):
        assert client.post("/api/v1/ai/extract", json=extraction(consent=False)).status_code == 422
        assert client.post("/api/v1/ai/extract", json=extraction(text="a" * 8001)).status_code == 422
        assert not any("reserve_ai" in call[1] for call in calls)


def test_cors_allows_only_configured_frontend(api):
    with api() as (client, _calls):
        assert (
            client.options(
                "/api/v1/sync", headers={"Origin": "https://attacker.example", "Access-Control-Request-Method": "POST"}
            ).status_code
            == 400
        )
        response = client.options(
            "/api/v1/sync", headers={"Origin": "http://localhost:3000", "Access-Control-Request-Method": "POST"}
        )
        assert response.headers["access-control-allow-origin"] == "http://localhost:3000"


def test_body_limit_applies_before_authentication(api):
    with api() as (client, calls):
        assert client.post("/api/v1/sync", content=b"a" * (4 * 1024 * 1024 + 1)).status_code == 413
        assert calls == []


def test_shared_api_limit_uses_verified_owner_and_endpoint_scope(api):
    with api(settings_overrides={"api_limits_enabled": True}) as (client, calls):
        assert client.post("/api/v1/sync", json={}).status_code == 200
        rate = next(call for call in calls if call[1].endswith("/reserve_api_request"))
        assert rate[2] == {"p_owner_id": USER_ID, "p_scope": "sync", "p_account_limit": 60, "p_scope_limit": 30}
        assert calls.index(rate) < next(i for i, call in enumerate(calls) if call[1].endswith("/sync_account_records"))


def test_shared_api_limit_denies_before_sync_and_returns_retry_after(api):
    with api(
        api_reservation={"allowed": False, "retry_after": 12}, settings_overrides={"api_limits_enabled": True}
    ) as (client, calls):
        response = client.post("/api/v1/sync", json={})
        assert response.status_code == 429
        assert response.headers["retry-after"] == "12"
        assert "x-request-id" in response.headers
        assert not any(call[1].endswith("/sync_account_records") for call in calls)


def test_ingress_rejects_spam_before_authentication_and_preserves_health(api):
    with api(auth_status=401, settings_overrides={"ingress_ip_minute_limit": 2}) as (client, calls):
        assert client.post("/api/v1/sync", json={}).status_code == 401
        assert client.post("/api/v1/sync", json={}).status_code == 401
        response = client.post("/api/v1/sync", json={}, headers={"Origin": "http://localhost:3000"})
        assert response.status_code == 429
        assert 1 <= int(response.headers["retry-after"]) <= 60
        assert len(calls) == 2
        assert response.headers["access-control-allow-origin"] == "http://localhost:3000"
        assert "Retry-After" in response.headers["access-control-expose-headers"]
        assert client.get("/health").status_code == 200


def test_readiness_probes_database_with_zero_rows_and_caches_result(api):
    with api(settings_overrides={"api_limits_enabled": True}) as (client, calls):
        assert client.get("/ready").status_code == 200
        assert client.get("/ready").json()["database_reachable"] is True
        assert len(calls) == 2
        assert [call[1] for call in calls] == ["/rest/v1/api_rate_limits", "/rest/v1/ai_provider_state"]


def test_readiness_fails_when_required_migration_is_missing(api):
    with api(readiness_status=404, settings_overrides={"api_limits_enabled": True}) as (client, _calls):
        assert client.get("/ready").status_code == 503
        assert client.get("/health").status_code == 200


def test_tracker_only_mode_never_calls_ai(api):
    with api(settings_overrides={"ai_enabled": False}) as (client, calls):
        assert client.post("/api/v1/ai/extract", json=extraction()).status_code == 503
        assert not any("reserve_ai" in call[1] or call[0] == "generativelanguage.googleapis.com" for call in calls)


def test_request_logs_and_headers_exclude_secrets_and_raw_inputs(api, caplog):
    with api() as (client, _calls):
        response = client.post(
            "/api/v1/sync?private=very-private-value",
            json={"bad": "raw-question-secret"},
            headers={"X-Request-ID": "attacker-id", "Authorization": "Bearer raw-token-secret"},
        )
        assert response.headers["cache-control"] == "no-store"
        assert response.headers["x-request-id"] != "attacker-id"
        events = [json.loads(record.message) for record in caplog.records if record.name == "toeic.runtime"]
        assert any(event.get("request_id") == response.headers["x-request-id"] for event in events)
        for secret in ("very-private-value", "raw-question-secret", "raw-token-secret", "server-secret"):
            assert secret not in json.dumps(events)


def test_untrusted_host_is_rejected_before_supabase(api):
    with api() as (client, calls):
        assert client.post("/api/v1/sync", json={}, headers={"Host": "attacker.example"}).status_code == 400
        assert calls == []
