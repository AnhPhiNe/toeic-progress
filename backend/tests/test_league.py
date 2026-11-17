import json
from datetime import date, datetime, timedelta, timezone

import httpx
import pytest
from fastapi.testclient import TestClient

from app.api.routes import league as league_route
from app.core.config import Settings
from app.main import create_app
from app.services import league

USER_ID = "11111111-1111-4111-8111-111111111111"
# Wednesday 2026-11-18 10:00 in Vietnam.
NOW = datetime(2026, 11, 18, 3, 0, tzinfo=timezone.utc)
MONDAY = date(2026, 11, 16)


def vn(day: int, hour: int = 9) -> str:
    return datetime(2026, 11, day, hour, tzinfo=league.VN).isoformat()


def full_test(day: int, **extra):
    return {"session_type": "FULL_TEST", "study_date": f"2026-11-{day:02d}", "created_at": vn(day),
            "total_score": 600, "part1_correct": None, "has_practice_parts": False, "duration_minutes": 120, **extra}


# --- Week boundaries ------------------------------------------------------------------------


def test_week_starts_monday_in_vietnam_time():
    # Sunday 23:59 in Vietnam is still last week; Monday 00:00 starts a new one.
    assert league.week_start(datetime(2026, 11, 22, 16, 59, tzinfo=timezone.utc)) == MONDAY
    assert league.week_start(datetime(2026, 11, 22, 17, 0, tzinfo=timezone.utc)) == date(2026, 11, 23)
    # Monday 01:00 in Vietnam is still Sunday in UTC.
    assert league.week_start(datetime(2026, 11, 15, 18, 0, tzinfo=timezone.utc)) == MONDAY


def test_days_left_counts_partial_days():
    assert league.days_left(NOW) == 5  # Wed 10:00 → Mon 00:00 is 4 days 14 hours
    assert league.days_left(datetime(2026, 11, 22, 16, 0, tzinfo=timezone.utc)) == 1


# --- Star table and cap ---------------------------------------------------------------------


def test_star_table_counts_each_real_action():
    facts = {
        "sessions": [full_test(16),
                     {"session_type": "PART_PRACTICE", "study_date": "2026-11-17", "created_at": vn(17),
                      "has_practice_parts": True, "duration_minutes": 0},
                     # Not real actions: no score, too short.
                     full_test(17, total_score=None),
                     {"session_type": "PART_PRACTICE", "study_date": "2026-11-17", "created_at": vn(17),
                      "has_practice_parts": False, "duration_minutes": 2}],
        "pacing": [{"study_date": "2026-11-17", "created_at": vn(17), "actual_minutes": 15, "finished_naturally": True},
                   {"study_date": "2026-11-17", "created_at": vn(17), "actual_minutes": 15, "finished_naturally": False}],
        "mistakes": [{"created_at": vn(18, 8), "last_reviewed_at": vn(18, 9)},
                     {"created_at": vn(10), "last_reviewed_at": None}],  # added last week
        "vocab": [{"study_date": "2026-11-18", "updated_at": vn(18, 7)}],
    }
    stars = league.weekly_stars(facts, MONDAY, NOW)
    assert stars["daily"] == {date(2026, 11, 16): 20, date(2026, 11, 17): 8 + 6, date(2026, 11, 18): 1 + 2 + 5}
    assert stars["total"] == 42
    assert stars["today"] == 8


def test_daily_cap_is_sixty_per_day():
    facts = {"sessions": [full_test(16), full_test(16), full_test(16), full_test(16), full_test(17)],
             "mistakes": [{"created_at": vn(17, 8), "last_reviewed_at": vn(17, 9)} for _ in range(30)]}
    stars = league.weekly_stars(facts, MONDAY, NOW)
    assert stars["daily"][date(2026, 11, 16)] == 60
    assert stars["daily"][date(2026, 11, 17)] == 60
    assert stars["total"] == 120


def test_future_and_back_dated_rows_do_not_count():
    facts = {"sessions": [
        full_test(19),                                   # tomorrow
        full_test(18, created_at=vn(19)),                # timestamp in the future
        full_test(15, created_at=vn(18)),                # dated Sunday, logged today → last week
        full_test(16, created_at=vn(14)),                # timestamp before the week
        full_test(18, created_at=(NOW + timedelta(minutes=4)).isoformat()),  # within the sync clock tolerance
    ]}
    stars = league.weekly_stars(facts, MONDAY, NOW)
    assert stars["total"] == 20
    assert stars["daily"] == {date(2026, 11, 18): 20}


