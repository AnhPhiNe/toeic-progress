import hashlib
import hmac

import httpx
from fastapi import HTTPException

from app.core.config import Settings
from app.integrations.gemini import GeminiProvider
from app.integrations.openai_provider import OpenAIProvider
from app.schemas.models import MistakeDraft


class Gateway:
    def __init__(self, settings: Settings, client: httpx.AsyncClient):
        self.settings = settings
        self.client = client
        self.gemini = GeminiProvider(settings, client, self.rpc)
        self.openai = OpenAIProvider(settings, client)

    async def readiness(self) -> bool:
        if not self.settings.database_ready:
            return False
        table = "api_rate_limits" if self.settings.api_limits_enabled else "user_profiles"
        try:
            response = await self.client.get(
                f"{self.settings.supabase_url.rstrip('/')}/rest/v1/{table}",
                params={"select": "owner_id" if table == "api_rate_limits" else "user_id", "limit": "0"},
                headers=self.admin_headers(),
                timeout=3,
            )
            if not response.is_success:
                return False
            if self.settings.ai_enabled and self.settings.ai_provider == "gemini":
                response = await self.client.get(
                    f"{self.settings.supabase_url.rstrip('/')}/rest/v1/ai_provider_state",
                    params={"select": "scope", "limit": "0"}, headers=self.admin_headers(), timeout=3,
                )
                return response.is_success
            return True
        except httpx.HTTPError:
            return False

    async def authenticate(self, token: str) -> dict:
        if not self.settings.database_ready:
            raise HTTPException(503, "Backend chưa được cấu hình Supabase.")
        response = await self.client.get(
            f"{self.settings.supabase_url.rstrip('/')}/auth/v1/user",
            headers={"apikey": self.settings.supabase_publishable_key, "Authorization": f"Bearer {token}"},
        )
        if response.status_code in (401, 403):
            raise HTTPException(401, "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.")
        if not response.is_success:
            raise HTTPException(503, "Chưa kết nối được dịch vụ đăng nhập.")
        user = response.json()
        if not user.get("id") or not isinstance(user.get("is_anonymous"), bool):
            raise HTTPException(401, "Phiên đăng nhập không hợp lệ.")
        return user

    def admin_headers(self) -> dict[str, str]:
        key = self.settings.admin_key
        headers = {"apikey": key}
        # New secret keys are not JWTs. Only legacy JWT keys belong in Bearer.
        if not key.startswith("sb_secret_"):
            headers["Authorization"] = f"Bearer {key}"
        return headers

    async def rpc(self, name: str, parameters: dict):
        response = await self.client.post(
            f"{self.settings.supabase_url.rstrip('/')}/rest/v1/rpc/{name}",
            headers=self.admin_headers(),
            json=parameters,
        )
        if not response.is_success:
            raise HTTPException(503, "Chưa xử lý được dữ liệu trên máy chủ. Vui lòng thử lại.")
        return response.json() if response.content else None

    def ip_hash(self, address: str) -> str:
        return hmac.new(self.settings.rate_limit_secret.encode(), address.encode(), hashlib.sha256).hexdigest()

    async def verify_captcha(self, token: str | None):
        if not token or not self.settings.turnstile_secret_key:
            raise HTTPException(403, "Vui lòng hoàn thành xác minh để thử AI.")
        response = await self.client.post(
            "https://challenges.cloudflare.com/turnstile/v0/siteverify",
            data={
                "secret": self.settings.turnstile_secret_key,
                "response": token,
            },
        )
        value = response.json() if response.is_success else {}
        if (
            not value.get("success")
            or value.get("hostname") not in self.settings.turnstile_hostnames
            or value.get("action") != "toeic-ai"
        ):
            raise HTTPException(403, "Xác minh đã hết hạn. Vui lòng thử lại.")

    async def generate(self, text: str, user_id: str | None = None, *, source_options: list[str] | None = None,
                       source_answer: str | None = None) -> MistakeDraft:
        if self.settings.ai_provider == "openai":
            return await self.openai.generate(text, self.ip_hash(user_id) if user_id else None,
                                              source_options=source_options, source_answer=source_answer)
        return await self.gemini.generate(text, source_options=source_options, source_answer=source_answer)

    async def delete_account(self, user_id: str):
        response = await self.client.delete(
            f"{self.settings.supabase_url.rstrip('/')}/auth/v1/admin/users/{user_id}",
            headers=self.admin_headers(),
        )
        if not response.is_success:
            raise HTTPException(503, "Chưa xóa được tài khoản. Vui lòng thử lại.")
