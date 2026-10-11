"""Explain an app quota denial using only its scoped, read-only counters."""

from datetime import datetime, timedelta, timezone


def limit_buckets(settings, owner_id: str, guest: bool, ip_hash: str, now: datetime, user_limit: int | None = None):
    day_end = now.replace(hour=0, minute=0, second=0, microsecond=0) + timedelta(days=1)
    month_end = day_end.replace(day=1)
    if month_end.month == now.month:
        month_end = (month_end + timedelta(days=32)).replace(day=1)
    return [
        (f"user:{owner_id}:" + ("guest" if guest else now.strftime("%Y-%m")),
         user_limit if user_limit is not None else settings.ai_guest_limit if guest else settings.ai_account_monthly_limit,
         "guest" if guest else "month", None if guest else month_end),
        ("day:" + now.strftime("%Y-%m-%d"), settings.ai_global_daily_limit, "day", day_end),
        ("minute:" + now.strftime("%Y-%m-%d-%H-%M"), settings.ai_global_minute_limit, "minute",
         now.replace(second=0, microsecond=0) + timedelta(minutes=1)),
        (f"ip:{ip_hash}:" + now.strftime("%Y-%m-%d"), settings.ai_ip_daily_limit, "ip", day_end),
    ]


def explain_limit(buckets, counters, now: datetime):
    if not isinstance(counters, list):
        return None
    used = {row.get("bucket"): row.get("used") for row in counters if isinstance(row, dict)}
    for bucket, limit, kind, reset in buckets:
        count = used.get(bucket, 0)
        if not isinstance(count, int) or isinstance(count, bool) or count < limit:
            continue
        if kind == "guest":
            return (f"Phiên khách đã dùng hết {limit} lượt phân tích AI. "
                    "Đăng nhập Google để dùng hạn mức tài khoản, hoặc lưu thủ công.", None)
        if kind == "minute":
            seconds = max(1, int((reset - now).total_seconds()) + 1)
            return (f"Hệ thống đã chạm giới hạn {limit} lượt phân tích AI/phút. "
                    "Nội dung đang nhập vẫn được giữ.", seconds)
        subject = {"month": f"Tài khoản đã dùng hết {limit} lượt phân tích AI trong tháng.",
                   "day": f"Hệ thống đã dùng hết {limit} lượt phân tích AI trong ngày.",
                   "ip": f"Kết nối mạng này đã dùng hết {limit} lượt phân tích AI trong ngày."}[kind]
        local_reset = reset.astimezone(timezone(timedelta(hours=7)))
        return (subject + f" Lượt mới bắt đầu lúc {local_reset:%H:%M ngày %d/%m/%Y} (giờ Việt Nam). "
                "Bạn vẫn có thể lưu thủ công.", None)
    return None
