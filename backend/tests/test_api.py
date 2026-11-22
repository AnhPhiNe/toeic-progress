import base64
import json
from contextlib import contextmanager
from io import BytesIO

import httpx
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from PIL import Image

from app.core.config import Settings
from app.integrations.gateway import Gateway
from app.integrations.source_images import SourceImages
from app.main import create_app
from tests.batch_reservation_mock import BatchReservationMock
from tests.explanation_ledger_mock import ExplanationLedgerMock

USER_ID = "11111111-1111-4111-8111-111111111111"
DRAFT = {
    "part": 5,
    "category": "ADVANCED_GRAMMAR",
    "questionContext": "Reports should ____ submitted.",
    "userMistake": "",
    "correctAnswer": "(B) be",
    "trapTip": "Kiểm tra cấu trúc giả định.",
    "options": ["(A) are", "(B) be"],
    "tags": ["grammar"],
    "missingInformation": [],
    "answerSource": "PROVIDED",
    "userChoice": "",
}
# OpenAI strict output: structured explanation and option notes instead of trapTip.
OPENAI_DRAFT = {
    **{key: value for key, value in DRAFT.items() if key != "trapTip"},
    "optionNotes": [{"label": "A", "pos": "v", "meaning": "to be, hiện tại số nhiều"},
                    {"label": "B", "pos": "v", "meaning": "nguyên thể"}],
    "explanation": {"quickTip": "Kiểm tra cấu trúc giả định.", "translation": "", "questionType": "", "evidence": "",
                    "paraphrase": "", "analysis": "", "keyVocabulary": ""},
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
        provider_status=200,
        draft=None,
        finish="completed",
        backend_key="server-secret",
        api_reservation=None,
        readiness_status=200,
        settings_overrides=None,
        auth_user=None,
        provider_error=None,
        auth_statuses=None,
        quota_counters=None,
        counters_status=200,
        ai_grant=None,
        ai_grant_status=200,
        ai_grants=None,
        ledger_status=200,
        ledger_mock=None,
        ledger_malformed=False,
        batch_mock=None,
        provider_budget=None,
        drafts=None,
        admin_statuses=None,
    ):
        calls = []
        batches = batch_mock or BatchReservationMock()
        ledger = ledger_mock or ExplanationLedgerMock()
        draft_queue = list(drafts) if drafts is not None else None
        # private.pending_account_deletions: user_id -> attempts (Auth DELETE cascades the row).
        pending = {}

        def respond(request):
            body = (
                json.loads(request.content)
                if request.content and request.headers.get("content-type") == "application/json"
                else None
            )
            calls.append((request.url.host, request.url.path, body, dict(request.headers)))
            if request.url.path == "/auth/v1/user":
                status = auth_statuses.pop(0) if auth_statuses else auth_status
                return httpx.Response(status, json={"id": USER_ID, "is_anonymous": guest, **(auth_user or {})})
            if request.url.path.endswith("/sync_account_records"):
                return httpx.Response(200, json={"cursor": 7, "records": [], "hasRecords": False})
            if request.url.path.endswith("/reserve_api_request"):
                return httpx.Response(200, json=api_reservation or {"allowed": True})
            if request.url.path.endswith("/rpc/schema_ready"):
                if readiness_status != 200 or ledger_status != 200:
                    return httpx.Response(readiness_status if readiness_status != 200 else ledger_status, json={"message": "missing"})
                if ledger_malformed:
                    return httpx.Response(200, text="not-json")
                return httpx.Response(200, json={"baseline": 2, "ready": True})
            if request.url.path.rsplit("/", 1)[-1] in {"claim_explanation_question", "finish_explanation_question"}:
                if ledger_status != 200:
                    return httpx.Response(ledger_status, json={"message": "Ledger unavailable"})
                if ledger_malformed:
                    return httpx.Response(200, text="not-json")
                return httpx.Response(200, json=ledger.respond(request.url.path.rsplit("/", 1)[-1], body))
            if request.url.path.endswith("/rpc/apply_identity_carryover"):
                return httpx.Response(200, json={"applied": True, "blocked": False})
            if request.url.path.endswith("/rpc/prepare_account_deletion"):
                return httpx.Response(200, json={"prepared": True, "carried": True})
            if request.url.path.endswith("/rpc/mark_account_deletion_pending"):
                pending.setdefault(body["p_user_id"], 0)
                return httpx.Response(200, json={"pending": True})
            if request.url.path.endswith("/rpc/list_pending_account_deletions"):
                return httpx.Response(200, json=[{"userId": user, "requestedAt": "2026-11-21T00:00:00Z", "attempts": tries}
                                                 for user, tries in pending.items()])
            if request.url.path.endswith("/rpc/note_account_deletion_attempt"):
                found = body["p_user_id"] in pending
                if found:
                    pending[body["p_user_id"]] += 1
                return httpx.Response(200, json={"found": found, "attempts": pending.get(body["p_user_id"])})
            if request.url.path.endswith("/rpc/clear_account_deletion_pending"):
                return httpx.Response(200, json={"cleared": pending.pop(body["p_user_id"], None) is not None})
            if request.url.path.endswith("/rpc/reserve_batch_explain_quota"):
                return httpx.Response(200, json=batches.reserve_explain(body))
            if request.url.path.endswith("/rpc/get_ai_access"):
                # Fixtures describe a v1-style grant row: monthly_limit None = unlimited (admin plan).
                rows = ai_grants.pop(0) if ai_grants else [] if ai_grant is None else [ai_grant]
                row = rows[0] if rows else None
                plan = None if row is None else row.get("plan") or ("admin" if row["monthly_limit"] is None else "free")
                body = {"status": "active", "plan": "free", "monthlyLimit": None, "unlimited": False} if row is None else {
                    "status": row["status"], "plan": plan, "monthlyLimit": row["monthly_limit"], "unlimited": plan == "admin"}
                return httpx.Response(ai_grant_status, json=body)
            if request.url.path.endswith("/reserve_ai_batch_request"):
                return httpx.Response(200, json=reservation or batches.respond(body))
            if request.url.path.endswith("/reserve_ai_request"):
                return httpx.Response(200, json=reservation or {"allowed": True, "remaining": 2, "limit": 3})
            if request.url.path.endswith("/reserve_provider_budget"):
                budget = provider_budget(body) if callable(provider_budget) else provider_budget
                return httpx.Response(200, json=budget or {"allowed": True})
            if request.url.path.endswith("/record_ai_usage"):
                return httpx.Response(200, json=None)
            if request.url.path.endswith("/get_ai_usage"):
                return httpx.Response(200, json={"remaining": 3, "limit": 3, "guest": guest})
            if request.url.path.endswith("/rpc/ai_quota_status"):
                return httpx.Response(counters_status, json=quota_rows(body["p_guest"], quota_counters))
            if request.url.path.endswith("/reset_learning_data"):
                return httpx.Response(200, json={"cursor": 10, "records": [], "hasRecords": True, "resetBarrier": True})
            if request.url.host == "challenges.cloudflare.com":
                return httpx.Response(200, json={"success": True, "hostname": captcha_host, "action": "toeic-ai"})
            if request.url.host == "api.openai.com":
                if provider_error:
                    raise provider_error("must not log API key or input", request=request)
                next_draft = draft_queue.pop(0) if draft_queue else (draft if draft is not None else OPENAI_DRAFT)
                return httpx.Response(provider_status, json={
                    "status": finish,
                    "usage": {"input_tokens": 250, "output_tokens": 120, "input_tokens_details": {"cached_tokens": 50}},
                    "output": [{
                        "type": "message", "role": "assistant", "status": "completed",
                        "content": [{"type": "output_text", "text": json.dumps(next_draft)}],
                    }],
                })
            if request.url.path == "/storage/v1/bucket/mistake-sources":
                return httpx.Response(404, json={"statusCode": "404", "error": "Bucket not found"})
            if request.url.path.startswith("/auth/v1/admin/users/"):
                queue = (admin_statuses or {}).get(request.method)
                status = queue.pop(0) if queue else 200
                if request.method == "DELETE" and status == 200:
                    pending.pop(request.url.path.rsplit("/", 1)[-1], None)
                return httpx.Response(status, json={})
            raise AssertionError(f"Unexpected request: {request.url}")

        settings = Settings(_env_file=None, **{
            "supabase_url": "https://database.example", "supabase_publishable_key": "public-key",
            "supabase_secret_key": backend_key, "openai_api_key": "openai-secret",
            "rate_limit_secret": "rate-secret", "turnstile_secret_key": "captcha-secret",
            **(settings_overrides or {}),
        })
        with TestClient(create_app(settings, httpx.MockTransport(respond))) as client:
            client.headers["Authorization"] = "Bearer user-token"
            client.pending_deletions = pending
            yield client, calls

    return make


