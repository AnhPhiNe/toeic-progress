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


# Postgres errors caused by the submitted data, not by the server (S-19): the
# request is refused (4xx) instead of reported as an outage (503) and retried.
_DATA_ERROR_CODES = frozenset({"22001", "22003", "22007", "22008", "22P02", "22P05", "23502", "23514"})
_DATA_ERROR_MESSAGES = ("Invalid record", "Invalid profile", "Invalid replacement", "Invalid sync request",
                        "Missing timestamp", "Unknown entity type")


def _data_error(response: httpx.Response) -> tuple[int, str] | None:
    try:
        body = response.json()
    except ValueError:
        return None
    if not isinstance(body, dict):
        return None
    code, message = str(body.get("code") or ""), str(body.get("message") or "")
    if "Stale league week" in message:
        return 409, "Tuần giải đấu mới vừa bắt đầu. Vui lòng thử lại."
    if "Not a league member" in message:
        return 409, "Bạn chưa tham gia bảng xếp hạng."
    if "Account record limit reached" in message:
        return 409, "Tài khoản đã đạt giới hạn 10.000 bản ghi. Hãy xóa bớt dữ liệu cũ rồi đồng bộ lại."
    if code in _DATA_ERROR_CODES or (code == "P0001" and message.startswith(_DATA_ERROR_MESSAGES)):
        return 422, "Dữ liệu đồng bộ không hợp lệ. Hãy xuất bản sao lưu rồi kiểm tra bản ghi vừa sửa."
    return None


