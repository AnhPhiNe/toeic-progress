"""Security wave 2 on POST /api/v1/sync: payload bounds (S-19), bounded extra (S-07),
page continuation, and database data errors returned as 4xx instead of 503."""

import json

import httpx
import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.core.config import Settings
from app.main import create_app
from app.schemas.models import SyncRequest

USER_ID = "11111111-1111-4111-8111-111111111111"
STAMP = "2026-11-20T00:00:00Z"
PROFILE = {"name": "Alice", "targetScore": 800, "examDate": "", "selectedSkill": "LR", "dailyMinGoalMinutes": 30, "streakFreezes": 2}


def row(entity_type, payload, updated_at=STAMP, deleted_at=None):
    record_id = "profile" if entity_type == "profile" else payload["id"]
    return {"entity_type": entity_type, "record_id": record_id, "payload": payload, "updated_at": updated_at, "deleted_at": deleted_at}


def session(**fields):
    return row("sessions", {"id": "s1", "skillType": "LR", "sessionType": "PART_PRACTICE", "testName": "Mini", "date": "2026-11-19",
                            "durationMinutes": 20, "createdAt": STAMP, **fields})


def pacing(**fields):
    return row("pacingRuns", {"id": "p1", "presetId": "P5", "presetName": "Part 5", "date": "2026-11-19", "plannedMinutes": 10,
                              "actualMinutes": 9, "finishedNaturally": True, "createdAt": STAMP, "phases": [], **fields})


def vocab(**fields):
    return row("vocabLog", {"id": "v1", "date": "2026-11-19", "count": 3, **fields})


def valid(*records, **request):
    SyncRequest.model_validate({"records": list(records), **request})


def invalid(*records, **request):
    with pytest.raises(ValidationError):
        valid(*records, **request)


def nested(depth):
    value = "leaf"
    for _ in range(depth - 1):
        value = {"n": value}
    return value


def test_realistic_dates_and_instants_only():
    valid(session(date="1970-01-01"), row("profile", {**PROFILE, "examDate": "2100-12-31"}))
    for bad in ("0001-01-01", "9999-12-31"):
        invalid(session(date=bad))
        invalid(row("profile", {**PROFILE, "examDate": bad}))
        invalid(vocab(date=bad))
    invalid(session(createdAt="0001-01-01T00:00:00Z"))
    invalid(row("vocabLog", vocab()["payload"], "0001-01-01T00:00:00Z"))
    invalid(row("vocabLog", {"id": "v1"}, STAMP, "0001-01-01T00:00:00Z"))


@pytest.mark.parametrize("record", [
    row("profile", {**PROFILE, "currentStreak": 2**31}),
    row("profile", {**PROFILE, "shieldAllowance": 2**40}),
    session(attemptNumber=2**31),
    pacing(plannedMinutes=1e308),
    pacing(actualSeconds=1e12),
    pacing(phases=[{"name": "x", "plannedMinutes": 1, "actualMinutes": 1, "overrunMinutes": -1e308}]),
    pacing(presetId="x" * 101),
    pacing(presetName="x" * 201),
    row("mistakes", {"id": "m1", "part": 5, "category": "OTHER", "status": "NEEDS_REVIEW", "questionContext": "Q", "userMistake": "",
                     "correctAnswer": "B", "tags": [], "createdAt": STAMP, "reviewCount": 2**40}),
])
def test_numbers_and_strings_fit_their_columns(record):
    invalid(record)


def test_nul_characters_and_non_finite_numbers_are_refused():
    invalid(vocab(sourceName="a\x00b"))
    invalid(vocab(**{"bad\x00key": 1}))
    invalid({**vocab(), "record_id": "v\x00", "payload": {**vocab()["payload"], "id": "v\x00"}})
    invalid(vocab(weird=float("nan")))
    invalid(vocab(weird=float("inf")))


def test_payload_depth_is_bounded():
    valid(vocab(note=nested(6)))  # payload(1) > note(2..7)
    invalid(vocab(note=nested(8)))
    invalid(vocab(note=nested(5000)))


def test_unknown_fields_are_bounded_per_entity():
    habits = [{"id": f"h{n}", "title": "Nghe 10 phút", "doneDates": ["2026-11-19"] * 30} for n in range(3)]
    valid(row("profile", {**PROFILE, "habits": habits, "socGear": ["hat"], "goalChosen": True}))
    # A heavy real profile: 3 habits with 120 ticked days each and 40 stored suggestions.
    heavy_habits = [{"id": f"habit-{n}", "title": "Nghe chép chính tả mười phút", "doneDates": ["2026-11-19"] * 120} for n in range(3)]
    tasks = [{"id": f"attempt-{n}:7:timer", "kind": "timer", "title": "Bấm giờ Part 7", "minutes": 20, "part": 7,
              "testName": "ETS 2024 Test 10", "testDate": "2026-11-18", "addedDate": "2026-11-19", "doneDate": "2026-11-19"}
             for n in range(40)]
    valid(row("profile", {**PROFILE, "habits": heavy_habits, "suggestedTasks": tasks, "suggestOff": ["FULL_TEST"], "weeklyGoalDays": 5}))
    invalid(row("profile", {**PROFILE, **{f"k{n}": n for n in range(33)}}))
    invalid(row("profile", {**PROFILE, "junk": "x" * 29000}))
    invalid(vocab(junk="x" * 1100))
    invalid(session(partDurations={"part5": 10}, junk="x" * 2100))
    valid(session(partDurations={"part5": 10, "part6": 8, "part7": 50}))


