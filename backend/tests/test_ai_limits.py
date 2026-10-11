from datetime import datetime, timezone

import pytest

from app.core.config import Settings
from app.services.ai_limits import explain_limit, limit_buckets


@pytest.mark.parametrize("now,reset", [
    ("2026-10-10T12:00:00+00:00", "07:00 ngày 01/11/2026"),
    ("2026-12-31T23:59:00+00:00", "07:00 ngày 01/01/2027"),
    ("2028-02-29T01:00:00+00:00", "07:00 ngày 01/03/2028"),
])
def test_monthly_reset_is_explicit_in_vietnam_time(now, reset):
    now = datetime.fromisoformat(now)
    buckets = limit_buckets(Settings(_env_file=None), "owner", False, "a" * 64, now)
    detail, retry = explain_limit(buckets, [{"bucket": buckets[0][0], "used": 10}], now)
    assert reset in detail and retry is None


def test_counter_priority_matches_reservation_and_missing_counts_do_not_invent_a_limit():
    now = datetime(2026, 10, 10, 12, 0, 15, tzinfo=timezone.utc)
    buckets = limit_buckets(Settings(_env_file=None), "owner", False, "a" * 64, now)
    counters = [{"bucket": row[0], "used": 99} for row in reversed(buckets)]
    assert "trong tháng" in explain_limit(buckets, counters, now)[0]
    assert explain_limit(buckets, [], now) is None
    assert explain_limit(buckets, {}, now) is None
    assert explain_limit(buckets, [{"bucket": buckets[0][0], "used": "10"}], now) is None
