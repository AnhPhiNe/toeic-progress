"""Giải đấu tuần: weekly stars computed on the server from the learner's synced rows.

Stars never come from the browser. The backend reads the learner's own study rows
(service role), applies the star table below with a 60-a-day cap, and hands the
weekly total to the league RPCs, which rank groups and roll weeks over lazily.
"""

import math
import re
import unicodedata
from collections import defaultdict
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone

# Asia/Ho_Chi_Minh: fixed UTC+7, no daylight saving (no tzdata needed on any host).
VN = timezone(timedelta(hours=7), "Asia/Ho_Chi_Minh")
DAILY_CAP = 60
GROUP_SIZE = 20
# Fewer than this many OTHER learners in the group: show "Bạn so với tuần trước" instead of a table.
FALLBACK_MIN_OTHERS = 5
# Sync accepts device clocks up to 5 minutes ahead; the league uses the same tolerance.
CLOCK_SKEW = timedelta(minutes=5)
TIERS = {1: "dong", 2: "bac", 3: "vang", 4: "kim-cuong"}
DEFAULT_COAT = "nau-cam"

# One row per real in-app action. Values sit on the same footing: a full test is the
# biggest single effort, a mistake card is the smallest. The daily cap stops any one
# action from being farmed (e.g. 30 reviewed cards or 3 full tests fill a day).
STARS = {
    "full_test": 20,      # Full Test logged with a score
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


def days_left(now: datetime) -> int:
    end = week_start_at(week_start(now) + timedelta(days=7))
    return max(1, math.ceil((end - now).total_seconds() / 86400))


def _instant(value) -> datetime | None:
    if not isinstance(value, str) or not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed if parsed.tzinfo else None


def _day(value) -> date | None:
    try:
        return date.fromisoformat(value) if isinstance(value, str) else None
    except ValueError:
        return None


@dataclass(frozen=True)
class Event:
    kind: str
    day: date
    stamp: datetime


def events(facts: dict) -> list[Event]:
    """Turn synced rows into star events. Rows that are not real, finished actions give nothing."""
    out: list[Event] = []
    for row in facts.get("sessions", []):
        day, stamp = _day(row.get("study_date")), _instant(row.get("created_at"))
        if not day or not stamp:
            continue
        if row.get("session_type") == "FULL_TEST":
            if row.get("total_score") is not None or row.get("part1_correct") is not None:
                out.append(Event("full_test", day, stamp))
        elif row.get("session_type") == "PART_PRACTICE":
            if row.get("has_practice_parts") or float(row.get("duration_minutes") or 0) >= 5:
                out.append(Event("part_practice", day, stamp))
    for row in facts.get("pacing", []):
        day, stamp = _day(row.get("study_date")), _instant(row.get("created_at"))
        if day and stamp and row.get("finished_naturally") and float(row.get("actual_minutes") or 0) >= 3:
            out.append(Event("bake", day, stamp))
    for row in facts.get("mistakes", []):
        for field, kind in (("created_at", "card_added"), ("last_reviewed_at", "card_reviewed")):
            stamp = _instant(row.get(field))
            if stamp:
                out.append(Event(kind, stamp.astimezone(VN).date(), stamp))
    seen_vocab: set[date] = set()
    for row in facts.get("vocab", []):
        day, stamp = _day(row.get("study_date")), _instant(row.get("updated_at"))
        if day and stamp and day not in seen_vocab:
            seen_vocab.add(day)
            out.append(Event("vocab_day", day, stamp))
    return out


def weekly_stars(facts: dict, monday: date, now: datetime) -> dict:
    """Stars for the week starting `monday`, capped per day.

    An event counts only when its day falls in that week and not after today, and its
    timestamp lies between the week's start and now (plus the sync clock tolerance).
    Future-dated rows and rows back-dated into an earlier week are ignored.
    """
    start = week_start_at(monday)
    today = now.astimezone(VN).date()
    last_day = min(monday + timedelta(days=6), today)
    daily: dict[date, int] = defaultdict(int)
    for event in events(facts):
        if not (monday <= event.day <= last_day and start <= event.stamp <= now + CLOCK_SKEW):
            continue
        daily[event.day] += STARS[event.kind]
    capped = {day: min(DAILY_CAP, total) for day, total in daily.items()}
    return {"total": sum(capped.values()), "today": capped.get(today, 0), "daily": capped}


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
    coat = raw or DEFAULT_COAT
    if not COAT_PATTERN.match(coat):
        raise ValueError("Màu áo không hợp lệ.")
    return coat


def build_state(result: dict, *, now: datetime, stars: dict | None, last_week_stars: int | None) -> dict:
    """Shape the RPC result for the app. No ids, emails, real names or TOEIC scores."""
    monday = week_start(now)
    member = result.get("member")
    group = result.get("group") or None
    last = result.get("lastWeek") or None
    state = {
        "week": {"start": monday.isoformat(), "endsAt": week_start_at(monday + timedelta(days=7)).isoformat(),
                 "daysLeft": days_left(now)},
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
        "promote": z if tier < 4 else 0,
        "demote": z if tier > 1 else 0,
        "rows": [{"rank": row["rank"], "nickname": row["nickname"], "coat": row["coat"], "stars": row["stars"],
                  "me": bool(row.get("me"))} for row in rows],
    }
    return state
