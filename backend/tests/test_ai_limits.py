from datetime import datetime, timezone

import pytest

from app.core.config import Settings
from app.services.ai_limits import explain_limit, quota_limits

LIMITS = quota_limits(Settings(_env_file=None), False)


def rows(used, month_reset="2026-11-01T00:00:00+00:00"):
    return [{"kind": "month", "used": used.get("month", 0), "resetsAt": month_reset},
            {"kind": "day", "used": used.get("day", 0), "resetsAt": "2026-10-11T00:00:00+00:00"},
            {"kind": "minute", "used": used.get("minute", 0), "resetsAt": "2026-10-10T12:01:00+00:00"},
            {"kind": "ip", "used": used.get("ip", 0), "resetsAt": "2026-10-11T00:00:00+00:00"}]


@pytest.mark.parametrize("reset,shown", [
    ("2026-11-01T00:00:00+00:00", "07:00 ngày 01/11/2026"),
    ("2027-01-01T00:00:00Z", "07:00 ngày 01/01/2027"),
    ("2028-03-01T00:00:00+00:00", "07:00 ngày 01/03/2028"),
])
def test_monthly_reset_from_the_database_is_shown_in_vietnam_time(reset, shown):
    now = datetime(2026, 10, 10, 12, tzinfo=timezone.utc)
    detail, retry = explain_limit(LIMITS, rows({"month": 10}, reset), now)
    assert shown in detail and retry is None


def test_bucket_order_matches_reservation_and_bad_rows_do_not_invent_a_limit():
    now = datetime(2026, 10, 10, 12, 0, 15, tzinfo=timezone.utc)
    assert "trong tháng" in explain_limit(LIMITS, rows({"month": 99, "day": 99, "minute": 99, "ip": 99}), now)[0]
    detail, retry = explain_limit(LIMITS, rows({"minute": LIMITS["minute"]}), now)
    assert "/phút" in detail and retry == 46
    assert explain_limit(LIMITS, [], now) is None
    assert explain_limit(LIMITS, {}, now) is None
    assert explain_limit(LIMITS, [{"kind": "month", "used": "10", "resetsAt": None}], now) is None
    assert explain_limit(LIMITS, [{"kind": "unknown", "used": 99, "resetsAt": None}], now) is None


def test_guest_limit_and_custom_account_cap():
    now = datetime(2026, 10, 10, tzinfo=timezone.utc)
    guest = quota_limits(Settings(_env_file=None), True)
    assert "Phiên khách" in explain_limit(guest, [{"kind": "guest", "used": 3, "resetsAt": None}], now)[0]
    assert quota_limits(Settings(_env_file=None), False, 27)["month"] == 27
