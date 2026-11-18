from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field

from app.api.dependencies import account
from app.services import league

router = APIRouter()


class JoinRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    nickname: str = Field(max_length=60)
    coat: str | None = Field(default=None, max_length=24)


class UpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    nickname: str | None = Field(default=None, max_length=60)
    coat: str | None = Field(default=None, max_length=24)


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


async def _select(gateway, table: str, params: dict) -> list[dict]:
    response = await gateway.client.get(
        f"{gateway.settings.supabase_url.rstrip('/')}/rest/v1/{table}", params=params,
        headers=gateway.admin_headers(), timeout=10,
    )
    rows = response.json() if response.is_success else None
    if not isinstance(rows, list):
        raise HTTPException(503, "Chưa tải được giải đấu. Vui lòng thử lại.")
    return rows


async def _facts(gateway, user_id: str, since: datetime) -> dict:
    """The learner's own rows from the start of last week; only the columns stars need."""
    owner = "eq." + user_id
    day = since.date().isoformat()
    stamp = since.isoformat()
    common = {"user_id": owner, "limit": "2000"}
    return {
        "sessions": await _select(gateway, "study_sessions", {
            **common, "select": "session_type,study_date,created_at,duration_minutes,total_score,part1_correct,has_practice_parts",
            "study_date": "gte." + day}),
        "pacing": await _select(gateway, "pacing_runs", {
            **common, "select": "study_date,created_at,actual_minutes,finished_naturally", "study_date": "gte." + day}),
        "mistakes": await _select(gateway, "mistakes", {
            **common, "select": "created_at,last_reviewed_at",
            "or": f"(created_at.gte.{stamp},last_reviewed_at.gte.{stamp})"}),
        "vocab": await _select(gateway, "vocabulary_logs", {
            **common, "select": "study_date,updated_at", "study_date": "gte." + day}),
    }


async def _active_member(gateway, user_id: str) -> bool:
    rows = await _select(gateway, "league_members", {"select": "opted_out_at", "user_id": "eq." + user_id, "limit": "1"})
    return bool(rows) and rows[0].get("opted_out_at") is None


async def league_state(request: Request, user_id: str) -> dict:
    gateway = request.app.state.gateway
    now = now_utc()
    monday = league.week_start(now)
    stars = last_week = None
    if await _active_member(gateway, user_id):
        previous = monday - timedelta(days=7)
        facts = await _facts(gateway, user_id, league.week_start_at(previous))
        stars = league.weekly_stars(facts, monday, now)
        last_week = league.weekly_stars(facts, previous, now)["total"]
    result = await gateway.rpc("league_refresh", {
        "p_user_id": user_id, "p_week": monday.isoformat(), "p_stars": stars["total"] if stars else None})
    if not isinstance(result, dict):
        raise HTTPException(503, "Chưa tải được giải đấu. Vui lòng thử lại.")
    return league.build_state(result, now=now, stars=stars, last_week_stars=last_week)


@router.get("/api/v1/league")
async def get_league(request: Request, user=Depends(account)):
    return await league_state(request, user["id"])


@router.post("/api/v1/league/join")
async def join_league(body: JoinRequest, request: Request, user=Depends(account)):
    try:
        nickname, coat = league.clean_nickname(body.nickname), league.clean_coat(body.coat)
    except ValueError as error:
        raise HTTPException(422, str(error)) from error
    await request.app.state.gateway.rpc("league_join", {
        "p_user_id": user["id"], "p_week": league.week_start(now_utc()).isoformat(), "p_nickname": nickname, "p_coat": coat})
    return await league_state(request, user["id"])


@router.post("/api/v1/league/leave")
async def leave_league(request: Request, user=Depends(account)):
    await request.app.state.gateway.rpc("league_leave", {
        "p_user_id": user["id"], "p_week": league.week_start(now_utc()).isoformat()})
    return await league_state(request, user["id"])


@router.patch("/api/v1/league/me")
async def update_league(body: UpdateRequest, request: Request, user=Depends(account)):
    try:
        nickname = league.clean_nickname(body.nickname) if body.nickname is not None else None
        coat = league.clean_coat(body.coat) if body.coat is not None else None
    except ValueError as error:
        raise HTTPException(422, str(error)) from error
    if nickname is None and coat is None:
        raise HTTPException(422, "Chưa có thay đổi.")
    gateway = request.app.state.gateway
    if not await _active_member(gateway, user["id"]):
        raise HTTPException(409, "Bạn chưa tham gia giải đấu.")
    await gateway.rpc("league_update", {
        "p_user_id": user["id"], "p_week": league.week_start(now_utc()).isoformat(), "p_nickname": nickname, "p_coat": coat})
    return await league_state(request, user["id"])
