import hashlib
import hmac
import json
import logging
import re
from datetime import datetime, timezone
from uuid import UUID

import httpx
from fastapi import HTTPException

from app.core.config import Settings
from app.core.image_input import MAX_IMAGE_BYTES, MAX_PAGE_IMAGE_BYTES, normalize_upright_images
from app.integrations.openai_provider import OpenAIProvider, read_results
from app.integrations.source_images import SourceImages
from app.schemas.models import MistakeDraft
from app.services.ai_access import AIAccess
from app.services.ai_limits import explain_limit, quota_limits

logger = logging.getLogger("toeic.runtime")

_BEARER_TOKEN_RE = re.compile(r"^[A-Za-z0-9._-]+$")
_MAX_BEARER_TOKEN_LENGTH = 8192


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
        if not token or len(token) > _MAX_BEARER_TOKEN_LENGTH or not _BEARER_TOKEN_RE.fullmatch(token):
            raise HTTPException(401, "Phiên đăng nhập không hợp lệ.")
        response = await self.client.get(
            f"{self.settings.supabase_url.rstrip('/')}/auth/v1/user",
            headers={"apikey": self.settings.supabase_publishable_key, "Authorization": f"Bearer {token}"},
            timeout=6,
        )
        if response.status_code in (401, 403):
            raise HTTPException(401, "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.")
        if not response.is_success:
            raise HTTPException(503, "Chưa kết nối được dịch vụ đăng nhập.")
        user = response.json()
        raw_id = user.get("id")
        if not isinstance(raw_id, str) or not isinstance(user.get("is_anonymous"), bool):
            raise HTTPException(401, "Phiên đăng nhập không hợp lệ.")
        try:
            user["id"] = str(UUID(raw_id))
        except ValueError as error:
            raise HTTPException(401, "Phiên đăng nhập không hợp lệ.") from error
        return user

    def admin_headers(self) -> dict[str, str]:
        key = self.settings.admin_key
        headers = {"apikey": key}
        # New secret keys are not JWTs. Only legacy JWT keys belong in Bearer.
        if not key.startswith("sb_secret_"):
            headers["Authorization"] = f"Bearer {key}"
        return headers

    async def rpc(self, name: str, parameters: dict, *, timeout: float = 12):
        response = await self.client.post(
            f"{self.settings.supabase_url.rstrip('/')}/rest/v1/rpc/{name}",
            headers=self.admin_headers(),
            json=parameters,
            timeout=timeout,
        )
        if not response.is_success:
            raise HTTPException(503, "Chưa xử lý được dữ liệu trên máy chủ. Vui lòng thử lại.")
        return response.json() if response.content else None

    def ip_hash(self, address: str) -> str:
        return hmac.new(self.settings.rate_limit_secret.encode(), address.encode(), hashlib.sha256).hexdigest()

    def identity_hash(self, user: dict) -> str | None:
        """Keyed one-way HMAC of a permanent account's canonical email for anti-abuse carryover (no raw PII stored)."""
        if user.get("is_anonymous") is not False or not self.settings.rate_limit_secret:
            return None
        email = user.get("email")
        if not isinstance(email, str) or "@" not in email:
            return None
        local, _, domain = email.strip().lower().partition("@")
        if not local or not domain:
            return None
        if domain in ("gmail.com", "googlemail.com"):
            local = local.split("+", 1)[0].replace(".", "")
            domain = "gmail.com"
        return hmac.new(
            self.settings.rate_limit_secret.encode(),
            f"identity:v1:{local}@{domain}".encode(),
            hashlib.sha256,
        ).hexdigest()

    async def ai_access(self, user: dict) -> AIAccess:
        guest = user["is_anonymous"]
        if not self.settings.ai_access_managed:
            unlimited = self.settings.unlimited_ai_for(user)
            limit = None if unlimited else (
                self.settings.ai_guest_limit if guest else self.settings.ai_account_monthly_limit
            )
            return AIAccess("active", limit, guest, "admin" if unlimited else "free")
        if guest:
            return AIAccess("login_required", 0, True, "free")
        try:
            id_hash = self.identity_hash(user)
            if id_hash:
                carry = await self.client.post(
                    f"{self.settings.supabase_url.rstrip('/')}/rest/v1/rpc/apply_identity_carryover",
                    headers=self.admin_headers(), timeout=5,
                    json={"p_user_id": user["id"], "p_identity_hash": id_hash},
                )
                if not carry.is_success:
                    raise ValueError("Identity carryover unavailable")
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
                return AIAccess(status, None, False, plan)
            default = self.settings.ai_plus_monthly_limit if plan == "plus" else self.settings.ai_account_monthly_limit
            return AIAccess(status, limit if limit is not None else default, False, plan)
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
            timeout=6,
        )
        value = response.json() if response.is_success else {}
        if (
            not value.get("success")
            or value.get("hostname") not in self.settings.turnstile_hostnames
            or value.get("action") != "toeic-ai"
        ):
            raise HTTPException(403, "Xác minh đã hết hạn. Vui lòng thử lại.")

    async def reserve_provider_budget(self, owner_id: str | None, *, cost: int = 1, plan: str | None = None) -> None:
        """Guard every outbound OpenAI HTTP request with cost-weighted provider caps."""
        if not self.settings.ai_provider_budget_enabled or not self.settings.database_ready:
            return
        owner_limit = (
            self.settings.ai_provider_owner_day_limit_free
            if plan == "free"
            else self.settings.ai_provider_owner_day_limit
        )
        result = await self.rpc(
            "reserve_provider_budget",
            {
                "p_user_id": owner_id,
                "p_day_limit": self.settings.ai_provider_day_limit,
                "p_owner_limit": owner_limit,
                "p_minute_limit": self.settings.ai_provider_minute_limit,
                "p_cost": max(1, min(100, int(cost))),
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
                       endpoint: str = "extract", plan: str | None = None) -> MistakeDraft:
        upright_images = await normalize_upright_images(images, MAX_IMAGE_BYTES) if images else images
        return await self.openai.generate(text, self.ip_hash(user_id) if user_id else None,
                                          source_options=source_options, source_answer=source_answer, images=upright_images,
                                          persistent_images=persistent_images, pin_question=pin_question,
                                          endpoint=endpoint, owner_id=user_id, plan=plan)

    async def generate_page(self, questions: list[dict], images: list[str], user_id: str | None = None,
                            context_images: list[str] | None = None, slices: list[tuple[int, int]] | None = None,
                            *, photo_mode: bool = False, plan: str | None = None):
        upright_images = await normalize_upright_images(images, MAX_PAGE_IMAGE_BYTES)
        upright_context = await normalize_upright_images(context_images or [], MAX_PAGE_IMAGE_BYTES)
        return await self.openai.generate_page(questions, upright_images, self.ip_hash(user_id) if user_id else None,
                                               upright_context, slices or [],
                                               photo_mode=photo_mode, owner_id=user_id, plan=plan)

    async def read_results(self, images: list[str], user_id: str | None = None, *, photo_mode: bool = False,
                           plan: str | None = None):
        upright_images = await normalize_upright_images(images, MAX_PAGE_IMAGE_BYTES)
        return await read_results(self.openai, upright_images, self.ip_hash(user_id) if user_id else None,
                                  photo_mode=photo_mode, owner_id=user_id, plan=plan)

    async def _set_ban(self, user_id: str, duration: str):
        return await self.client.put(
            f"{self.settings.supabase_url.rstrip('/')}/auth/v1/admin/users/{user_id}",
            headers=self.admin_headers(),
            json={"ban_duration": duration},
            timeout=8,
        )

    async def delete_account(self, user: dict | str):
        user_id = user["id"] if isinstance(user, dict) else user
        id_hash = self.identity_hash(user) if isinstance(user, dict) else None
        # 1. Persist the one-way hashed anti-abuse carryover first (blocked status, quota/rate
        #    counters, promo history). The RPC is idempotent per account, so a retry after a
        #    later failure never counts the same usage twice. Nothing is banned or purged yet.
        if id_hash:
            await self.rpc(
                "prepare_account_deletion",
                {"p_user_id": user_id, "p_identity_hash": id_hash},
                timeout=8,
            )
        # 2. Ban on Auth to halt concurrent uploads/sessions on other tabs before purging storage.
        try:
            ban = await self._set_ban(user_id, "876000h")
        except httpx.HTTPError:
            ban = None
        if ban is None or not ban.is_success:
            raise HTTPException(503, "Chưa khóa được phiên trước khi xóa tài khoản. Vui lòng thử lại.")
        # 3. Purge private source images, then 4. permanently delete the Auth user (cascades learning rows).
        #    If either fails, lift the ban so the user can sign in again and retry.
        step = "purge"
        try:
            await self.source_images.purge(user_id, allow_missing=True)
            step = "delete"
            response = await self.client.delete(
                f"{self.settings.supabase_url.rstrip('/')}/auth/v1/admin/users/{user_id}",
                headers=self.admin_headers(),
                timeout=15,
            )
            if not response.is_success:
                raise HTTPException(503, "Chưa xóa được tài khoản. Vui lòng thử lại.")
        except (HTTPException, httpx.HTTPError, ValueError, TypeError, KeyError) as error:
            unbanned = False
            try:
                unbanned = (await self._set_ban(user_id, "none")).is_success
            except httpx.HTTPError:
                pass
            logger.warning(json.dumps({"event": "account_delete_failed", "step": step, "unbanned": unbanned,
                                       "status": getattr(error, "status_code", None)}))
            raise HTTPException(503, "Chưa xóa xong tài khoản. Bạn thử lại sau ít phút nhé.") from error
