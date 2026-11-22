import json
from datetime import date, datetime, timezone

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


# --- Zones ----------------------------------------------------------------------------------


@pytest.mark.parametrize(("size", "expected"), [(20, 5), (15, 5), (14, 4), (9, 3), (6, 2), (5, 0), (1, 0)])
def test_zone_is_top_and_bottom_five_for_full_groups(size, expected):
    assert league.zone(size) == expected


def test_state_marks_zones_and_respects_tier_ends():
    rows = [{"rank": n, "nickname": f"Bạn {n}", "coat": "nau-cam", "stars": 100 - n, "me": n == 4} for n in range(1, 21)]
    result = {"weekStart": "2026-11-16", "member": {"nickname": "Bạn 4", "coat": "nau-cam", "tier": 1},
              "group": {"tier": 1, "rows": rows}, "lastWeek": None, "stars": {"total": 96, "today": 10}, "lastWeekStars": 50}
    state = league.build_state(result, now=NOW)
    assert state["mode"] == "table"
    assert state["group"]["promote"] == 5 and state["group"]["demote"] == 0  # Đồng cannot go lower
    assert state["me"] == {"stars": 96, "today": 10, "rank": 4, "lastWeekStars": 50}
    top = {**result, "group": {"tier": 4, "rows": rows}, "stars": None}
    assert league.build_state(top, now=NOW)["group"]["promote"] == 0


def test_fallback_when_fewer_than_five_others():
    rows = [{"rank": n, "nickname": f"Bạn {n}", "coat": "nau-cam", "stars": 10, "me": n == 1} for n in range(1, 6)]
    result = {"member": {"nickname": "Bạn 1", "coat": "nau-cam", "tier": 2}, "group": {"tier": 2, "rows": rows},
              "stars": {"total": 10, "today": 0}, "lastWeekStars": 30}
    state = league.build_state(result, now=NOW)
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

    def make(*, guest=False, member=None, refresh=None):
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
            if path.endswith("/league_state"):
                return httpx.Response(200, json=refresh or {"weekStart": "2026-11-16", "member": None, "lastWeek": None})
            if path.rsplit("/", 1)[-1] == "league_join" and body["p_nickname"] == "Muộn Rồi":
                return httpx.Response(400, json={"code": "P0001", "message": "Stale league week"})
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
    assert not rpc_calls(calls, "league_state")


def test_non_member_gets_opt_in_state_without_reading_study_rows(api):
    client, calls = api()
    with client:
        response = client.get("/api/v1/league")
    assert response.status_code == 200
    assert response.json()["mode"] == "none" and response.json()["member"] is None
    assert rpc_calls(calls, "league_state") == [{"p_user_id": USER_ID}]
    # One database round trip: no table reads.
    assert not any(path.startswith("/rest/v1/") and "/rpc/" not in path for _, path, _, _ in calls)
    # League requests are limited like sync requests.
    assert rpc_calls(calls, "reserve_api_request")[0]["p_scope"] == "sync"


def test_member_state_is_one_rpc_and_stars_come_from_the_database(api):
    group = {"tier": 1, "rows": [{"rank": 1, "nickname": "Sóc Nâu", "coat": "nau-cam", "stars": 21, "me": True}]}
    refresh = {"weekStart": "2026-11-16", "member": {"nickname": "Sóc Nâu", "coat": "nau-cam", "tier": 1}, "group": group,
               "lastWeek": None, "stars": {"total": 21, "today": 1, "daily": {"2026-11-18": 1}}, "lastWeekStars": 20}
    client, calls = api(member={"opted_out_at": None}, refresh=refresh)
    with client:
        state = client.get("/api/v1/league", params={"stars": 999}).json()
    assert rpc_calls(calls, "league_state") == [{"p_user_id": USER_ID}]
    assert [path for _, path, _, _ in calls if "/rest/v1/" in path] == ["/rest/v1/rpc/reserve_api_request", "/rest/v1/rpc/league_state"]
    assert state["mode"] == "fallback"
    assert state["me"] == {"stars": 21, "today": 1, "rank": 1, "lastWeekStars": 20}
    assert state["week"]["start"] == "2026-11-16" and state["week"]["daysLeft"] == 5
    assert USER_ID not in json.dumps(state)


def test_week_comes_from_the_database(api):
    # The app server clock says Wednesday; the database already says next week (it decides).
    client, _ = api(refresh={"weekStart": "2026-11-23", "member": None, "lastWeek": None})
    with client:
        assert client.get("/api/v1/league").json()["week"]["start"] == "2026-11-23"


def test_stale_week_is_a_retryable_conflict(api):
    client, _ = api()
    with client:
        response = client.post("/api/v1/league/join", json={"nickname": "Muộn Rồi"})
    assert response.status_code == 409


def test_join_validates_and_normalises_nickname(api):
    client, calls = api()
    with client:
        assert client.post("/api/v1/league/join", json={"nickname": "x"}).status_code == 422
        assert client.post("/api/v1/league/join", json={"nickname": "Sóc", "coat": "Đỏ!"}).status_code == 422
        assert client.post("/api/v1/league/join", json={"nickname": "Sóc Nâu", "stars": 5}).status_code == 422
        assert client.post("/api/v1/league/join", json={"nickname": "  Sóc   Nâu "}).status_code == 200
    assert rpc_calls(calls, "league_join") == [
        {"p_user_id": USER_ID, "p_week": "2026-11-16", "p_nickname": "Sóc Nâu", "p_coat": "nau-cam"}]


def test_leave_and_update(api):
    client, calls = api(member={"opted_out_at": None}, refresh={"member": None, "lastWeek": None})
    with client:
        assert client.post("/api/v1/league/leave").status_code == 200
        assert client.patch("/api/v1/league/me", json={}).status_code == 422
        assert client.patch("/api/v1/league/me", json={"coat": "xam-khoi"}).status_code == 200
    assert rpc_calls(calls, "league_leave") == [{"p_user_id": USER_ID, "p_week": "2026-11-16"}]
    assert rpc_calls(calls, "league_update") == [
        {"p_user_id": USER_ID, "p_week": "2026-11-16", "p_nickname": None, "p_coat": "xam-khoi"}]


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