def test_week_boundary_uses_vietnam_day_for_reviews():
    # Sunday 23:30 Vietnam = Sunday 16:30 UTC: last week. Monday 00:30 Vietnam: this week.
    facts = {"mistakes": [{"created_at": vn(1), "last_reviewed_at": datetime(2026, 11, 15, 16, 30, tzinfo=timezone.utc).isoformat()},
                          {"created_at": vn(1), "last_reviewed_at": datetime(2026, 11, 15, 17, 30, tzinfo=timezone.utc).isoformat()}]}
    stars = league.weekly_stars(facts, MONDAY, NOW)
    assert stars["daily"] == {date(2026, 11, 16): 2}


def test_vocab_counts_once_per_day():
    facts = {"vocab": [{"study_date": "2026-11-17", "updated_at": vn(17)}, {"study_date": "2026-11-17", "updated_at": vn(17, 10)}]}
    assert league.weekly_stars(facts, MONDAY, NOW)["total"] == 5


# --- Zones ----------------------------------------------------------------------------------


@pytest.mark.parametrize(("size", "expected"), [(20, 5), (15, 5), (14, 4), (9, 3), (6, 2), (5, 0), (1, 0)])
def test_zone_is_top_and_bottom_five_for_full_groups(size, expected):
    assert league.zone(size) == expected


def test_state_marks_zones_and_respects_tier_ends():
    rows = [{"rank": n, "nickname": f"Bạn {n}", "coat": "nau-cam", "stars": 100 - n, "me": n == 4} for n in range(1, 21)]
    result = {"member": {"nickname": "Bạn 4", "coat": "nau-cam", "tier": 1}, "group": {"tier": 1, "rows": rows}, "lastWeek": None}
    state = league.build_state(result, now=NOW, stars={"total": 96, "today": 10}, last_week_stars=50)
    assert state["mode"] == "table"
    assert state["group"]["promote"] == 5 and state["group"]["demote"] == 0  # Đồng cannot go lower
    assert state["me"] == {"stars": 96, "today": 10, "rank": 4, "lastWeekStars": 50}
    top = {**result, "group": {"tier": 4, "rows": rows}}
    assert league.build_state(top, now=NOW, stars=None, last_week_stars=None)["group"]["promote"] == 0


def test_fallback_when_fewer_than_five_others():
    rows = [{"rank": n, "nickname": f"Bạn {n}", "coat": "nau-cam", "stars": 10, "me": n == 1} for n in range(1, 6)]
    result = {"member": {"nickname": "Bạn 1", "coat": "nau-cam", "tier": 2}, "group": {"tier": 2, "rows": rows}}
    state = league.build_state(result, now=NOW, stars={"total": 10, "today": 0}, last_week_stars=30)
    assert state["mode"] == "fallback"
    assert state["me"]["lastWeekStars"] == 30
    assert state["group"]["promote"] == 0 and state["group"]["demote"] == 0


# --- Nicknames ------------------------------------------------------------------------------


@pytest.mark.parametrize("name", ["Sóc Nâu", "Mây Bay 2", "Đại Lớn", "ab", "Bắp  Rang"])
def test_nickname_accepts_vietnamese_letters_and_digits(name):
    assert league.clean_nickname(name) == " ".join(name.split())


@pytest.mark.parametrize("name", ["a", "x" * 21, "Sóc!", "<b>hi</b>", "admin@x", "đồ lồn", "dm may", "Fuck you", "con cac"])
def test_nickname_rejects_bad_input(name):
    with pytest.raises(ValueError):
        league.clean_nickname(name)


# --- Endpoints ------------------------------------------------------------------------------


@pytest.fixture
def api(monkeypatch):
    monkeypatch.setattr(league_route, "now_utc", lambda: NOW)

    def make(*, guest=False, member=None, rows=None, refresh=None):
        calls = []

        def respond(request):
            body = json.loads(request.content) if request.content else None
            calls.append((request.method, request.url.path, body, dict(request.url.params)))
            path = request.url.path
            if path == "/auth/v1/user":
                return httpx.Response(200, json={"id": USER_ID, "is_anonymous": guest})
            if path.endswith("/reserve_api_request"):
                return httpx.Response(200, json={"allowed": True})
            if path == "/rest/v1/league_members":
                return httpx.Response(200, json=[] if member is None else [member])
            if path in ("/rest/v1/study_sessions", "/rest/v1/pacing_runs", "/rest/v1/mistakes", "/rest/v1/vocabulary_logs"):
                assert request.url.params["user_id"] == "eq." + USER_ID
                return httpx.Response(200, json=(rows or {}).get(path.rsplit("/", 1)[-1], []))
            if path.endswith("/league_refresh"):
                return httpx.Response(200, json=refresh or {"member": None, "lastWeek": None})
            if path.rsplit("/", 1)[-1] in ("league_join", "league_leave", "league_update"):
                return httpx.Response(200, content=b"")
            raise AssertionError(f"Unexpected request: {request.url}")

        settings = Settings(_env_file=None, supabase_url="https://database.example", supabase_publishable_key="public-key",
                            supabase_secret_key="server-secret", openai_api_key="openai-secret",
                            rate_limit_secret="rate-secret", turnstile_secret_key="captcha-secret",
                            api_limits_enabled=True)
        client = TestClient(create_app(settings, httpx.MockTransport(respond)))
        client.headers["Authorization"] = "Bearer user-token"
        return client, calls

    return make


