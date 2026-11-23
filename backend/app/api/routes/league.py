from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field

from app.api.dependencies import account
from app.services import league, rank

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


async def _active_member(gateway, user_id: str) -> bool:
    rows = await _select(gateway, "league_members", {"select": "opted_out_at", "user_id": "eq." + user_id, "limit": "1"})
    return bool(rows) and rows[0].get("opted_out_at") is None


async def league_state(request: Request, user_id: str) -> dict:
    """One database call (S-20): seat, stars counted from the synced rows, group table and last week."""
    result = await request.app.state.gateway.rpc("league_state", {"p_user_id": user_id})
    if not isinstance(result, dict):
        raise HTTPException(503, "Chưa tải được giải đấu. Vui lòng thử lại.")
    return league.build_state(result, now=now_utc())


async def rank_state(request: Request, user_id: str) -> dict:
    """Xếp hạng screen: league_state plus rank, season, rewards and the five boards, in one call."""
    result = await request.app.state.gateway.rpc("rank_state", {"p_user_id": user_id})
    if not isinstance(result, dict):
        raise HTTPException(503, "Chưa tải được bảng xếp hạng. Vui lòng thử lại.")
    return rank.build_state(result, now=now_utc())


async def _reply(request: Request, user_id: str, view: str) -> dict:
    return await (rank_state if view == "rank" else league_state)(request, user_id)


@router.get("/api/v1/rank")
async def get_rank(request: Request, user=Depends(account)):
    return await rank_state(request, user["id"])


@router.post("/api/v1/rank/join")
async def join_rank(body: JoinRequest, request: Request, user=Depends(account)):
    return await _join(body, request, user, "rank")


@router.post("/api/v1/rank/leave")
async def leave_rank(request: Request, user=Depends(account)):
    return await _leave(request, user, "rank")


@router.patch("/api/v1/rank/me")
async def update_rank(body: UpdateRequest, request: Request, user=Depends(account)):
    return await _update(body, request, user, "rank")


@router.get("/api/v1/league")
async def get_league(request: Request, user=Depends(account)):
    return await league_state(request, user["id"])


@router.post("/api/v1/league/join")
async def join_league(body: JoinRequest, request: Request, user=Depends(account)):
    return await _join(body, request, user, "league")


async def _join(body: JoinRequest, request: Request, user: dict, view: str) -> dict:
    try:
        nickname, coat = league.clean_nickname(body.nickname), league.clean_coat(body.coat)
    except ValueError as error:
        raise HTTPException(422, str(error)) from error
    await request.app.state.gateway.rpc("league_join", {
        "p_user_id": user["id"], "p_week": league.week_start(now_utc()).isoformat(), "p_nickname": nickname, "p_coat": coat}, data_errors=True)
    return await _reply(request, user["id"], view)


@router.post("/api/v1/league/leave")
async def leave_league(request: Request, user=Depends(account)):
    return await _leave(request, user, "league")


async def _leave(request: Request, user: dict, view: str) -> dict:
    await request.app.state.gateway.rpc("league_leave", {
        "p_user_id": user["id"], "p_week": league.week_start(now_utc()).isoformat()}, data_errors=True)
    return await _reply(request, user["id"], view)


@router.patch("/api/v1/league/me")
async def update_league(body: UpdateRequest, request: Request, user=Depends(account)):
    return await _update(body, request, user, "league")


async def _update(body: UpdateRequest, request: Request, user: dict, view: str) -> dict:
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
        "p_user_id": user["id"], "p_week": league.week_start(now_utc()).isoformat(), "p_nickname": nickname, "p_coat": coat}, data_errors=True)
    return await _reply(request, user["id"], view)
