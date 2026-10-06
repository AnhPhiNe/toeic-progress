/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  readonly VITE_API_URL?: string;
  readonly VITE_TURNSTILE_SITE_KEY?: string;
  readonly VITE_ENABLE_EMAIL_OTP?: string;
  readonly VITE_OPERATOR_NAME?: string;
  readonly VITE_SUPPORT_EMAIL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