class AccountDeletionError(Exception):
    """Purge or Auth delete failed; step is "purge" or "delete"."""

    def __init__(self, step: str, status: int | None = None):
        super().__init__(f"account deletion failed at {step}")
        self.step = step
        self.status = status


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

    async def rpc(self, name: str, parameters: dict, *, timeout: float = 12, data_errors: bool = False):
        response = await self.client.post(
            f"{self.settings.supabase_url.rstrip('/')}/rest/v1/rpc/{name}",
            headers=self.admin_headers(),
            json=parameters,
            timeout=timeout,
        )
        if not response.is_success:
            if data_errors:
                refused = _data_error(response)
                if refused:
                    raise HTTPException(*refused)
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
            # Xếp hạng season reward for this month (older databases send none). Provider budget caps still apply per request.
            bonus = row.get("rankBonus", 0)
            if not isinstance(bonus, int) or isinstance(bonus, bool) or not 0 <= bonus <= 100:
                raise ValueError("Invalid AI rank bonus")
            if unlimited:
                return AIAccess(status, None, False, plan)
            default = self.settings.ai_plus_monthly_limit if plan == "plus" else self.settings.ai_account_monthly_limit
            return AIAccess(status, min(10000, (limit if limit is not None else default) + bonus), False, plan)
        except (httpx.HTTPError, ValueError, KeyError, TypeError) as error:
            raise HTTPException(503, "Chưa kiểm tra được quyền AI của tài khoản. Chưa gửi yêu cầu tới dịch vụ AI; hãy thử lại hoặc lưu thủ công.") from error

    async def explain_ai_limit(
        self, user_id: str, guest: bool, ip_hash: str, user_limit: int | None = None, *, include_account: bool = True
    ):
        """Learner-facing reason for a quota refusal, from the database's own bucket definitions."""
        try:
            response = await self.client.post(
                f"{self.settings.supabase_url.rstrip('/')}/rest/v1/rpc/ai_quota_status",
                headers=self.admin_headers(), timeout=5,
                json={"p_user_id": user_id, "p_guest": guest, "p_ip_hash": ip_hash},
            )
            if response.is_success:
                return explain_limit(
                    quota_limits(self.settings, guest, user_limit, include_account=include_account),
                    response.json(),
                    datetime.now(timezone.utc),
                )
        except (httpx.HTTPError, ValueError, TypeError):
            pass
        return None

    async def ai_batch_state(self, user_id: str, batch_id: str, max_chunks: int, ttl_seconds: int) -> tuple[bool, bool]:
        """Read-only batch check before reserving shared provider budget: returns (active_open, full)."""
        try:
            response = await self.client.post(
                f"{self.settings.supabase_url.rstrip('/')}/rest/v1/rpc/ai_batch_status",
                headers=self.admin_headers(), timeout=5,
                json={"p_user_id": user_id, "p_batch_id": batch_id, "p_max_chunks": max_chunks, "p_ttl_seconds": ttl_seconds},
            )
            if response.is_success:
                row = response.json()
                if isinstance(row, dict):
                    return bool(row.get("active")), bool(row.get("full"))
        except (httpx.HTTPError, ValueError, TypeError):
            pass
        return False, False

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
                "Sóc đang bận một chút. Đợi khoảng một phút rồi thử lại nhé, lượt AI của bạn chưa bị trừ."
                if code == "minute"
                else "Hôm nay Sóc đã dùng hết lượt AI, mai quay lại nhé. Lượt của bạn chưa bị trừ, bạn vẫn lưu tay được."
            )
            headers = {"X-Error-Code": "AI_PROVIDER_BUDGET"}
            if isinstance(retry_after, int) and retry_after > 0:
                headers["Retry-After"] = str(retry_after)
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

    async def finish_account_deletion(self, user_id: str, *, ensure_banned: bool = False) -> None:
        """Purge private source images, then permanently delete the Auth user.

        Deleting the Auth user cascades the learning rows and the pending-deletion row.
        Shared by the API and by maintenance (stuck deletions). Raises AccountDeletionError.
        """
        step = "ban" if ensure_banned else "purge"
        try:
            if ensure_banned:
                ban = await self._set_ban(user_id, "876000h")
                if not ban.is_success:
                    raise HTTPException(ban.status_code, "Chưa khóa được phiên trước khi xóa tài khoản.")
            step = "purge"
            await self.source_images.purge(user_id, allow_missing=True)
            step = "delete"
            response = await self.client.delete(
                f"{self.settings.supabase_url.rstrip('/')}/auth/v1/admin/users/{user_id}",
                headers=self.admin_headers(),
                timeout=15,
            )
            if not response.is_success:
                raise HTTPException(response.status_code, "Chưa xóa được tài khoản.")
        except (HTTPException, httpx.HTTPError, ValueError, TypeError, KeyError) as error:
            raise AccountDeletionError(step, getattr(error, "status_code", None)) from error

    async def _lift_ban_and_forget(self, user_id: str) -> tuple[bool, bool]:
        """After a failed deletion: unban, then drop the pending row. Returns (unbanned, pending_kept).

        If the unban fails the pending row stays, so maintenance finishes the deletion later
        instead of leaving the account banned forever.
        """
        try:
            unbanned = (await self._set_ban(user_id, "none")).is_success
        except httpx.HTTPError:
            unbanned = False
        if not unbanned:
            return False, True
        try:
            await self.rpc("clear_account_deletion_pending", {"p_user_id": user_id}, timeout=8)
        except (HTTPException, httpx.HTTPError, ValueError, TypeError):
            # The user asked to delete; if the row stays, maintenance finishing the job is correct.
            return True, True
        return True, False

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
        # 2. Remember the deletion before banning, so a ban that cannot be lifted later is
        #    finished by maintenance rather than leaving a banned, undeleted account.
        await self.rpc("mark_account_deletion_pending", {"p_user_id": user_id}, timeout=8)
        # 3. Ban on Auth to halt concurrent uploads/sessions on other tabs before purging storage.
        try:
            ban = await self._set_ban(user_id, "876000h")
        except httpx.HTTPError:
            ban = None  # Unknown outcome: the ban may have landed.
        if ban is None or not ban.is_success:
            if ban is None:
                unbanned, pending = await self._lift_ban_and_forget(user_id)
            else:
                unbanned, pending = False, False
                try:
                    await self.rpc("clear_account_deletion_pending", {"p_user_id": user_id}, timeout=8)
                except (HTTPException, httpx.HTTPError, ValueError, TypeError):
                    pending = True
            logger.warning(json.dumps({"event": "account_delete_failed", "step": "ban", "unbanned": unbanned,
                                       "pending": pending, "status": getattr(ban, "status_code", None)}))
            if pending:
                raise HTTPException(503, "Tài khoản đang được xóa, sẽ xong trong vòng một ngày.")
            raise HTTPException(503, "Chưa khóa được phiên trước khi xóa tài khoản. Vui lòng thử lại.")
        # 4. Purge private source images, then 5. permanently delete the Auth user (cascades
        #    learning rows and the pending row). If either fails, lift the ban so the user can retry.
        try:
            await self.finish_account_deletion(user_id)
        except AccountDeletionError as error:
            unbanned, pending = await self._lift_ban_and_forget(user_id)
            logger.warning(json.dumps({"event": "account_delete_failed", "step": error.step, "unbanned": unbanned,
                                       "pending": pending, "status": error.status}))
            if pending or not unbanned:
                raise HTTPException(503, "Tài khoản đang được xóa, sẽ xong trong vòng một ngày.") from error
            raise HTTPException(503, "Chưa xóa xong tài khoản. Bạn thử lại sau ít phút nhé.") from error