def quota_rows(guest, counters):
    """What public.ai_quota_status returns, with counts taken from {bucket prefix: used}."""
    from datetime import datetime, timedelta, timezone
    now = datetime.now(timezone.utc)
    day_end = now.replace(hour=0, minute=0, second=0, microsecond=0) + timedelta(days=1)
    month_end = (day_end.replace(day=1) + timedelta(days=32)).replace(day=1)
    rows = [("guest" if guest else "month", "user:", None if guest else month_end), ("day", "day:", day_end),
            ("minute", "minute:", now.replace(second=0, microsecond=0) + timedelta(minutes=1)), ("ip", "ip:", day_end)]
    return [{"kind": kind, "bucket": prefix, "used": (counters or {}).get(prefix, 0),
             "resetsAt": reset.isoformat() if reset else None} for kind, prefix, reset in rows]


def extraction(**extra):
    return {"text": TEXT, "consent": True, "provider": "openai", "request_id": "22222222-2222-4222-8222-222222222222", **extra}


def test_unconfigured_backend_starts_and_reports_readiness():
    with TestClient(create_app(Settings(_env_file=None))) as client:
        assert client.get("/health").json()["database_configured"] is False
        assert client.post("/api/v1/sync", json={}).status_code == 401


def test_sync_owner_is_derived_from_verified_token(api):
    with api() as (client, calls):
        assert client.post("/api/v1/sync", json={"records": [], "cursor": 0}).status_code == 200
        rpc = next(call for call in calls if call[1].endswith("/sync_account_records"))
        assert rpc[2]["p_user_id"] == USER_ID
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


def test_vocabulary_source_and_multiple_parts_survive_sync_validation(api):
    with api() as (client, calls):
        record = {
            "entity_type": "vocabLog", "record_id": "v1",
            "payload": {"id": "v1", "date": "2026-09-23", "count": 20,
                        "sourceName": "ETS 2024 Test 04", "parts": [5, 7]},
            "updated_at": "2026-09-23T00:00:00Z", "deleted_at": None,
        }
        assert client.post("/api/v1/sync", json={"records": [record]}).status_code == 200
        rpc = next(call for call in calls if call[1].endswith("/sync_account_records"))
        assert rpc[2]["p_records"][0]["payload"]["sourceName"] == "ETS 2024 Test 04"
        assert rpc[2]["p_records"][0]["payload"]["parts"] == [5, 7]
        for parts in ([8], [5, 5], [1.5]):
            record["payload"]["parts"] = parts
            assert client.post("/api/v1/sync", json={"records": [record]}).status_code == 422


def test_modern_secret_key_is_not_sent_as_a_bearer_jwt(api):
    with api(backend_key="sb_secret_test") as (client, calls):
        assert client.post("/api/v1/sync", json={}).status_code == 200
        assert client.delete("/api/v1/account").status_code == 200
        privileged = [call for call in calls if "/rest/v1/" in call[1] or "/auth/v1/admin/" in call[1]]
        # 1 sync RPC + 1 pending-deletion RPC + 1 PUT ban user + 1 DELETE user.
        assert len(privileged) == 4
        for call in privileged:
            assert call[3]["apikey"] == "sb_secret_test"
            assert "authorization" not in call[3]


def admin_steps(calls):
    """(method, short name) of every account-deletion step, in order."""
    steps = []
    for _, path, body, _ in calls:
        if path.endswith("/rpc/prepare_account_deletion"):
            steps.append("prepare")
        elif path.endswith("/rpc/mark_account_deletion_pending"):
            steps.append("pending")
        elif path.endswith("/rpc/clear_account_deletion_pending"):
            steps.append("clear")
        elif path == "/storage/v1/bucket/mistake-sources":
            steps.append("purge")
        elif path == f"/auth/v1/admin/users/{USER_ID}":
            steps.append({"876000h": "ban", "none": "unban"}.get((body or {}).get("ban_duration"), "delete"))
    return steps


def test_delete_account_saves_carryover_before_ban_and_canonicalizes_gmail(api):
    with api(auth_user={"email": "A.B+spam@gmail.com"}) as (client, calls):
        assert client.delete("/api/v1/account").status_code == 200
        assert admin_steps(calls) == ["prepare", "pending", "ban", "purge", "delete"]
        carry_body = next(call[2] for call in calls if call[1].endswith("/prepare_account_deletion"))
        assert carry_body["p_user_id"] == USER_ID and len(carry_body["p_identity_hash"]) == 64
        assert "gmail" not in json.dumps(carry_body).lower()
        first_hash = carry_body["p_identity_hash"]
    with api(auth_user={"email": "ab@googlemail.com"}) as (client, calls):
        assert client.delete("/api/v1/account").status_code == 200
        carry_body = next(call[2] for call in calls if call[1].endswith("/prepare_account_deletion"))
        assert carry_body["p_identity_hash"] == first_hash


