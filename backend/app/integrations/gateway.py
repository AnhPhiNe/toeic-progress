import hashlib
import hmac
from datetime import datetime, timezone

import httpx
from fastapi import HTTPException

from app.core.config import Settings
from app.core.image_input import MAX_IMAGE_BYTES, MAX_PAGE_IMAGE_BYTES, normalize_upright_images
from app.integrations.openai_provider import OpenAIProvider, read_results
from app.integrations.source_images import SourceImages
from app.schemas.models import MistakeDraft
from app.services.ai_access import AIAccess
from app.services.ai_limits import explain_limit, quota_limits


class Gateway:
    def __init__(self, settings: Settings, client: httpx.AsyncClient):
        self.settings = settings
        self.client = client
        self.openai = OpenAIProvider(
            settings,
            client,
            budget_guard=self.reserve_provider_budget,
            usage_recorder=self.record_ai_usage,
        )
        self.source_images = SourceImages(self)

    async def readiness(self) -> bool:
        if not self.settings.database_ready:
            return False
        # One probe: the v2 baseline answers only when every table the API uses exists.
        try:
            response = await self.client.post(
                f"{self.settings.supabase_url.rstrip('/')}/rest/v1/rpc/schema_ready",
                json={}, headers=self.admin_headers(), timeout=3,
            )
            return response.is_success and response.json() == {"baseline": 2, "ready": True}
        except (httpx.HTTPError, ValueError, TypeError):
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

    async def ai_access(self, user: dict) -> AIAccess:
        guest = user["is_anonymous"]
        if not self.settings.ai_access_managed:
            limit = None if self.settings.unlimited_ai_for(user) else (
                self.settings.ai_guest_limit if guest else self.settings.ai_account_monthly_limit
            )
            return AIAccess("active", limit, guest)
        if guest:
            return AIAccess("login_required", 0, True)
        try:
            # Status from ai_access_grants (no row = active), plan and cap from user_plans.
            response = await self.client.post(
                f"{self.settings.supabase_url.rstrip('/')}/rest/v1/rpc/get_ai_access", headers=self.admin_headers(), timeout=5,
                json={"p_user_id": user["id"]},
            )
            if not response.is_success:
                raise ValueError("AI access unavailable")
            row = response.json()
            status, plan, limit, unlimited = row["status"], row["plan"], row["monthlyLimit"], row["unlimited"]
            if (status not in ("pending", "active", "blocked") or plan not in ("free", "plus", "admin")
                    or not isinstance(unlimited, bool) or (limit is not None and
                    (not isinstance(limit, int) or isinstance(limit, bool) or not 1 <= limit <= 10000))):
                raise ValueError("Invalid AI access grant")
            if unlimited:
                return AIAccess(status, None)
            default = self.settings.ai_plus_monthly_limit if plan == "plus" else self.settings.ai_account_monthly_limit
            return AIAccess(status, limit if limit is not None else default)
        except (httpx.HTTPError, ValueError, KeyError, TypeError) as error:
            raise HTTPException(503, "Chưa kiểm tra được quyền AI của tài khoản. Chưa gửi yêu cầu tới dịch vụ AI; hãy thử lại hoặc lưu thủ công.") from error

    async def explain_ai_limit(self, user_id: str, guest: bool, ip_hash: str, user_limit: int | None = None):
        """Learner-facing reason for a quota refusal, from the database's own bucket definitions."""
        try:
            response = await self.client.post(
                f"{self.settings.supabase_url.rstrip('/')}/rest/v1/rpc/ai_quota_status",
                headers=self.admin_headers(), timeout=5,
                json={"p_user_id": user_id, "p_guest": guest, "p_ip_hash": ip_hash},
            )
            if response.is_success:
                return explain_limit(quota_limits(self.settings, guest, user_limit), response.json(), datetime.now(timezone.utc))
        except (httpx.HTTPError, ValueError, TypeError):
            pass
        return None

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

    async def reserve_provider_budget(self, owner_id: str | None) -> None:
        """Guard every outbound OpenAI HTTP request (including explain-batch & OCR escalations)."""
        if not self.settings.ai_provider_budget_enabled or not self.settings.database_ready:
            return
        result = await self.rpc(
            "reserve_provider_budget",
            {
                "p_user_id": owner_id,
                "p_day_limit": self.settings.ai_provider_day_limit,
                "p_owner_limit": self.settings.ai_provider_owner_day_limit,
                "p_minute_limit": self.settings.ai_provider_minute_limit,
            },
        )
        if not isinstance(result, dict) or not result.get("allowed"):
            code = result.get("code") if isinstance(result, dict) else None
            retry_after = result.get("retry_after") if isinstance(result, dict) else None
            message = (
                "Hệ thống AI đang chạm giới hạn tốc độ xử lý tạm thời. Hãy đợi một chút rồi thử lại."
                if code == "minute"
                else "Tài khoản đã chạm trần lượt xử lý AI trong ngày để bảo vệ ngân sách. Bạn vẫn có thể lưu thủ công hoặc thử lại ngày mai."
                if code == "owner_day"
                else "Ngân sách AI trong ngày của ứng dụng đã chạm ngưỡng an toàn. Bạn vẫn có thể lưu thủ công."
            )
            headers = {"Retry-After": str(retry_after)} if isinstance(retry_after, int) and retry_after > 0 else None
            raise HTTPException(429, message, headers=headers)

    async def record_ai_usage(self, *, owner_id: str | None, endpoint: str, model: str, effort: str,
                              input_tokens: int, cached_tokens: int, output_tokens: int,
                              duration_ms: int, status: str) -> None:
        """Best-effort metadata-only usage ledger entry."""
        if not self.settings.ai_provider_budget_enabled or not self.settings.database_ready:
            return
        try:
            await self.client.post(
                f"{self.settings.supabase_url.rstrip('/')}/rest/v1/rpc/record_ai_usage",
                headers=self.admin_headers(),
                timeout=3,
                json={
                    "p_user_id": owner_id,
                    "p_endpoint": endpoint,
                    "p_model": model,
                    "p_effort": effort,
                    "p_input_tokens": input_tokens,
                    "p_cached_tokens": cached_tokens,
                    "p_output_tokens": output_tokens,
                    "p_duration_ms": duration_ms,
                    "p_status": status,
                },
            )
        except (httpx.HTTPError, ValueError, TypeError):
            pass

    async def generate(self, text: str, user_id: str | None = None, *, source_options: list[str] | None = None,
                       source_answer: str | None = None, images: list[str] | None = None,
                       persistent_images: bool = False, pin_question: bool = False,
                       endpoint: str = "extract") -> MistakeDraft:
        upright_images = await normalize_upright_images(images, MAX_IMAGE_BYTES) if images else images
        return await self.openai.generate(text, self.ip_hash(user_id) if user_id else None,
                                          source_options=source_options, source_answer=source_answer, images=upright_images,
                                          persistent_images=persistent_images, pin_question=pin_question,
                                          endpoint=endpoint, owner_id=user_id)

    async def generate_page(self, questions: list[dict], images: list[str], user_id: str | None = None,
                            context_images: list[str] | None = None, slices: list[tuple[int, int]] | None = None,
                            *, photo_mode: bool = False):
        upright_images = await normalize_upright_images(images, MAX_PAGE_IMAGE_BYTES)
        upright_context = await normalize_upright_images(context_images or [], MAX_PAGE_IMAGE_BYTES)
        return await self.openai.generate_page(questions, upright_images, self.ip_hash(user_id) if user_id else None,
                                               upright_context, slices or [],
                                               photo_mode=photo_mode, owner_id=user_id)

    async def read_results(self, images: list[str], user_id: str | None = None, *, photo_mode: bool = False):
        upright_images = await normalize_upright_images(images, MAX_PAGE_IMAGE_BYTES)
        return await read_results(self.openai, upright_images, self.ip_hash(user_id) if user_id else None,
                                  photo_mode=photo_mode, owner_id=user_id)

    async def delete_account(self, user_id: str):
        # Always purge any private source images even when new uploads are disabled.
        await self.source_images.purge(user_id, allow_missing=True)
        response = await self.client.delete(
            f"{self.settings.supabase_url.rstrip('/')}/auth/v1/admin/users/{user_id}",
            headers=self.admin_headers(),
        )
        if not response.is_success:
            raise HTTPException(503, "Chưa xóa được tài khoản. Vui lòng thử lại.")
