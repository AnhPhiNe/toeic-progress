import hashlib
from typing import Literal
from urllib.parse import urlsplit

from pydantic import BaseModel, ConfigDict, Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class GeminiProject(BaseModel):
    model_config = ConfigDict(extra="forbid", hide_input_in_errors=True)
    project_id: str = Field(pattern=r"^[a-z0-9][a-z0-9-]{2,62}$")
    api_keys: list[SecretStr] = Field(min_length=1, max_length=16, repr=False)
    rpm_limit: int = Field(default=5, ge=1, le=10000)
    tpm_limit: int = Field(default=250000, ge=1, le=10000000)
    rpd_limit: int = Field(default=20, ge=1, le=100000)

    @field_validator("api_keys")
    @classmethod
    def check_keys(cls, keys: list[SecretStr]) -> list[SecretStr]:
        if any(not key.get_secret_value().strip() for key in keys):
            raise ValueError("Project keys must not be empty")
        return [SecretStr(key.get_secret_value().strip()) for key in keys]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore", hide_input_in_errors=True)

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
    gemini_api_key: str = Field(default="", repr=False)
    # Simple mode: the operator guarantees these keys have independent project
    # quotas (one key per account/project). Shared-project keys use gemini_projects.
    gemini_api_keys: list[SecretStr] = Field(default_factory=list, max_length=8, repr=False)
    gemini_projects: list[GeminiProject] = Field(default_factory=list, max_length=8, repr=False)
    gemini_model: str = Field(default="gemini-3.8-flash", pattern=r"^gemini-[a-zA-Z0-9.-]+$")
    gemini_fallback_models: list[str] = ["gemini-3.7-flash", "gemini-3.6-flash", "gemini-3.5-flash"]
    gemini_rpm_limit: int = Field(default=5, ge=1, le=10000)
    gemini_tpm_limit: int = Field(default=250000, ge=1, le=10000000)
    gemini_rpd_limit: int = Field(default=20, ge=1, le=100000)
    gemini_max_concurrent: int = Field(default=2, ge=1, le=16)
    gemini_key_max_concurrent: int = Field(default=1, ge=1, le=8)
    gemini_max_attempts: int = Field(default=8, ge=1, le=16)
    gemini_attempt_timeout_seconds: float = Field(default=30, ge=1, le=30)
    gemini_total_timeout_seconds: float = Field(default=60, ge=5, le=60)
    gemini_rpm_cooldown_seconds: int = Field(default=60, ge=60, le=3600)
    gemini_rpd_cooldown_seconds: int = Field(default=86400, ge=86400, le=604800)
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

    @field_validator("gemini_api_keys")
    @classmethod
    def clean_gemini_keys(cls, keys: list[SecretStr]) -> list[SecretStr]:
        values = [key.get_secret_value().strip() for key in keys]
        if any(not value for value in values) or len(set(values)) != len(values):
            raise ValueError("GEMINI_API_KEYS must contain distinct non-empty keys")
        return [SecretStr(value) for value in values]

    @field_validator("gemini_fallback_models")
    @classmethod
    def check_gemini_models(cls, models: list[str]) -> list[str]:
        import re

        if len(models) > 7 or len(set(models)) != len(models) or any(
            not re.fullmatch(r"gemini-[a-zA-Z0-9.-]+", model) for model in models
        ):
            raise ValueError("GEMINI_FALLBACK_MODELS must contain distinct Gemini model IDs (maximum 7)")
        return models

    @property
    def effective_gemini_keys(self) -> list[str]:
        # The legacy variable remains compatible; never mix it into an explicit pool.
        return [key.get_secret_value() for key in self.gemini_api_keys] or (
            [self.gemini_api_key.strip()] if self.gemini_api_key.strip() else []
        )

    @model_validator(mode="after")
    def distinct_gemini_projects(self):
        project_ids = [project.project_id for project in self.gemini_projects]
        keys = [key.get_secret_value() for project in self.gemini_projects for key in project.api_keys]
        if len(set(project_ids)) != len(project_ids) or len(set(keys)) != len(keys):
            raise ValueError("Gemini project IDs and keys must be distinct across the configured pool")
        if self.gemini_projects and (self.gemini_api_key.strip() or self.gemini_api_keys):
            raise ValueError("Use GEMINI_PROJECTS or the legacy key variables, not both")
        return self

    @property
    def effective_gemini_projects(self) -> list[GeminiProject]:
        if self.gemini_projects:
            return self.gemini_projects
        if self.gemini_api_keys:
            # Stable, opaque group IDs keep each key's counters/cooldowns intact
            # when the list is reordered or the API worker restarts. No project
            # IDs need to be entered for the independent-account key pool.
            return [GeminiProject(
                project_id="key-" + hashlib.sha256(key.get_secret_value().encode()).hexdigest()[:48],
                api_keys=[key],
                rpm_limit=self.gemini_rpm_limit,
                tpm_limit=self.gemini_tpm_limit,
                rpd_limit=self.gemini_rpd_limit,
            ) for key in self.gemini_api_keys]
        keys = self.effective_gemini_keys
        return [GeminiProject(
            project_id="legacy-project",
            api_keys=[SecretStr(key) for key in keys],
            rpm_limit=self.gemini_rpm_limit,
            tpm_limit=self.gemini_tpm_limit,
            rpd_limit=self.gemini_rpd_limit,
        )] if keys else []

    @property
    def effective_gemini_models(self) -> list[str]:
        return list(dict.fromkeys([self.gemini_model, *self.gemini_fallback_models]))

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
            and bool(self.effective_gemini_projects and self.rate_limit_secret and self.turnstile_secret_key)
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
            missing.append("GEMINI_PROJECTS or GEMINI_API_KEY(S)/TURNSTILE_SECRET_KEY/TURNSTILE_HOSTNAMES or AI_ENABLED=false")
        if missing:
            raise ValueError("Deployment configuration incomplete: " + "; ".join(missing))