def test_failed_auth_delete_unbans_and_retry_finishes_without_double_carryover(api):
    with api(auth_user={"email": "alice@example.test"}, admin_statuses={"DELETE": [500]}) as (client, calls):
        failed = client.delete("/api/v1/account")
        assert failed.status_code == 503
        assert admin_steps(calls) == ["prepare", "pending", "ban", "purge", "delete", "unban", "clear"]
        calls.clear()
        assert client.delete("/api/v1/account").status_code == 200
        assert admin_steps(calls) == ["prepare", "pending", "ban", "purge", "delete"]
        # The retry sends the same idempotent carryover call (the SQL keeps one contribution per account).
        bodies = [call[2] for call in calls if call[1].endswith("/prepare_account_deletion")]
        assert len(bodies) == 1 and bodies[0]["p_user_id"] == USER_ID


def test_failed_ban_stops_before_purge_and_failed_purge_unbans(api, monkeypatch):
    with api(auth_user={"email": "alice@example.test"}, admin_statuses={"PUT": [500]}) as (client, calls):
        assert client.delete("/api/v1/account").status_code == 503
        assert admin_steps(calls) == ["prepare", "pending", "ban", "clear"]

    async def broken_purge(self, user_id, *, allow_missing=False):
        raise HTTPException(503, "purge failed")

    monkeypatch.setattr(SourceImages, "purge", broken_purge)
    with api(auth_user={"email": "alice@example.test"}) as (client, calls):
        assert client.delete("/api/v1/account").status_code == 503
        assert admin_steps(calls) == ["prepare", "pending", "ban", "unban", "clear"]


def test_failed_carryover_never_bans_or_purges(api, monkeypatch):
    original = Gateway.rpc

    async def failing_rpc(self, name, parameters, *, timeout=12):
        if name == "prepare_account_deletion":
            raise HTTPException(503, "down")
        return await original(self, name, parameters, timeout=timeout)

    monkeypatch.setattr(Gateway, "rpc", failing_rpc)
    with api(auth_user={"email": "alice@example.test"}) as (client, calls):
        assert client.delete("/api/v1/account").status_code == 503
        assert admin_steps(calls) == []


def test_successful_delete_leaves_no_pending_row(api):
    with api(auth_user={"email": "alice@example.test"}) as (client, calls):
        assert client.delete("/api/v1/account").status_code == 200
        assert client.pending_deletions == {}


def test_failed_pending_record_never_bans(api, monkeypatch):
    original = Gateway.rpc

    async def failing_rpc(self, name, parameters, *, timeout=12):
        if name == "mark_account_deletion_pending":
            raise HTTPException(503, "down")
        return await original(self, name, parameters, timeout=timeout)

    monkeypatch.setattr(Gateway, "rpc", failing_rpc)
    with api(auth_user={"email": "alice@example.test"}) as (client, calls):
        assert client.delete("/api/v1/account").status_code == 503
        assert admin_steps(calls) == ["prepare"]


def test_failed_unban_keeps_pending_row_and_maintenance_finishes_it(api):
    import asyncio

    from app.commands import maintenance

    # DELETE fails, then lifting the ban fails too: banned but not deleted.
    with api(auth_user={"email": "alice@example.test"}, admin_statuses={"DELETE": [500, 500], "PUT": [200, 500]}) as (client, calls):
        failed = client.delete("/api/v1/account")
        assert failed.status_code == 503 and "một ngày" in failed.json()["detail"]
        assert admin_steps(calls) == ["prepare", "pending", "ban", "purge", "delete", "unban"]
        assert client.pending_deletions == {USER_ID: 0}

        gateway = client.app.state.gateway
        calls.clear()
        # First maintenance run: Auth DELETE fails again, the attempt is counted and the row stays.
        assert asyncio.run(maintenance.finish_pending_deletions(gateway)) == {"finished": 0, "failed": 1}
        note = next(call[2] for call in calls if call[1].endswith("/note_account_deletion_attempt"))
        assert note == {"p_user_id": USER_ID, "p_error": "delete:500"}
        assert client.pending_deletions == {USER_ID: 1}
        listing = next(call[2] for call in calls if call[1].endswith("/list_pending_account_deletions"))
        assert listing == {"p_older_than_seconds": 600, "p_limit": 50}

        calls.clear()
        # Next run: the same purge + delete path finishes it; the cascade removes the row.
        assert asyncio.run(maintenance.finish_pending_deletions(gateway)) == {"finished": 1, "failed": 0}
        assert admin_steps(calls) == ["purge", "delete"]
        assert client.pending_deletions == {}
        assert asyncio.run(maintenance.finish_pending_deletions(gateway)) == {"finished": 0, "failed": 0}


def test_ban_timeout_is_lifted_before_the_pending_row_is_dropped(api, monkeypatch):
    original = Gateway._set_ban

    async def flaky_ban(self, user_id, duration):
        if duration != "none":
            raise httpx.ReadTimeout("ban may have landed")
        return await original(self, user_id, duration)

    monkeypatch.setattr(Gateway, "_set_ban", flaky_ban)
    with api(auth_user={"email": "alice@example.test"}) as (client, calls):
        assert client.delete("/api/v1/account").status_code == 503
        assert admin_steps(calls) == ["prepare", "pending", "unban", "clear"]
        assert client.pending_deletions == {}
    with api(auth_user={"email": "alice@example.test"}, admin_statuses={"PUT": [500]}) as (client, calls):
        assert client.delete("/api/v1/account").status_code == 503
        assert admin_steps(calls) == ["prepare", "pending", "unban"]
        assert client.pending_deletions == {USER_ID: 0}, "Unknown ban outcome and failed unban: maintenance finishes it"


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


def test_confirmed_image_timing_survives_sync_in_session_extra(api):
    timing = {"source": "IMAGE_CONFIRMED", "totalSeconds": 6721, "listeningSeconds": None,
              "readingSeconds": None, "parts": {f"part{part}": (870 if part == 5 else None) for part in range(1, 8)}}
    with api() as (client, calls):
        reply = client.post("/api/v1/sync", json={"records": [score_record(resultTiming=timing)]})
        assert reply.status_code == 200
        sent = next(call[2] for call in calls if call[1].endswith("sync_account_records"))
        assert sent["p_records"][0]["payload"]["resultTiming"] == timing
        assert sent["p_records"][0]["payload"]["durationMinutes"] == 120


