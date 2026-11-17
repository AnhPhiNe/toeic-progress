from typing import Literal
from urllib.parse import urlsplit

from pydantic import Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore", hide_input_in_errors=True)

    environment: Literal["development", "staging", "production"] = "development"
    ai_enabled: bool = True
    ai_access_managed: bool = False  # Enable after applying ai_access_grants migration.
    source_images_enabled: bool = False
    source_image_account_limit: int = Field(default=200, ge=3, le=1000)
    openai_api_key: SecretStr = Field(default=SecretStr(""), repr=False)
    openai_model: Literal["gpt-6-luna"] = "gpt-6-luna"
    openai_reasoning_effort: Literal["low", "medium", "high"] = "medium"
    openai_max_output_tokens: int = Field(default=8192, ge=2048, le=16384)
    openai_timeout_seconds: float = Field(default=45, ge=5, le=60)
    # Advice on one logged test: the facts are computed by the server, so the model only words and ranks them.
    # The output limit includes reasoning tokens; the app waits 90 s for any request.
    openai_advice_reasoning_effort: Literal["low", "medium", "high"] = "medium"
    openai_advice_max_output_tokens: int = Field(default=6144, ge=2048, le=8192)
    openai_advice_timeout_seconds: float = Field(default=60, ge=5, le=85)
    # Reading a screenshot with several questions writes several explanations in one response.
    # The app waits 90 s for any request, so a page stays below that.
    openai_page_max_output_tokens: int = Field(default=16384, ge=4096, le=32768)
    openai_page_timeout_seconds: float = Field(default=80, ge=5, le=85)
    api_limits_enabled: bool = False  # Enable after applying the runtime migration; required when deployed.
    allowed_hosts: list[str] = []
    render_external_hostname: str = ""
    ingress_ip_minute_limit: int = Field(default=120, ge=1, le=10000)
    # Behind a hosting proxy every request arrives from the proxy's address, so per-IP limits
    # would be shared by all users. Name a header the edge overwrites (e.g. cf-connecting-ip)
    # only after verifying on staging that clients cannot set it; empty uses the socket address.
    client_ip_header: str = Field(default="", max_length=64, pattern=r"^[A-Za-z0-9-]*$")
    # Temporarily exposes /debug/client-ip so the operator can verify the header above.
    client_ip_debug: bool = False
    max_concurrent_requests: int = Field(default=8, ge=1, le=128)
    body_timeout_seconds: float = Field(default=10, ge=1, le=30)
    api_account_minute_limit: int = Field(default=60, ge=1, le=10000)
    api_sync_minute_limit: int = Field(default=30, ge=1, le=1000)
    api_usage_minute_limit: int = Field(default=30, ge=1, le=1000)
    api_ai_minute_limit: int = Field(default=10, ge=1, le=100)
    api_destructive_minute_limit: int = Field(default=3, ge=1, le=20)

    supabase_url: str = ""
    supabase_publishable_key: str = ""
    supabase_secret_key: str = ""
    # Compatibility for existing deployments using a legacy JWT key.
    supabase_service_role_key: str = ""
    cors_origins: list[str] = ["http://localhost:3000", "http://127.0.0.1:3000"]
    turnstile_secret_key: str = ""
    turnstile_hostnames: list[str] = ["localhost", "127.0.0.1"]
    rate_limit_secret: str = ""
    ai_guest_limit: int = Field(default=3, ge=0, le=100)
    ai_account_monthly_limit: int = Field(default=10, ge=0, le=1000)
    ai_global_daily_limit: int = Field(default=20, ge=0, le=10000)
    ai_global_minute_limit: int = Field(default=2, ge=0, le=100)
    ai_ip_daily_limit: int = Field(default=5, ge=0, le=1000)
    ai_unlimited_emails: list[str] = Field(default_factory=list, max_length=100, repr=False)

    @field_validator("ai_unlimited_emails")
    @classmethod
    def clean_unlimited_emails(cls, emails: list[str]) -> list[str]:
        import re

        values = [email.strip().lower() for email in emails]
        if any(not re.fullmatch(r"[a-z0-9][a-z0-9._+\-]*@gmail\.com", email) for email in values):
            raise ValueError("AI_UNLIMITED_EMAILS must contain Gmail addresses")
        return list(dict.fromkeys(values))

    def unlimited_ai_for(self, user: dict) -> bool:
        """Only provider-verified Google identities from Supabase Auth can qualify."""
        email = user.get("email")
        if user.get("is_anonymous") is not False or not user.get("email_confirmed_at") or not isinstance(email, str):
            return False
        email = email.strip().lower()
        if email not in self.ai_unlimited_emails:
            return False
        identities = user.get("identities")
        if not isinstance(identities, list):
            return False
        for identity in identities:
            if not isinstance(identity, dict) or identity.get("provider") != "google":
                continue
            data = identity.get("identity_data")
            identity_email = data.get("email") if isinstance(data, dict) else None
            if (
                isinstance(data, dict) and data.get("email_verified") is True
                and isinstance(identity_email, str) and identity_email.lower() == email
            ):
                return True
        return False

    @property
    def ai_provider(self) -> Literal["openai"]:
        return "openai"

    @property
    def admin_key(self) -> str:
        return self.supabase_secret_key or self.supabase_service_role_key

    @property
    def database_ready(self) -> bool:
        return bool(self.supabase_url and self.supabase_publishable_key and self.admin_key)

    @property
    def ai_ready(self) -> bool:
        return (
            self.ai_enabled
            and self.database_ready
            and bool(self.rate_limit_secret)
            and bool(self.openai_api_key.get_secret_value().strip())
        )

    @property
    def attempt_analysis_ready(self) -> bool:
        # Same provider, key and consent as every other AI feature.
        return self.ai_ready

    @property
    def effective_allowed_hosts(self) -> list[str]:
        if self.allowed_hosts:
            return self.allowed_hosts
        if self.render_external_hostname:
            return [self.render_external_hostname]
        return ["localhost", "127.0.0.1", "testserver"] if self.environment == "development" else []

    def validate_deployment(self) -> None:
        """Fail closed on unsafe deployed settings, without echoing secret values."""
        if self.environment == "development":
            return
        missing = []
        if not self.database_ready:
            missing.append("SUPABASE_URL/PUBLISHABLE_KEY/SECRET_KEY")
        if self.supabase_url and urlsplit(self.supabase_url).scheme != "https":
            missing.append("SUPABASE_URL (HTTPS)")
        if not self.api_limits_enabled:
            missing.append("API_LIMITS_ENABLED=true")
        if len(self.rate_limit_secret) < 32:
            missing.append("RATE_LIMIT_SECRET (at least 32 characters)")
        if not self.effective_allowed_hosts or any(
            not host or "*" in host or "/" in host or ":" in host or host in ("localhost", "127.0.0.1", "testserver")
            for host in self.effective_allowed_hosts
        ):
            missing.append("ALLOWED_HOSTS (exact public API hostnames)")
        for origin in self.cors_origins:
            parsed = urlsplit(origin)
            if (
                parsed.scheme != "https"
                or not parsed.hostname
                or parsed.hostname in ("localhost", "127.0.0.1")
                or "*" in origin
                or parsed.username
                or parsed.password
                or parsed.path != ""
                or parsed.query
                or parsed.fragment
            ):
                missing.append("CORS_ORIGINS (exact HTTPS frontend origins)")
                break
        if not self.cors_origins:
            missing.append("CORS_ORIGINS")
        if self.ai_enabled and (
            not self.ai_ready
            or not self.turnstile_secret_key
            or not self.turnstile_hostnames
            or any(
                not host or "*" in host or "/" in host or ":" in host or host in ("localhost", "127.0.0.1")
                for host in self.turnstile_hostnames
            )
        ):
            missing.append("AI provider key/TURNSTILE_SECRET_KEY/TURNSTILE_HOSTNAMES or AI_ENABLED=false")
        if missing:
            raise ValueError("Deployment configuration incomplete: " + "; ".join(missing))
