"""An AI grant is tied to a verified Auth user ID, never editable user metadata."""

from dataclasses import dataclass

from fastapi import HTTPException


@dataclass(frozen=True)
class AIAccess:
    status: str
    limit: int | None
    guest: bool = False
    plan: str = "free"

    @property
    def enabled(self) -> bool:
        return self.status == "active"

    @property
    def unlimited(self) -> bool:
        return self.enabled and self.limit is None

    @property
    def message(self) -> str:
        return {
            "login_required": "Đăng nhập Google để dùng AI. Bạn vẫn có thể nhập và lưu thủ công.",
            "pending": "Tài khoản đang chờ được duyệt sử dụng AI. Bạn vẫn có thể nhập và lưu thủ công.",
            "blocked": "Quyền sử dụng AI của tài khoản đang bị tạm khóa. Bạn vẫn có thể nhập và lưu thủ công.",
            "active": "",
        }[self.status]

    def denied(self) -> HTTPException:
        """The 403 for a request this grant does not allow; a missing sign-in carries a code the app can act on."""
        headers = {"X-Error-Code": "AI_LOGIN_REQUIRED"} if self.status == "login_required" else None
        return HTTPException(403, self.message, headers=headers)

    def usage_fields(self) -> dict:
        return {"enabled": self.enabled, "accessStatus": self.status, "accessMessage": self.message,
                "unlimited": self.unlimited}
