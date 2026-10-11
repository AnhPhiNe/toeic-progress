"""An AI grant is tied to a verified Auth user ID, never editable user metadata."""

from dataclasses import dataclass


@dataclass(frozen=True)
class AIAccess:
    status: str
    limit: int | None
    guest: bool = False

    @property
    def enabled(self) -> bool:
        return self.status == "active"

    @property
    def unlimited(self) -> bool:
        return self.enabled and self.limit is None

    @property
    def message(self) -> str:
        return {
            "login_required": "Đăng nhập Google để đăng ký dùng AI. Tài khoản cần được duyệt trước khi phân tích.",
            "pending": "Tài khoản đang chờ được duyệt sử dụng AI. Bạn vẫn có thể nhập và lưu thủ công.",
            "blocked": "Quyền sử dụng AI của tài khoản đang bị tạm khóa. Bạn vẫn có thể nhập và lưu thủ công.",
            "active": "",
        }[self.status]

    def usage_fields(self) -> dict:
        return {"enabled": self.enabled, "accessStatus": self.status, "accessMessage": self.message,
                "unlimited": self.unlimited}