def test_mistakes_sync_record_allows_up_to_64kib_and_typed_v2_fields():
    rich_card = {
        "id": "m-rich",
        "part": 7,
        "category": "VOCABULARY_TRAP",
        "status": "NEEDS_REVIEW",
        "questionContext": "Q" + ("x" * 15000),
        "question": "What is implied? " + ("q" * 12000),
        "context": "Đoạn 1 — Email\n" + ("Nội dung dài tiếng Việt. " * 400),
        "userMistake": "(A) Wrong",
        "correctAnswer": "(B) Right",
        "options": ["(A) Wrong", "(B) Right", "(C) C", "(D) D"],
        "optionNotes": [{"label": "A", "pos": "n", "meaning": "sai", "reason": "không đúng bài"}],
        "explanation": {
            "quickTip": "Đọc kỹ đoạn 3.",
            "translation": "Bản dịch ngắn.",
            "questionType": "Suy luận",
            "evidence": "Evidence sentence here.",
            "paraphrase": "",
            "analysis": "Phân tích chi tiết.",
            "keyVocabulary": "refund: hoàn tiền",
            "evidences": [{"passageLabel": "Đoạn 3", "text": "Evidence sentence here.", "translation": "Dịch bằng chứng."}],
            "words": [{"word": "refund", "meaning": "hoàn tiền"}],
        },
        "savedWords": ["refund"],
        "answerDoubt": "B",
        "tags": ["part7"],
        "createdAt": STAMP,
        "trapTip": "a" * 3500,
    }
    assert len(json.dumps(rich_card, ensure_ascii=False).encode()) > 32768
    valid(row("mistakes", rich_card))
    # Above 64 KiB for mistakes must still be rejected; non-mistakes stay capped at 32 KiB.
    invalid(row("mistakes", {**rich_card, "question": "q" * 16000, "context": "Đoạn 1\n" + ("b" * 15990), "questionContext": "x" * 16000, "userMistake": "u" * 4000, "correctAnswer": "c" * 2000, "extraBlob": "z" * 15000}))
    invalid(session(notes="a" * 33000))


def test_request_size_and_continuation_shape():
    valid(*[vocab(id=f"v{n}") | {"record_id": f"v{n}"} for n in range(1000)])
    invalid(*[vocab(id=f"v{n}") | {"record_id": f"v{n}"} for n in range(1001)])
    valid(after=12)
    invalid(vocab(), after=12)
    invalid(after=-1)


@pytest.fixture
def api():
    def make(sync_status=200, sync_body=None):
        calls = []

        def respond(request):
            body = json.loads(request.content) if request.content else None
            calls.append((request.url.path, body))
            path = request.url.path
            if path == "/auth/v1/user":
                return httpx.Response(200, json={"id": USER_ID, "is_anonymous": False})
            if path.endswith("/reserve_api_request"):
                return httpx.Response(200, json={"allowed": True})
            if path.endswith("/sync_account_records") or path.endswith("/sync_page"):
                return httpx.Response(sync_status, json=sync_body or {"cursor": 7, "records": [], "hasRecords": False, "hasMore": False})
            raise AssertionError(f"Unexpected request: {request.url}")

        settings = Settings(_env_file=None, supabase_url="https://database.example", supabase_publishable_key="public-key",
                            supabase_secret_key="server-secret", openai_api_key="openai-secret",
                            rate_limit_secret="rate-secret", turnstile_secret_key="captcha-secret", api_limits_enabled=True)
        client = TestClient(create_app(settings, httpx.MockTransport(respond)))
        client.headers["Authorization"] = "Bearer user-token"
        return client, calls

    return make


def test_next_page_goes_to_sync_page(api):
    client, calls = api()
    with client:
        assert client.post("/api/v1/sync", json={"records": [], "after": 41}).status_code == 200
        assert client.post("/api/v1/sync", json={"records": [vocab()], "after": 41}).status_code == 422
    assert [body for path, body in calls if path.endswith("/sync_page")] == [{"p_user_id": USER_ID, "p_after": 41}]
    assert not any(path.endswith("/sync_account_records") for path, _ in calls)


def test_hostile_nesting_is_a_bad_request_not_a_crash(api):
    client, calls = api()
    with client:
        response = client.post("/api/v1/sync", content=b'{"records":' + b"[" * 100000 + b"]" * 100000 + b"}",
                               headers={"Content-Type": "application/json"})
    # FastAPI refuses a body json.loads cannot parse (RecursionError) with 400, never 500.
    assert response.status_code == 400
    assert not any(path.endswith("/sync_account_records") for path, _ in calls)


@pytest.mark.parametrize(("error", "status"), [
    ({"code": "23514", "message": 'new row for relation "vocabulary_logs" violates check constraint "extra_bounded"'}, 422),
    ({"code": "22003", "message": "integer out of range"}, 422),
    ({"code": "P0001", "message": "Invalid record"}, 422),
    ({"code": "P0001", "message": "Account record limit reached"}, 409),
    ({"code": "57014", "message": "canceling statement due to statement timeout"}, 503),
])
def test_database_data_errors_are_client_errors(api, error, status):
    client, _ = api(sync_status=400 if status != 503 else 500, sync_body=error)
    with client:
        response = client.post("/api/v1/sync", json={"records": [vocab()]})
    assert response.status_code == status
    assert "violates" not in response.text and "relation" not in response.text, "Database details stay private"


def test_maintenance_repeats_while_league_groups_remain():
    import asyncio

    from app.commands import maintenance

    replies = [{"syncTombstones": 3, "leagueGroups": 200, "leagueMore": True, "limit": 5000},
               {"syncTombstones": 0, "leagueGroups": 12, "leagueMore": False, "limit": 5000}]

    class Gateway:
        async def rpc(self, name, parameters, **_):
            assert name == "run_maintenance"
            return replies.pop(0)

    assert asyncio.run(maintenance.run(Gateway())) == {"syncTombstones": 3, "leagueGroups": 212}
    assert replies == []