@pytest.mark.parametrize("timing", [{"source": "AI"}, {"source": "IMAGE_CONFIRMED"},
                                  {"source": "IMAGE_CONFIRMED", "totalSeconds": -1},
                                  {"source": "IMAGE_CONFIRMED", "totalSeconds": True},
                                  {"source": "IMAGE_CONFIRMED", "parts": {"part8": 10}}])
def test_invalid_confirmed_timing_never_reaches_supabase(api, timing):
    with api() as (client, calls):
        assert client.post("/api/v1/sync", json={"records": [score_record(resultTiming=timing)]}).status_code == 422
        assert not any(call[1].endswith("sync_account_records") for call in calls)


@pytest.mark.parametrize("parts", [
    [{"part": 5, "correct": 1.5, "total": 30}],
    [{"part": 5, "correct": 0, "total": 0}],
    [{"part": 5, "correct": 31, "total": 30}],
    [{"part": 6, "correct": 1, "total": 17}],
    [{"part": 5, "correct": 1, "total": 30}, {"part": 5, "correct": 2, "total": 30}],
])
def test_invalid_practice_counts_never_reach_database(api, parts):
    record = score_record(practiceParts=parts)
    record["payload"]["sessionType"] = "PART_PRACTICE"
    with api() as (client, calls):
        assert client.post("/api/v1/sync", json={"records": [record]}).status_code == 422
        assert not any(call[1].endswith("/sync_account_records") for call in calls)


def pacing_record(**fields):
    return {"entity_type": "pacingRuns", "record_id": "pacing-test",
            "updated_at": "2026-10-05T00:00:00Z", "deleted_at": None,
            "payload": {"id": "pacing-test", "presetId": "PART_5", "presetName": "Part 5",
                        "date": "2026-10-05", "plannedMinutes": 12, "actualMinutes": 1,
                        "finishedNaturally": False, "phases": [], "createdAt": "2026-10-05T00:00:00Z", **fields}}


@pytest.mark.parametrize("fields", [
    {"totalQuestions": 30, "correctAnswers": 31}, {"correctAnswers": 1},
    {"totalQuestions": 0}, {"totalQuestions": 101}, {"totalQuestions": 1.5},
    {"totalQuestions": 30, "correctAnswers": 1.5}, {"actualSeconds": -2},
    {"actualSeconds": "60"}, {"actualSeconds": None}, {"partType": "INVALID"},
    {"accuracyPercent": 101}, {"speedSecPerQuestion": -1},
])
def test_invalid_pacing_fields_never_reach_database(api, fields):
    with api() as (client, calls):
        assert client.post("/api/v1/sync", json={"records": [pacing_record(**fields)]}).status_code == 422
        assert not any(call[1].endswith("/sync_account_records") for call in calls)


@pytest.mark.parametrize("fields", [
    {}, {"partType": "POMODORO", "actualSeconds": 60},
    {"partType": "PART_5", "totalQuestions": 60, "correctAnswers": 0, "accuracyPercent": 0, "actualSeconds": 60},
    {"partType": "CUSTOM", "totalQuestions": 100, "correctAnswers": 100},
])
def test_legacy_and_custom_pacing_fields_survive_sync(api, fields):
    with api() as (client, calls):
        assert client.post("/api/v1/sync", json={"records": [pacing_record(**fields)]}).status_code == 200
        rpc = next(call for call in calls if call[1].endswith("/sync_account_records"))
        payload = rpc[2]["p_records"][0]["payload"]
        for key, value in fields.items():
            assert payload[key] == value
        if not fields:
            assert "partType" not in payload and "totalQuestions" not in payload


