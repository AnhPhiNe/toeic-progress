"""Giải đấu tuần: weekly stars counted by the database from the learner's synced rows.

Stars never come from the browser. public.league_state (supabase/migrations/
20261125000000_security_wave2.sql, private.league_stars) counts them from the
learner's own rows with the table below: any study day inside the league week
(offline study synced later still counts until the week is final, Monday 12:00
in Vietnam), not before joining, not in the future, only rows first synced in or
after that week, at most 3 full tests (each >= 15 minutes), 5 part practices and
5 bakery runs a day, and 60 stars a day. This module only shapes the reply and
validates nicknames; keep STARS and DAILY_CAP in step with the SQL.
"""

import math
import re
import unicodedata
from datetime import date, datetime, time, timedelta, timezone

# Asia/Ho_Chi_Minh: fixed UTC+7, no daylight saving (no tzdata needed on any host).
VN = timezone(timedelta(hours=7), "Asia/Ho_Chi_Minh")
DAILY_CAP = 60
GROUP_SIZE = 20
# Fewer than this many OTHER learners in the group: show "Bạn so với tuần trước" instead of a table.
FALLBACK_MIN_OTHERS = 5
TIERS = {1: "dong", 2: "bac", 3: "vang", 4: "bach-kim", 5: "kim-cuong", 6: "cao-thu"}
DEFAULT_COAT = "nau-cam"

# One row per real in-app action, mirrored by private.league_stars. A full test is
# the biggest single effort, a mistake card the smallest; the daily cap stops any
# one action from being farmed (e.g. 30 reviewed cards or 3 full tests fill a day).
STARS = {
    "full_test": 20,      # Full Test logged with a score, at least 15 minutes
    "part_practice": 8,   # Part practice logged (parts or at least 5 minutes)
    "bake": 6,            # Bakery / pacing run finished (at least 3 minutes)
    "vocab_day": 5,       # A day with words logged (once per day)
    "card_reviewed": 2,   # Mistake card reviewed (latest review per card)
    "card_added": 1,      # Mistake card added to Sổ tay
}


def week_start(now: datetime) -> date:
    """Monday of the league week containing `now`, in Asia/Ho_Chi_Minh."""
    local = now.astimezone(VN).date()
    return local - timedelta(days=local.weekday())


def week_start_at(monday: date) -> datetime:
    return datetime.combine(monday, time.min, VN)


def days_left(now: datetime, monday: date | None = None) -> int:
    end = week_start_at((monday or week_start(now)) + timedelta(days=7))
    return max(1, math.ceil((end - now).total_seconds() / 86400))


def zone(size: int) -> int:
    """Promotion/demotion zone for a group: mirrors private.league_zone in SQL."""
    return 0 if size < FALLBACK_MIN_OTHERS + 1 else min(5, size // 3)


NICKNAME_LETTERS = (
    "aàảãáạăằẳẵắặâầẩẫấậbcdđeèẻẽéẹêềểễếệfghiìỉĩíịjklmnoòỏõóọôồổỗốộơờởỡớợ"
    "pqrstuùủũúụưừửữứựvwxyỳỷỹýỵz"
)
NICKNAME_PATTERN = re.compile("^[0-9 " + NICKNAME_LETTERS + NICKNAME_LETTERS.upper() + "]+$")
COAT_PATTERN = re.compile(r"^[a-z0-9-]{2,24}$")
# Minimal list: whole words with tones as typed, short unaccented abbreviations, and
# a few phrases checked with spaces removed. Ordinary words like "Lớn" stay allowed.
BLOCKED_WORDS = {"địt", "đụ", "lồn", "cặc", "buồi", "đéo", "đĩ", "dm", "dmm", "đm", "đmm", "dcm", "đcm", "dkm", "vcl",
                 "vkl", "clm", "cl", "vl", "loz", "djt", "fuck", "shit", "bitch", "cunt", "dick", "sex", "porn"}
BLOCKED_JOINED = ("fuck", "shit", "bitch", "ditme", "địtmẹ", "concac", "concặc", "cailon", "càilồn", "đụmá", "dumá")


def clean_nickname(raw: str) -> str:
    """Normalise and validate a league nickname; raises ValueError with a learner-facing message."""
    name = " ".join(unicodedata.normalize("NFC", raw or "").split())
    if not 2 <= len(name) <= 20:
        raise ValueError("Biệt danh cần 2–20 ký tự.")
    if not NICKNAME_PATTERN.match(name):
        raise ValueError("Biệt danh chỉ gồm chữ cái tiếng Việt, số và dấu cách.")
    lowered = name.lower()
    joined = lowered.replace(" ", "")
    if any(word in BLOCKED_WORDS for word in lowered.split()) or any(part in joined for part in BLOCKED_JOINED):
        raise ValueError("Biệt danh này chưa phù hợp, bạn chọn tên khác nhé.")
    return name


def clean_coat(raw: str | None) -> str:
    if raw is None:
        return DEFAULT_COAT
    coat = raw.strip()
    if not COAT_PATTERN.match(coat):
        raise ValueError("Màu áo không hợp lệ.")
    return coat


def build_state(result: dict, *, now: datetime) -> dict:
    """Shape the league_state result for the app. No ids, emails, real names or TOEIC scores.

    The week is the database's (weekStart), so the app and the standings never disagree at midnight.
    """
    try:
        monday = date.fromisoformat(result["weekStart"])
    except (KeyError, TypeError, ValueError):
        monday = week_start(now)
    stars = result.get("stars") if isinstance(result.get("stars"), dict) else None
    last_week_stars = result.get("lastWeekStars")
    member = result.get("member")
    group = result.get("group") or None
    last = result.get("lastWeek") or None
    state = {
        "week": {"start": monday.isoformat(), "endsAt": week_start_at(monday + timedelta(days=7)).isoformat(),
                 "daysLeft": days_left(now, monday)},
        "dailyCap": DAILY_CAP,
        "starTable": STARS,
        "member": None,
        "mode": "none",
        "me": None,
        "group": None,
        "lastWeek": None,
    }
    if last:
        state["lastWeek"] = {"rank": last.get("rank"), "outcome": last.get("outcome"), "stars": last.get("stars"),
                             "tier": TIERS.get(last.get("tier"), "dong")}
    if not member:
        return state
    rows = (group or {}).get("rows") or []
    size = len(rows)
    mine = next((row for row in rows if row.get("me")), None)
    state["member"] = {"nickname": member["nickname"], "coat": member["coat"], "tier": TIERS.get(member["tier"], "dong")}
    state["mode"] = "table" if size - 1 >= FALLBACK_MIN_OTHERS else "fallback"
    state["me"] = {
        "stars": (stars or {}).get("total", mine["stars"] if mine else 0),
        "today": (stars or {}).get("today", 0),
        "rank": mine["rank"] if mine else None,
        "lastWeekStars": last_week_stars,
    }
    tier = (group or {}).get("tier", member["tier"])
    z = zone(size)
    state["group"] = {
        "tier": TIERS.get(tier, "dong"),
        "size": size,
        "promote": z if tier < 6 else 0,
        "demote": z if tier > 1 else 0,
        "rows": [{"rank": row["rank"], "nickname": row["nickname"], "coat": row["coat"], "stars": row["stars"],
                  "me": bool(row.get("me"))} for row in rows],
    }
    return state
