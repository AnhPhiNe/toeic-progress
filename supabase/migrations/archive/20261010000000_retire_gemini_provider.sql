begin;

-- Run after deploying the OpenAI-only backend. These objects hold only the
-- retired provider's hashes/cooldowns/attempt metadata, not learning data or
-- account/global AI usage. Keep the applied 20261007 migration unchanged.
-- IF EXISTS also supports fresh installations that skip the retired pool.
drop function if exists public.reserve_gemini_attempt(uuid,text,jsonb,integer,integer,integer,integer,integer);
drop function if exists public.finish_gemini_attempt(uuid,text,text,integer);
drop table if exists public.ai_provider_attempts;
drop table if exists public.ai_provider_state;

commit;