def rpc_calls(calls, name):
    return [body for method, path, body, _ in calls if path.endswith("/" + name)]


def test_guest_cannot_use_league(api):
    client, calls = api(guest=True)
    with client:
        assert client.get("/api/v1/league").status_code == 403
        assert client.post("/api/v1/league/join", json={"nickname": "Sóc Nâu"}).status_code == 403
    assert not rpc_calls(calls, "league_refresh")


def test_non_member_gets_opt_in_state_without_reading_study_rows(api):
    client, calls = api()
    with client:
        response = client.get("/api/v1/league")
    assert response.status_code == 200
    assert response.json()["mode"] == "none" and response.json()["member"] is None
    assert rpc_calls(calls, "league_refresh") == [{"p_owner_id": USER_ID, "p_week": "2026-11-16", "p_stars": None}]
    assert not any(path == "/rest/v1/study_sessions" for _, path, _, _ in calls)
    # League requests are limited like sync requests.
    assert rpc_calls(calls, "reserve_api_request")[0]["p_scope"] == "sync"


def test_member_stars_come_from_server_rows_not_the_request(api):
    rows = {"study_sessions": [full_test(16), full_test(9)], "mistakes": [{"created_at": vn(18, 8), "last_reviewed_at": None}]}
    group = {"tier": 1, "rows": [{"rank": 1, "nickname": "Sóc Nâu", "coat": "nau-cam", "stars": 21, "me": True}]}
    refresh = {"member": {"nickname": "Sóc Nâu", "coat": "nau-cam", "tier": 1}, "group": group, "lastWeek": None}
    client, calls = api(member={"opted_out_at": None}, rows=rows, refresh=refresh)
    with client:
        state = client.get("/api/v1/league", params={"stars": 999}).json()
    assert rpc_calls(calls, "league_refresh")[0]["p_stars"] == 21
    assert state["mode"] == "fallback"
    assert state["me"] == {"stars": 21, "today": 1, "rank": 1, "lastWeekStars": 20}
    # Only last week onward is read.
    sessions = next(params for _, path, _, params in calls if path == "/rest/v1/study_sessions")
    assert sessions["study_date"] == "gte.2026-11-09" and sessions["deleted_at"] == "is.null"
    assert USER_ID not in json.dumps(state)


def test_join_validates_and_normalises_nickname(api):
    client, calls = api()
    with client:
        assert client.post("/api/v1/league/join", json={"nickname": "x"}).status_code == 422
        assert client.post("/api/v1/league/join", json={"nickname": "Sóc", "coat": "Đỏ!"}).status_code == 422
        assert client.post("/api/v1/league/join", json={"nickname": "Sóc Nâu", "stars": 5}).status_code == 422
        assert client.post("/api/v1/league/join", json={"nickname": "  Sóc   Nâu "}).status_code == 200
    assert rpc_calls(calls, "league_join") == [
        {"p_owner_id": USER_ID, "p_week": "2026-11-16", "p_nickname": "Sóc Nâu", "p_coat": "nau-cam"}]


def test_leave_and_update(api):
    client, calls = api(member={"opted_out_at": None}, refresh={"member": None, "lastWeek": None})
    with client:
        assert client.post("/api/v1/league/leave").status_code == 200
        assert client.patch("/api/v1/league/me", json={}).status_code == 422
        assert client.patch("/api/v1/league/me", json={"coat": "xam-khoi"}).status_code == 200
    assert rpc_calls(calls, "league_leave") == [{"p_owner_id": USER_ID, "p_week": "2026-11-16"}]
    assert rpc_calls(calls, "league_update") == [
        {"p_owner_id": USER_ID, "p_week": "2026-11-16", "p_nickname": None, "p_coat": "xam-khoi"}]


def test_update_requires_membership(api):
    client, calls = api(member=None)
    with client:
        assert client.patch("/api/v1/league/me", json={"nickname": "Sóc Mới"}).status_code == 409
    assert not rpc_calls(calls, "league_update")


def test_cors_allows_patch(api):
    client, _ = api()
    with client:
        response = client.options("/api/v1/league/me", headers={
            "Origin": "http://localhost:5173", "Access-Control-Request-Method": "PATCH"})
    assert "PATCH" in response.headers.get("access-control-allow-methods", "")
