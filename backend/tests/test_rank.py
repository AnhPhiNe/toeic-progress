"""Xếp hạng routes: one rank_state call, shaped rank/season/boards, no ids or raw scores, preview rules."""
import json
from datetime import datetime, timezone

import httpx
import pytest
from fastapi.testclient import TestClient

from app.api.routes import league as league_route
from app.core.config import Settings
from app.main import create_app
from app.services import rank

USER_ID = "11111111-1111-4111-8111-111111111111"
NOW = datetime(2026, 11, 25, 3, 0, tzinfo=timezone.utc)  # Wednesday 10:00 in Vietnam


def board(n=20, me=8, key="stars"):
    return [{"rank": k, "nickname": f"Bạn {k}", "coat": "nau", "value": 240 - k * 7 if key == "stars" else (None if k == n else 100 - k),
             "me": k == me, "award": {"tier": 3, "season": 1} if k == 1 else None} for k in range(1, n + 1)]


MEMBER_STATE = {
    "weekStart": "2026-11-23", "member": {"nickname": "Bạn 8", "coat": "nau", "tier": 3},
    "group": {"tier": 3, "size": 20, "zone": 5, "rows": []}, "lastWeek": None,
    "stars": {"total": 184, "today": 12}, "lastWeekStars": 150,
    "season": {"number": 1, "start": "2026-11-23", "end": "2027-01-17"},
    "rank": {"season": 1, "level": 9, "points": 64, "bestLevel": 9, "shieldUsedWeek": None},
    "rankWeek": {"weekStart": "2026-11-16", "stars": 150, "rank": 3, "size": 20, "base": 15, "bonus": 20, "penalty": 0,
                 "delta": 35, "shield": False, "levelBefore": 8, "pointsBefore": 90, "levelAfter": 9, "pointsAfter": 25},
    "rewards": [{"season": 0, "bestLevel": 13, "cosmetics": ["frame-bac.m0", 5], "aiBonus": 20, "aiMonth": "2026-12-01"}],
    "boards": {key: board(key=key) for key in ("stars", "listening", "reading", "minutes", "streak", "reviews")},
}


@pytest.fixture
def api(monkeypatch):
    monkeypatch.setattr(league_route, "now_utc", lambda: NOW)

    def make(*, guest=False, state=None):
        calls = []

        def respond(request):
            body = json.loads(request.content) if request.content else None
            calls.append((request.method, request.url.path, body))
            path = request.url.path
            if path == "/auth/v1/user":
                return httpx.Response(200, json={"id": USER_ID, "is_anonymous": guest})
            if path.endswith("/reserve_api_request"):
                return httpx.Response(200, json={"allowed": True})
            if path == "/rest/v1/league_members":
                return httpx.Response(200, json=[{"opted_out_at": None}])
            if path.endswith("/rank_state"):
                return httpx.Response(200, json=state or {"weekStart": "2026-11-23", "member": None, "lastWeek": None,
                                                          "season": MEMBER_STATE["season"], "rank": None, "rewards": [], "boards": None})
            if path.rsplit("/", 1)[-1] in ("league_join", "league_leave", "league_update"):
                return httpx.Response(200, content=b"")
            raise AssertionError(f"Unexpected request: {request.url}")

        settings = Settings(_env_file=None, supabase_url="https://database.example", supabase_publishable_key="public-key",
                            supabase_secret_key="server-secret", openai_api_key="openai-secret",
                            rate_limit_secret="rate-secret", turnstile_secret_key="captcha-secret", api_limits_enabled=True)
        client = TestClient(create_app(settings, httpx.MockTransport(respond)))
        client.headers["Authorization"] = "Bearer user-token"
        return client, calls

    return make


def rpc(calls, name):
    return [body for _, path, body in calls if path.endswith("/" + name)]


@pytest.mark.parametrize(("level", "name", "tier"), [(0, "Đồng IV", "dong"), (9, "Vàng III", "vang"), (12, "Bạch kim IV", "bach-kim"),
                                                     (19, "Kim cương I", "kim-cuong"), (20, "Cao thủ", "cao-thu")])
def test_describe_levels(level, name, tier):
    assert rank.describe(level)["name"] == name and rank.describe(level)["tier"] == tier


@pytest.mark.parametrize(("stars", "pos", "size", "delta"), [(184, 8, 20, 18), (184, 6, 20, 38), (400, 1, 20, 45),
                                                            (0, 10, 20, -20), (15, 20, 20, -19), (0, 3, 4, -20), (50, 1, 5, 5)])
def test_week_change_mirrors_the_database_rules(stars, pos, size, delta):
    assert rank.week_change(stars, pos, size)["delta"] == delta


def test_guest_cannot_open_rank(api):
    client, calls = api(guest=True)
    with client:
        assert client.get("/api/v1/rank").status_code == 403
    assert not rpc(calls, "rank_state")


def test_non_member_gets_season_without_rank(api):
    client, calls = api()
    with client:
        state = client.get("/api/v1/rank").json()
    assert rpc(calls, "rank_state") == [{"p_user_id": USER_ID}]
    assert state["member"] is None and state["rank"] is None and state["boards"] is None
    assert state["season"] == {"number": 1, "start": "2026-11-23", "end": "2027-01-17", "daysLeft": 54}
    assert rpc(calls, "reserve_api_request")[0]["p_scope"] == "sync"


def test_member_rank_state_is_one_call_and_shaped(api):
    client, calls = api(state=MEMBER_STATE)
    with client:
        state = client.get("/api/v1/rank").json()
    assert [p for _, p, _ in calls if "/rest/v1/" in p] == ["/rest/v1/rpc/reserve_api_request", "/rest/v1/rpc/rank_state"]
    assert state["rank"]["name"] == "Vàng III" and state["rank"]["points"] == 64 and state["rank"]["toNext"] == 36
    assert state["rank"]["next"]["name"] == "Vàng II" and state["rank"]["shield"] is True
    assert state["preview"] == {"stars": 184, "base": 18, "bonus": 0, "penalty": 0, "delta": 18}
    assert state["zones"] == {"up": 6, "down": 5, "size": 20}
    assert sorted(state["boards"]) == ["listening", "minutes", "reading", "reviews", "stars", "streak"]
    assert state["boards"]["stars"][0]["award"] == {"tier": "vang", "season": 1}
    assert state["boards"]["listening"][-1]["value"] is None
    assert state["rankWeek"]["after"]["name"] == "Vàng III" and state["rankWeek"]["delta"] == 35
    assert state["rewards"][0]["cosmetics"] == ["frame-bac.m0"] and state["rewards"][0]["aiBonus"] == 20
    assert USER_ID not in json.dumps(state)


def test_rank_join_leave_update_reply_with_rank_state(api):
    client, calls = api(state=MEMBER_STATE)
    with client:
        assert client.post("/api/v1/rank/join", json={"nickname": " Sóc  Nâu "}).json()["rank"]["name"] == "Vàng III"
        assert client.post("/api/v1/rank/leave").status_code == 200
        assert client.patch("/api/v1/rank/me", json={"coat": "xam"}).status_code == 200
        assert client.post("/api/v1/rank/join", json={"nickname": "x"}).status_code == 422
    assert rpc(calls, "league_join")[0]["p_nickname"] == "Sóc Nâu"
    assert len(rpc(calls, "rank_state")) == 3 and not rpc(calls, "league_state")
