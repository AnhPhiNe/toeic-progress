"""Explain an app quota denial from the counters the database reports.

Bucket keys and reset times are defined once, in SQL (private.ai_quota_buckets);
public.ai_quota_status returns them with their counts. Only the limits come from here.
"""

from datetime import datetime, timedelta, timezone


def quota_limits(settings, guest: bool, user_limit: int | None = None) -> dict[str, int | None]:
    account = user_limit if user_limit is not None else settings.ai_guest_limit if guest else settings.ai_account_monthly_limit
    return {"guest": account, "month": account, "day": settings.ai_global_daily_limit,
            "minute": settings.ai_global_minute_limit, "ip": settings.ai_ip_daily_limit}


def _instant(value) -> datetime | None:
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00")) if isinstance(value, str) else None
    except ValueError:
        return None
    return parsed if parsed and parsed.tzinfo else None


def explain_limit(limits: dict, buckets, now: datetime):
    """The first exhausted bucket, in reservation order, as (message, retry seconds or None)."""
    if not isinstance(buckets, list):
        return None
    for row in buckets:
        if not isinstance(row, dict):
            continue
        kind, count, reset = row.get("kind"), row.get("used"), _instant(row.get("resetsAt"))
        limit = limits.get(kind)
        if limit is None or not isinstance(count, int) or isinstance(count, bool) or count < limit:
            continue
        if kind == "guest":
            return (f"Phiên khách đã dùng hết {limit} lượt phân tích AI. "
                    "Đăng nhập Google để dùng hạn mức tài khoản, hoặc lưu thủ công.", None)
        if reset is None:
            continue
        if kind == "minute":
            seconds = max(1, int((reset - now).total_seconds()) + 1)
            return (f"Hệ thống đã chạm giới hạn {limit} lượt phân tích AI/phút. "
                    "Nội dung đang nhập vẫn được giữ.", seconds)
        subject = {"month": f"Tài khoản đã dùng hết {limit} lượt phân tích AI trong tháng.",
                   "day": f"Hệ thống đã dùng hết {limit} lượt phân tích AI trong ngày.",
                   "ip": f"Kết nối mạng này đã dùng hết {limit} lượt phân tích AI trong ngày."}.get(kind)
        if subject is None:
            continue
        local_reset = reset.astimezone(timezone(timedelta(hours=7)))
        return (subject + f" Lượt mới bắt đầu lúc {local_reset:%H:%M ngày %d/%m/%Y} (giờ Việt Nam). "
                "Bạn vẫn có thể lưu thủ công.", None)
    return None