@pytest.mark.parametrize(
    "scores",
    [
        {"scoreSource": "MANUAL_TOTAL", "totalScore": 800},
        {"scoreSource": "MANUAL_SECTIONS", "scaledListening": 445, "scaledReading": 350, "totalScore": 795},
        {
            "scoreSource": "ESTIMATED",
            "scaledListening": 495,
            "scaledReading": 495,
            "totalScore": 990,
            "rawListening": 100,
            "rawReading": 100,
            "scoreConversionVersion": "iibc-mock-2023-perfect-v2",
            "partScores": {"part1": 6, "part2": 25, "part3": 39, "part4": 30, "part5": 30, "part6": 16, "part7": 54},
        },
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
        assert rpc[2] == {"p_user_id": USER_ID}
        assert client.post("/api/v1/data/reset", json={"confirm": True, "p_user_id": "other"}).status_code == 422


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


def test_authenticated_ai_works_without_local_captcha_config_but_guest_never_bypasses_it(api):
    with api(settings_overrides={"turnstile_secret_key": ""}) as (client, calls):
        assert client.get('/health').json()['ai_configured'] is True
        response = client.post('/api/v1/ai/extract', json=extraction())
        assert response.status_code == 200
        assert sum(call[0] == 'api.openai.com' for call in calls) == 1
        assert any(call[1].endswith('reserve_ai_request') for call in calls)
        assert not any(call[0] == 'challenges.cloudflare.com' for call in calls)
    with api(guest=True, settings_overrides={"turnstile_secret_key": ""}) as (client, calls):
        assert client.post('/api/v1/ai/extract', json=extraction(captcha_token='fake-token')).status_code == 403
        assert not any(call[1].endswith('reserve_ai_request') or call[0] == 'api.openai.com' for call in calls)


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
        ai_indices = [i for i, call in enumerate(calls) if call[0] == "api.openai.com"]
        assert len(ai_indices) == 1 and rpc_index < ai_indices[0]
        assert calls[ai_indices[0]][3]["authorization"] == "Bearer openai-secret"
        assert calls[rpc_index][2]["p_guest"] is True
        assert len(calls[rpc_index][2]["p_ip_hash"]) == 64
        assert "testclient" not in json.dumps(calls[rpc_index][2])


@pytest.mark.parametrize("code,status", [("quota", 429), ("duplicate", 409)])
def test_rejected_reservation_never_calls_openai(api, code, status):
    with api(reservation={"allowed": False, "code": code}) as (client, calls):
        assert client.post("/api/v1/ai/extract", json=extraction()).status_code == status
        assert not any(call[0] == "api.openai.com" for call in calls)


@pytest.mark.parametrize("guest,counters,text,delay", [
    (False, {"user:": 10}, "10 lượt phân tích AI trong tháng", False),
    (True, {"user:": 3}, "Phiên khách đã dùng hết 3", False),
    (False, {"day:": 20}, "Hệ thống đã dùng hết 20", False),
    (False, {"minute:": 20}, "20 lượt phân tích AI/phút", True),
    (False, {"ip:": 5}, "Kết nối mạng này đã dùng hết 5", False),
])
def test_quota_errors_name_the_actual_app_limit_without_calling_openai(api, guest, counters, text, delay):
    with api(guest=guest, reservation={"allowed": False, "code": "quota"}, quota_counters=counters) as (client, calls):
        response = client.post("/api/v1/ai/extract", json=extraction(captcha_token="token"))
        assert response.status_code == 429 and text in response.json()["detail"]
        assert "AI đang bận" not in response.json()["detail"]
        assert ("Retry-After" in response.headers) is delay
        if not guest and not delay:
            assert "giờ Việt Nam" in response.json()["detail"]
        assert not any(call[0] == "api.openai.com" for call in calls)
        assert sum(call[1].endswith("reserve_ai_request") for call in calls) == 1


def test_counter_lookup_failure_keeps_the_quota_denial_and_does_not_claim_provider_failure(api):
    with api(reservation={"allowed": False, "code": "quota"}, counters_status=503) as (client, calls):
        response = client.post("/api/v1/ai/extract", json=extraction())
        assert response.status_code == 429 and "chưa đọc được hạn mức cụ thể" in response.json()["detail"]
        assert "OpenAI" not in response.json()["detail"]
        assert not any(call[0] == "api.openai.com" for call in calls)


def test_provider_quota_error_does_not_retry_or_reserve_another_app_request(api):
    with api(provider_status=429) as (client, calls):
        assert client.post("/api/v1/ai/extract", json=extraction()).status_code == 429
        assert sum(call[0] == "api.openai.com" for call in calls) == 1
        assert sum(call[1].endswith("reserve_ai_request") for call in calls) == 1


def test_truncated_provider_output_is_not_saved_as_a_draft(api):
    with api(finish="incomplete") as (client, _calls):
        assert client.post("/api/v1/ai/extract", json=extraction()).status_code == 502


def test_missing_consent_and_oversized_input_do_not_call_provider(api):
    with api() as (client, calls):
        assert client.post("/api/v1/ai/extract", json=extraction(consent=False)).status_code == 422
        assert client.post("/api/v1/ai/extract", json=extraction(text="a" * 8001)).status_code == 422
        without_recipient = extraction()
        without_recipient.pop("provider")
        assert client.post("/api/v1/ai/extract", json=without_recipient).status_code == 422
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
        assert rate[2] == {"p_user_id": USER_ID, "p_scope": "sync", "p_account_limit": 60, "p_scope_limit": 30}
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
        assert len(calls) == 1
        assert [call[1] for call in calls] == ["/rest/v1/rpc/schema_ready"]


def test_readiness_fails_when_required_migration_is_missing(api):
    with api(readiness_status=404, settings_overrides={"api_limits_enabled": True}) as (client, _calls):
        assert client.get("/ready").status_code == 503
        assert client.get("/health").status_code == 200


def test_tracker_only_mode_never_calls_ai(api):
    with api(settings_overrides={"ai_enabled": False}) as (client, calls):
        assert client.post("/api/v1/ai/extract", json=extraction()).status_code == 503
        assert not any("reserve_ai" in call[1] or call[0] == "api.openai.com" for call in calls)


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


def google_identity(email="owner@gmail.com", verified=True):
    return {"provider": "google", "identity_data": {"email": email, "email_verified": verified}}


def trusted_user(**overrides):
    return {
        "email": "owner@gmail.com", "email_confirmed_at": "2026-10-07T00:00:00Z",
        "identities": [google_identity()], **overrides,
    }


def test_google_verified_allowlisted_user_has_unlimited_usage_and_retains_provider_checks(api):
    with api(
        auth_user=trusted_user(),
        settings_overrides={"ai_unlimited_emails": [" Owner@gmail.com "], "api_limits_enabled": True},
    ) as (client, calls):
        expected = {"remaining": None, "limit": None, "guest": False, "unlimited": True}
        assert client.get("/api/v1/ai/usage").json() == expected
        response = client.post("/api/v1/ai/extract", json=extraction())
        assert response.status_code == 200 and response.json()["usage"] == expected
        quota = next(call[2] for call in calls if call[1].endswith("/reserve_ai_request"))
        assert quota["p_user_limit"] is None and quota["p_day_limit"] is None and quota["p_ip_limit"] is None
        assert quota["p_minute_limit"] is None
        assert not any(call[1].endswith("/reserve_api_request") for call in calls)
        assert sum(call[0] == "api.openai.com" for call in calls) == 1
        assert not any(call[1].endswith("/get_ai_usage") for call in calls)


@pytest.mark.parametrize("auth_user", [
    trusted_user(is_anonymous=True),
    trusted_user(email_confirmed_at=None),
    trusted_user(email="another@gmail.com"),
    trusted_user(identities=[google_identity(verified=False)]),
    trusted_user(identities=[google_identity(email="another@gmail.com")]),
    trusted_user(identities=[{"provider": "email", "identity_data": {"email": "owner@gmail.com", "email_verified": True}}]),
    trusted_user(identities=[]),
    {"email": "owner@gmail.com", "user_metadata": {"email_verified": True, "unlimited": True}},
])
def test_email_metadata_or_unverified_identity_cannot_bypass_ai_limits(api, auth_user):
    with api(auth_user=auth_user, settings_overrides={"ai_unlimited_emails": ["owner@gmail.com"]}) as (client, calls):
        extra = {"captcha_token": "token"} if auth_user.get("is_anonymous") else {}
        assert client.post("/api/v1/ai/extract", json=extraction(**extra)).status_code == 200
        quota = next(call[2] for call in calls if call[1].endswith("/reserve_ai_request"))
        assert quota["p_user_limit"] in (3, 10) and quota["p_day_limit"] == 20 and quota["p_ip_limit"] == 5


@pytest.mark.parametrize("error_type", [httpx.ReadTimeout, httpx.ConnectError])
def test_openai_transport_logs_correlate_with_support_id_without_secrets(api, caplog, error_type):
    with api(provider_error=error_type) as (client, calls):
        response = client.post("/api/v1/ai/extract", json=extraction())
        assert response.status_code == 503
        assert ("quá thời gian chờ" if error_type is httpx.ReadTimeout else "Kết nối tới OpenAI bị gián đoạn") in response.json()["detail"]
        events = [json.loads(record.message) for record in caplog.records if record.name == "toeic.runtime"]
        event = next(event for event in events if event.get("event") == "openai_transport_error")
        assert event["request_id"] == response.headers["x-request-id"]
        assert event["error_type"] == error_type.__name__
        assert sum(call[0] == "api.openai.com" for call in calls) == 1
        assert "must not log" not in json.dumps(events) and "openai-secret" not in json.dumps(events)


def test_unlimited_ai_account_bypasses_ai_throttling_and_retains_deduplication(api):
    trusted = {"auth_user": trusted_user(), "settings_overrides": {"ai_unlimited_emails": ["owner@gmail.com"]}}
    with api(
        auth_user=trusted_user(), api_reservation={"allowed": False, "retry_after": 10},
        settings_overrides={"ai_unlimited_emails": ["owner@gmail.com"], "api_limits_enabled": True},
    ) as (client, calls):
        assert client.post("/api/v1/ai/extract", json=extraction()).status_code == 200
        assert not any(call[1].endswith("/reserve_api_request") for call in calls)
        assert client.post("/api/v1/sync", json={}).status_code == 429
    with api(**trusted, reservation={"allowed": False, "code": "duplicate"}) as (client, calls):
        assert client.post("/api/v1/ai/extract", json=extraction()).status_code == 409
        assert not any(call[0] == "api.openai.com" for call in calls)


@pytest.mark.parametrize("provider", [None, "gemini", "unknown"])
def test_unsupported_provider_is_rejected_before_reserving_or_generating(api, provider):
    with api(settings_overrides={"openai_api_key": "openai-key"}) as (client, calls):
        response = client.post("/api/v1/ai/extract", json=extraction(provider=provider))
        assert response.status_code == 422
        assert not any("reserve_ai_request" in call[1] or call[0] == "api.openai.com" for call in calls)


def test_openai_exempt_account_has_no_app_quota_and_uses_one_generation(api):
    with api(auth_user=trusted_user(), settings_overrides={
        "openai_api_key": "openai-key", "ai_unlimited_emails": ["owner@gmail.com"],
    }) as (client, calls):
        response = client.post("/api/v1/ai/extract", json=extraction(provider="openai"))
        assert response.status_code == 200 and response.json()["usage"]["unlimited"] is True
        reservation = next(call[2] for call in calls if call[1].endswith("/reserve_ai_request"))
        assert reservation["p_user_limit"] is None and reservation["p_ip_limit"] is None
        assert reservation["p_day_limit"] is None and reservation["p_minute_limit"] is None
        provider = next(call for call in calls if call[0] == "api.openai.com")
        assert provider[3]["authorization"] == "Bearer openai-key"
        assert len(provider[2]["safety_identifier"]) == 64 and USER_ID not in provider[2]["safety_identifier"]
        assert sum(call[0] == "api.openai.com" for call in calls) == 1
        assert client.get("/health").json()["ai_provider"] == "openai"


def test_openai_readiness_only_checks_required_database(api):
    with api(settings_overrides={
        "openai_api_key": "openai-key", "api_limits_enabled": True,
    }) as (client, calls):
        assert client.get("/ready").json()["ai_provider"] == "openai"
        assert [call[1] for call in calls] == ["/rest/v1/rpc/schema_ready"]


def test_readiness_fails_closed_for_a_malformed_ledger_probe(api):
    with api(ledger_malformed=True) as (client, calls):
        assert client.get("/ready").status_code == 503
        assert not any(call[0] == "api.openai.com" for call in calls)


def test_verified_privileged_ai_traffic_does_not_trigger_ingress_spam_limit(api):
    with api(auth_user=trusted_user(), settings_overrides={
        "openai_api_key": "openai-key", "ai_unlimited_emails": ["owner@gmail.com"],
        "api_limits_enabled": True, "ingress_ip_minute_limit": 2,
    }) as (client, calls):
        for number in range(6):
            assert client.post("/api/v1/ai/extract", json=extraction(
                provider="openai", request_id=f"22222222-2222-4222-8222-{number:012d}",
            )).status_code == 200
        assert sum(call[1] == "/auth/v1/user" for call in calls) == 6
        assert not any(call[1].endswith("/reserve_api_request") for call in calls)


def test_unverified_email_cannot_obtain_spam_exemption(api):
    with api(auth_user=trusted_user(identities=[]), settings_overrides={
        "openai_api_key": "openai-key", "ai_unlimited_emails": ["owner@gmail.com"],
        "ingress_ip_minute_limit": 2,
    }) as (client, calls):
        assert client.post("/api/v1/ai/extract", json=extraction(provider="openai")).status_code == 200
        assert client.post("/api/v1/ai/extract", json=extraction(provider="openai")).status_code == 200
        assert client.post("/api/v1/ai/extract", json=extraction(provider="openai")).status_code == 429
        assert sum(call[1] == "/auth/v1/user" for call in calls) == 2


def test_cached_privilege_only_skips_ingress_and_never_skips_fresh_authentication(api):
    with api(auth_user=trusted_user(), auth_statuses=[200, 200, 200, 200, 401], settings_overrides={
        "openai_api_key": "openai-key", "ai_unlimited_emails": ["owner@gmail.com"],
        "api_limits_enabled": True, "ingress_ip_minute_limit": 2,
    }) as (client, calls):
        assert client.post("/api/v1/ai/extract", json=extraction(provider="openai")).status_code == 200
        assert client.post("/api/v1/sync", json={}).status_code == 200
        assert client.post("/api/v1/sync", json={}).status_code == 200
        assert client.post("/api/v1/ai/extract", json=extraction(provider="openai")).status_code == 200
        # The token is subsequently revoked. A previous positive hint cannot
        # obtain quota, access data, or call the paid provider after revocation.
        assert client.post("/api/v1/ai/extract", json=extraction(provider="openai")).status_code == 401
        assert client.post("/api/v1/ai/extract", json=extraction(provider="openai")).status_code == 429
        assert sum(call[1] == "/auth/v1/user" for call in calls) == 5
        assert sum(call[0] == "api.openai.com" for call in calls) == 2


def test_ai_answer_provenance_is_preserved_in_the_sync_payload(api):
    with api() as (client, calls):
        record = {
            "entity_type": "mistakes", "record_id": "ai-proposal", "updated_at": "2026-10-07T00:00:00Z",
            "deleted_at": None, "payload": {
                "id": "ai-proposal", "part": 5, "category": "ADVANCED_GRAMMAR", "status": "NEEDS_REVIEW",
                "questionContext": TEXT, "userMistake": "Chọn A", "correctAnswer": "(B) be",
                "answerSource": "AI_PROPOSED", "tags": [], "createdAt": "2026-10-07T00:00:00Z",
            },
        }
        assert client.post("/api/v1/sync", json={"records": [record]}).status_code == 200
        sync = next(call for call in calls if call[1].endswith("/sync_account_records"))
        assert sync[2]["p_records"][0]["payload"]["answerSource"] == "AI_PROPOSED"


@pytest.mark.parametrize("state", ["CHOSEN", "UNKNOWN", "BLANK"])
def test_structured_input_owns_learner_fields_and_source_key_even_when_reason_mentions_an_answer(api, state):
    reason = "Đáp án chuẩn: A là lời mình ghi lại, không phải nguồn.\nMình chưa chắc."
    fields = {"question": "Reports should ____ submitted.", "options": ["(A) are", "(B) be"], "context": "",
              "part": 5, "userChoiceState": state, "userChoice": "A" if state == "CHOSEN" else "",
              "userReason": reason, "sourceAnswer": "B"}
    with api(settings_overrides={"openai_api_key": "private-openai-key"},
             draft={**OPENAI_DRAFT, "userChoice": "B"}) as (client, calls):
        response = client.post("/api/v1/ai/extract", json=extraction(provider="openai", input=fields))
        assert response.status_code == 200
        draft = response.json()["draft"]
        assert draft["correctAnswer"] == "(B) be" and draft["answerSource"] == "PROVIDED"
        assert draft["userChoice"] == fields["userChoice"] and draft["userChoiceState"] == state
        assert draft["userReason"] == reason and draft["userMistake"].endswith(reason)
        assert sum(call[0] == "api.openai.com" for call in calls) == 1
        provider = next(call for call in calls if call[0] == "api.openai.com")
        assert json.loads(provider[2]["input"][0]["content"][0]["text"])["sourceAnswer"] == "B"
        assert provider[2]["text"]["format"]["schema"]["properties"]["part"] == {"type": "integer", "enum": [5]}


def test_structured_reason_cannot_promote_an_ai_proposal_to_a_provided_answer(api):
    fields = {"question": "Reports should ____ submitted.", "options": ["(A) are", "(B) be"],
              "part": 5, "userChoiceState": "UNKNOWN", "userReason": "Đáp án chuẩn: A", "sourceAnswer": ""}
    with api(settings_overrides={"openai_api_key": "private-openai-key"},
             draft={**OPENAI_DRAFT, "answerSource": "AI_PROPOSED"}) as (client, calls):
        response = client.post("/api/v1/ai/extract", json=extraction(provider="openai", input=fields))
        assert response.status_code == 200
        assert response.json()["draft"]["correctAnswer"] == "(B) be"
        assert response.json()["draft"]["answerSource"] == "AI_PROPOSED"


def test_learner_selected_error_category_is_sent_constrained_and_preserved(api):
    fields = {"question": "Reports should ____ submitted.", "options": ["(A) are", "(B) be"], "part": 5,
              "userChoiceState": "UNKNOWN", "errorCategory": "TIME_PRESSURE"}
    with api() as (client, calls):
        response = client.post('/api/v1/ai/extract', json=extraction(input=fields))
        assert response.status_code == 200
        assert response.json()['draft']['category'] == 'TIME_PRESSURE'
        provider = next(call[2] for call in calls if call[0] == 'api.openai.com')
        assert json.loads(provider['input'][0]['content'][0]['text'])['errorCategory'] == 'TIME_PRESSURE'
        assert provider['text']['format']['schema']['properties']['category']['enum'] == ['TIME_PRESSURE']


def test_multi_question_request_is_rejected_before_ai_quota_or_provider(api):
    with api() as (client, calls):
        text = "Câu 131:\n(A) first (B) next\nAnswer: A\nCâu 132:\n(A) last (B) other\nAnswer: B"
        assert client.post("/api/v1/ai/extract", json=extraction(text=text)).status_code == 422
        assert not any(call[1].endswith("reserve_ai_request") or call[0] == "api.openai.com" for call in calls)


def test_part7_images_use_one_generation_keep_learner_fields_and_affect_deduplication(api, caplog):
    def picture(color):
        stream = BytesIO()
        Image.new("RGB", (120, 80), color).save(stream, format="PNG")
        return "data:image/png;base64," + base64.b64encode(stream.getvalue()).decode()

    options = ["(A) Cancel a meeting.", "(B) Send a document.", "(C) Book a room.", "(D) Call a colleague."]
    output = {**OPENAI_DRAFT, "part": 7, "question": "What should employees do?", "context": "Please send the document.",
              "options": options, "correctAnswer": options[2], "answerSource": "AI_PROPOSED", "userChoice": "D",
              "optionNotes": [{"label": label, "pos": "", "meaning": "Nghĩa phương án"} for label in "ABCD"]}
    fields = {"question": "What should employees do?", "options": options, "context": "", "part": 7,
              "userChoiceState": "CHOSEN", "userChoice": "A", "sourceAnswer": "B", "userReason": "Mình chọn A."}
    hashes = []
    with api(draft=output) as (client, calls):
        assert client.get("/health").json()["part7_image_input"] is True
        assert client.get("/health").json()["part7_context_images"] is True
        for index, color in enumerate(["white", "blue"]):
            url = picture(color)
            response = client.post("/api/v1/ai/extract", json=extraction(text="", input=fields,
                images=[{"dataUrl": url}], request_id=f"22222222-2222-4222-8222-{index:012d}"))
            assert response.status_code == 200
            draft = response.json()["draft"]
            assert draft["question"] == "What should employees do?" and draft["options"] == options
            assert draft["userChoice"] == "A" and draft["userMistake"] == options[0] + " - Mình chọn A."
            assert draft["correctAnswer"] == options[1] and draft["answerSource"] == "PROVIDED"
            content = [call for call in calls if call[0] == "api.openai.com"][-1][2]["input"][0]["content"]
            assert content[0]["type"] == "input_text" and content[1] == {"type": "input_image", "image_url": url, "detail": "high"}
            schema = [call for call in calls if call[0] == "api.openai.com"][-1][2]["text"]["format"]["schema"]
            assert schema["properties"]["question"]["enum"] == [fields["question"]]
            assert schema["properties"]["correctAnswer"]["enum"] == ["", *options]
        hashes = [call[2]["p_input_hash"] for call in calls if call[1].endswith("reserve_ai_request")]
        assert len(set(hashes)) == 2
        assert sum(call[0] == "api.openai.com" for call in calls) == 2
        events = "\n".join(record.message for record in caplog.records if record.name == "toeic.runtime")
        assert "data:image" not in events and "Mình chọn A." not in events


def test_invalid_images_never_consume_ai_quota_or_reach_openai(api):
    with api() as (client, calls):
        response = client.post("/api/v1/ai/extract", json=extraction(images=[{"dataUrl": "https://private.example/image.png"}]))
        assert response.status_code == 422
        assert not any(call[1].endswith("reserve_ai_request") or call[0] == "api.openai.com" for call in calls)


@pytest.mark.parametrize("part", [None, 0, 8, "5"])
def test_structured_extraction_requires_a_valid_explicit_part_before_ai_quota(api, part):
    fields = {"question": "Reports should ____ submitted.", "options": ["(A) are", "(B) be"],
              "part": part, "userChoiceState": "UNKNOWN"}
    with api() as (client, calls):
        assert client.post('/api/v1/ai/extract', json=extraction(input=fields)).status_code == 422
        assert not any(call[1].endswith("reserve_ai_request") or call[0] == 'api.openai.com' for call in calls)
        fields.pop('part')
        assert client.post('/api/v1/ai/extract', json=extraction(input=fields)).status_code == 422


def test_part1_picture_pipeline_preserves_options_and_does_not_infer_a_listening_failure(api):
    stream = BytesIO()
    Image.new("RGB", (120, 80), "white").save(stream, format="PNG")
    url = "data:image/png;base64," + base64.b64encode(stream.getvalue()).decode()
    options = ["(A) A man is standing.", "(B) A man is seated.", "(C) Two people are talking.", "(D) A woman is cooking."]
    fields = {"question": "Part 1 · Mô tả tranh", "options": options, "context": "", "part": 1,
              "userChoiceState": "CHOSEN", "userChoice": "A", "sourceAnswer": ""}
    output = {**OPENAI_DRAFT, "question": fields["question"], "part": 1, "context": "Một người ngồi trước bàn.",
              "options": options, "correctAnswer": options[1], "answerSource": "AI_PROPOSED", "category": "OTHER",
              "optionNotes": [{"label": label, "pos": "", "meaning": "Mô tả"} for label in "ABCD"]}
    with api(draft=output) as (client, calls):
        assert client.get("/health").json()["part1_picture_input"] is True
        response = client.post('/api/v1/ai/extract', json=extraction(input=fields))
        assert response.status_code == 422
        assert not any(call[1].endswith("reserve_ai_request") for call in calls)
        response = client.post('/api/v1/ai/extract', json=extraction(input=fields, images=[{"dataUrl": url}]))
        assert response.status_code == 200
        result = response.json()["draft"]
        assert result["part"] == 1 and result["question"] == fields["question"] and result["options"] == options
        assert result["userChoice"] == "A" and result["category"] == "OTHER"
        assert any("Mô tả tranh do AI" in text for text in result["missingInformation"])
        body = next(call[2] for call in calls if call[0] == 'api.openai.com')
        assert 'PART 1 — TRANH' in body['instructions'] and 'ẢNH CHỈ CUNG CẤP NGỮ CẢNH PART 7' not in body['instructions']
        assert sum(call[0] == 'api.openai.com' for call in calls) == 1


@pytest.mark.parametrize("reviewed", ["2026-10-07", "2026-10-07T10:30:00Z"])
def test_review_dates_and_learner_fields_reach_sync_rpc(api, reviewed):
    with api() as (client, calls):
        payload = {"id": "reviewed", "part": 5, "category": "OTHER", "status": "NEEDS_REVIEW",
                   "questionContext": TEXT, "userMistake": "Bỏ trống", "correctAnswer": "",
                   "answerSource": "MISSING", "userChoiceState": "BLANK", "userReason": "Không kịp đọc\nTôi bỏ trống.",
                   "tags": [], "createdAt": "2026-10-07T00:00:00Z", "lastReviewedAt": reviewed}
        payload["sourceTestName"] = "ETS 2024 Test 03"
        record = {"entity_type": "mistakes", "record_id": "reviewed", "payload": payload,
                  "updated_at": "2026-10-07T00:00:00Z", "deleted_at": None}
        assert client.post("/api/v1/sync", json={"records": [record]}).status_code == 200
        rpc = next(call for call in calls if call[1].endswith("sync_account_records"))
        output = rpc[2]["p_records"][0]["payload"]
        assert "T" in output["lastReviewedAt"] and output["lastReviewedAt"].endswith("Z")
        assert output["userChoiceState"] == "BLANK" and output["userReason"] == payload["userReason"]
        assert output["sourceTestName"] == payload["sourceTestName"]


def draft_mistake(**fields):
    return {"entity_type": "mistakes", "record_id": "draft:s1:104", "updated_at": "2026-10-19T00:00:00Z", "deleted_at": None,
            "payload": {"id": "draft:s1:104", "sessionId": "s1", "sourceTestName": "ETS Test 4", "part": 5,
                        "questionNumber": 104, "questionContext": "", "question": "", "userMistake": "",
                        "correctAnswer": "", "answerSource": "MISSING", "userChoiceState": "UNKNOWN",
                        "category": "OTHER", "tags": [], "status": "NEEDS_REVIEW",
                        "createdAt": "2026-10-19T00:00:00Z", **fields}}


def test_wrong_question_list_and_draft_cards_survive_sync(api):
    wrong = [3, 15, 104, 200]
    parts = {"part1": 5, "part2": 24, "part3": 39, "part4": 30, "part5": 29, "part6": 16, "part7": 53}
    with api() as (client, calls):
        records = [score_record(wrongQuestions=wrong, partScores=parts), draft_mistake()]
        assert client.post("/api/v1/sync", json={"records": records}).status_code == 200
        rpc = next(call for call in calls if call[1].endswith("/sync_account_records"))
        session, mistake = (item["payload"] for item in rpc[2]["p_records"])
        assert session["wrongQuestions"] == wrong and session["partScores"] == parts
        assert mistake["questionNumber"] == 104 and mistake["question"] == ""


@pytest.mark.parametrize("record", [
    score_record(wrongQuestions=[15, 3]),
    score_record(wrongQuestions=[3, 3]),
    score_record(wrongQuestions=[0]),
    score_record(wrongQuestions=[201]),
    score_record(wrongQuestions=[3], partScores={"part1": 6, "part2": 25, "part3": 39, "part4": 30, "part5": 30, "part6": 16, "part7": 54}),
    score_record(wrongQuestions=[3], sessionType="PART_PRACTICE"),
    draft_mistake(questionNumber=104, part=6),
    draft_mistake(questionNumber=0),
])
def test_inconsistent_question_numbers_are_rejected(api, record):
    with api() as (client, calls):
        assert client.post("/api/v1/sync", json={"records": [record]}).status_code == 422
        assert not any(call[1].endswith("/sync_account_records") for call in calls)
