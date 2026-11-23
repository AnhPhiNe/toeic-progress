"""Xếp hạng: rank points, divisions and seasons on top of the weekly league.

All rank math lives in the database (supabase/migrations/20261126000000_rank_seasons.sql):
private.rank_apply, private.rank_week (finalise), private.rank_roll (season end).
Rank points come only from league stars, never from self-entered TOEIC scores.
This module shapes public.rank_state for the app and previews this week's change
with the same rules (keep RULES in step with private.rank_week / rank_zones).
"""

from datetime import date, datetime

from app.services import league

TIER_KEYS = ("dong", "bac", "vang", "bach-kim", "kim-cuong", "cao-thu")
TIER_NAMES = ("Đồng", "Bạc", "Vàng", "Bạch kim", "Kim cương", "Cao thủ")
ROMAN = ("IV", "III", "II", "I")
MAX_LEVEL = 20
RULES = {
    "pointsPerDivision": 100,
    "starsPerPoint": 10,
    "maxStarPoints": 25,
    "topBonus": 20,
    "bottomPenalty": 20,
    "zeroPenalty": 20,
    "demoteLandsAt": 75,
    "seasonWeeks": 8,
}
BOARD_KEYS = ("stars", "listening", "reading", "minutes", "streak", "reviews")


def tier_index(level: int) -> int:
    """0 Đồng … 4 Kim cương, 5 Cao thủ."""
    return 5 if level >= MAX_LEVEL else max(0, level) // 4


def describe(level: int) -> dict:
    t = tier_index(level)
    division = None if t == 5 else ROMAN[level % 4]
    name = TIER_NAMES[t] + (f" {division}" if division else "")
    return {"level": level, "tier": TIER_KEYS[t], "tierName": TIER_NAMES[t], "division": division, "name": name}


def zones(size: int) -> tuple[int, int]:
    """Top bonus and bottom penalty seats: mirrors private.rank_zones."""
    return (0, 0) if size < 6 else (min(6, size // 3), min(5, size // 4))


def week_change(stars: int, rank: int | None, size: int) -> dict:
    """This week's change so far, by the finalise rules (shield not applied)."""
    up, down = zones(size)
    base = min(RULES["maxStarPoints"], max(0, stars) // RULES["starsPerPoint"])
    bonus = RULES["topBonus"] if stars > 0 and rank is not None and rank <= up else 0
    penalty = -RULES["bottomPenalty"] if stars == 0 or (rank is not None and rank > size - down) else 0
    return {"stars": stars, "base": base, "bonus": bonus, "penalty": penalty, "delta": base + bonus + penalty}


def _int(value, default: int = 0) -> int:
    return value if isinstance(value, int) and not isinstance(value, bool) else default


def _row(row: dict) -> dict:
    award = row.get("award") if isinstance(row.get("award"), dict) else None
    value = row.get("value")
    return {
        "rank": _int(row.get("rank")),
        "nickname": str(row.get("nickname") or ""),
        "coat": str(row.get("coat") or league.DEFAULT_COAT),
        "value": value if isinstance(value, int) and not isinstance(value, bool) else None,
        "me": bool(row.get("me")),
        "award": {"tier": TIER_KEYS[min(5, max(0, _int(award.get("tier"), 1) - 1))], "season": _int(award.get("season"), 1)}
        if award else None,
    }


def build_state(result: dict, *, now: datetime) -> dict:
    """league.build_state plus rank, season, rewards and the five boards. No ids, emails or TOEIC scores."""
    state = league.build_state(result, now=now)
    season = result.get("season") if isinstance(result.get("season"), dict) else {}
    try:
        start, end = date.fromisoformat(season["start"]), date.fromisoformat(season["end"])
    except (KeyError, TypeError, ValueError):
        start = end = None
    today = now.astimezone(league.VN).date()
    state["season"] = {
        "number": _int(season.get("number"), 1),
        "start": start.isoformat() if start else None,
        "end": end.isoformat() if end else None,
        "daysLeft": max(1, (end - today).days + 1) if end else None,
    }
    state["rules"] = RULES
    rank = result.get("rank") if isinstance(result.get("rank"), dict) else None
    if rank:
        level, points = min(MAX_LEVEL, max(0, _int(rank.get("level")))), max(0, _int(rank.get("points")))
        best = rank.get("bestLevel")
        top = level >= MAX_LEVEL
        state["rank"] = {
            **describe(level),
            "points": points,
            "toNext": None if top else RULES["pointsPerDivision"] - points,
            "next": None if top else describe(level + 1),
            "best": describe(best) if isinstance(best, int) and not isinstance(best, bool) else None,
            "shield": rank.get("shieldUsedWeek") is None,
            "shieldUsedWeek": rank.get("shieldUsedWeek"),
        }
    else:
        state["rank"] = None
    raw_boards = result.get("boards") if isinstance(result.get("boards"), dict) else None
    if raw_boards and state["member"]:
        state["boards"] = {key: [_row(r) for r in raw_boards.get(key) or [] if isinstance(r, dict)] for key in BOARD_KEYS}
        size = len(state["boards"]["stars"])
        mine = next((r for r in state["boards"]["stars"] if r["me"]), None)
        up, down = zones(size)
        state["zones"] = {"up": up, "down": down, "size": size}
        state["preview"] = week_change((state["me"] or {}).get("stars", 0), mine["rank"] if mine else None, size)
    else:
        state["boards"] = None
        state["zones"] = None
        state["preview"] = None
    last = result.get("rankWeek") if isinstance(result.get("rankWeek"), dict) else None
    state["rankWeek"] = None if not last else {
        "weekStart": last.get("weekStart"), "stars": _int(last.get("stars")), "rank": _int(last.get("rank")),
        "delta": _int(last.get("delta")), "shield": bool(last.get("shield")),
        "before": {**describe(_int(last.get("levelBefore"))), "points": _int(last.get("pointsBefore"))},
        "after": {**describe(_int(last.get("levelAfter"))), "points": _int(last.get("pointsAfter"))},
    }
    rewards = result.get("rewards") if isinstance(result.get("rewards"), list) else []
    state["rewards"] = [{
        "season": _int(r.get("season"), 1),
        "best": describe(min(MAX_LEVEL, max(0, _int(r.get("bestLevel"))))),
        "cosmetics": [c for c in r.get("cosmetics") or [] if isinstance(c, str)],
        "aiBonus": _int(r.get("aiBonus")),
        "aiMonth": r.get("aiMonth"),
    } for r in rewards if isinstance(r, dict)]
    return state

