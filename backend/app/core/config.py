from typing import Literal
from urllib.parse import urlsplit

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    environment: Literal["development", "staging", "production"] = "development"
    ai_enabled: bool = True
    api_limits_enabled: bool = False  # Enable after applying the runtime migration; required when deployed.
    allowed_hosts: list[str] = []
    render_external_hostname: str = ""
    ingress_ip_minute_limit: int = Field(default=120, ge=1, le=10000)
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
    gemini_api_key: str = ""
    gemini_model: str = "gemini-3.8-flash"
    cors_origins: list[str] = ["http://localhost:3000", "http://127.0.0.1:3000"]
    turnstile_secret_key: str = ""
    turnstile_hostnames: list[str] = ["localhost", "127.0.0.1"]
    rate_limit_secret: str = ""
    ai_guest_limit: int = Field(default=3, ge=0, le=100)
    ai_account_monthly_limit: int = Field(default=10, ge=0, le=1000)
    ai_global_daily_limit: int = Field(default=20, ge=0, le=10000)
    ai_global_minute_limit: int = Field(default=2, ge=0, le=100)
    ai_ip_daily_limit: int = Field(default=5, ge=0, le=1000)

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
            and bool(self.gemini_api_key and self.rate_limit_secret and self.turnstile_secret_key)
        )

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
            or not self.turnstile_hostnames
            or any(
                not host or "*" in host or "/" in host or ":" in host or host in ("localhost", "127.0.0.1")
                for host in self.turnstile_hostnames
            )
        ):
            missing.append("GEMINI_API_KEY/TURNSTILE_SECRET_KEY/TURNSTILE_HOSTNAMES or AI_ENABLED=false")
        if missing:
            raise ValueError("Deployment configuration incomplete: " + "; ".join(missing))
