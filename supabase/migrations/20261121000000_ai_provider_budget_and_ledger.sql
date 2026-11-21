-- Incremental migration on top of baseline v2:
-- 1. Provider-wide and per-owner budget caps guarding EVERY real OpenAI HTTP request
--    (including explain-batch follow-ups and automatic OCR escalations).
-- 2. Metadata-only AI cost & token ledger (no prompt, question, email or image data).

-- Remove any legacy text-keyed overload from earlier staging experiments so PostgREST
-- resolves only reserve_provider_budget(uuid, integer, integer, integer).
drop function if exists public.reserve_provider_budget(text, integer, integer, integer);
drop function if exists private.reserve_provider_budget(text, integer, integer, integer);

create table if not exists public.ai_provider_budget_counters (
  bucket text primary key,
  user_id uuid references auth.users(id) on delete cascade,
  used integer not null default 0 check (used >= 0),
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);
create index if not exists ai_provider_budget_counters_expires_idx
  on public.ai_provider_budget_counters(expires_at);
create index if not exists ai_provider_budget_counters_user_idx
  on public.ai_provider_budget_counters(user_id) where user_id is not null;

create table if not exists public.ai_cost_ledger (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete set null,
  endpoint text not null check (length(endpoint) between 1 and 64),
  model text not null check (length(model) between 1 and 64),
  effort text not null default '' check (length(effort) <= 16),
  input_tokens integer not null default 0 check (input_tokens >= 0),
  cached_tokens integer not null default 0 check (cached_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  duration_ms integer not null default 0 check (duration_ms >= 0),
  status text not null check (length(status) between 1 and 32),
  created_at timestamptz not null default now()
);
create index if not exists ai_cost_ledger_created_idx
  on public.ai_cost_ledger(created_at desc);
create index if not exists ai_cost_ledger_user_created_idx
  on public.ai_cost_ledger(user_id, created_at desc) where user_id is not null;

alter table public.ai_provider_budget_counters enable row level security;
alter table public.ai_cost_ledger enable row level security;

revoke all on table public.ai_provider_budget_counters from public, anon, authenticated, service_role;
revoke all on table public.ai_cost_ledger from public, anon, authenticated, service_role;
revoke all on sequence public.ai_cost_ledger_id_seq from public, anon, authenticated, service_role;

create or replace function public.reserve_provider_budget(
  p_user_id uuid,
  p_day_limit integer,
  p_owner_limit integer,
  p_minute_limit integer
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  now_utc timestamptz := now();
  day_key text := to_char(now_utc at time zone 'UTC', 'YYYY-MM-DD');
  min_key text := to_char(date_trunc('minute', now_utc) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI');
  day_bucket text := 'provider_day:' || day_key;
  owner_bucket text := case when p_user_id is not null then 'provider_owner:' || p_user_id::text || ':' || day_key else null end;
  minute_bucket text := 'provider_minute:' || min_key;
  day_expires timestamptz := date_trunc('day', now_utc at time zone 'UTC') at time zone 'UTC' + interval '2 days';
  minute_expires timestamptz := date_trunc('minute', now_utc) + interval '5 minutes';
  day_used integer := 0;
  owner_used integer := 0;
  minute_used integer := 0;
  retry_sec integer := greatest(1, least(60, ceil(extract(epoch from (date_trunc('minute', now_utc) + interval '1 minute' - now_utc)))::integer));
begin
  if (p_day_limit is not null and p_day_limit < 1)
     or (p_owner_limit is not null and p_owner_limit < 1)
     or (p_minute_limit is not null and p_minute_limit < 1) then
    raise exception 'Invalid provider budget limits';
  end if;

  -- Serialize shared provider caps with one lightweight transaction lock.
  perform pg_advisory_xact_lock(hashtextextended('ai_provider_budget', 0));

  -- Opportunistic bounded pruning of expired minute/day counters.
  delete from public.ai_provider_budget_counters
   where bucket in (
     select bucket from public.ai_provider_budget_counters
      where expires_at < now_utc
      limit 100
   );

  if p_day_limit is not null then
    select coalesce(used, 0) into day_used
      from public.ai_provider_budget_counters
     where bucket = day_bucket and expires_at > now_utc;
    if day_used >= p_day_limit then
      return jsonb_build_object('allowed', false, 'code', 'day', 'retry_after', 3600);
    end if;
  end if;

  if owner_bucket is not null and p_owner_limit is not null then
    select coalesce(used, 0) into owner_used
      from public.ai_provider_budget_counters
     where bucket = owner_bucket and expires_at > now_utc;
    if owner_used >= p_owner_limit then
      return jsonb_build_object('allowed', false, 'code', 'owner_day', 'retry_after', 3600);
    end if;
  end if;

  if p_minute_limit is not null then
    select coalesce(used, 0) into minute_used
      from public.ai_provider_budget_counters
     where bucket = minute_bucket and expires_at > now_utc;
    if minute_used >= p_minute_limit then
      return jsonb_build_object('allowed', false, 'code', 'minute', 'retry_after', retry_sec);
    end if;
  end if;

  if p_day_limit is not null then
    insert into public.ai_provider_budget_counters(bucket, user_id, used, expires_at, updated_at)
    values (day_bucket, null, 1, day_expires, now_utc)
    on conflict (bucket) do update
      set used = case when public.ai_provider_budget_counters.expires_at > now_utc
                      then public.ai_provider_budget_counters.used + 1 else 1 end,
          expires_at = day_expires,
          updated_at = now_utc;
  end if;

  if owner_bucket is not null and p_owner_limit is not null then
    insert into public.ai_provider_budget_counters(bucket, user_id, used, expires_at, updated_at)
    values (owner_bucket, p_user_id, 1, day_expires, now_utc)
    on conflict (bucket) do update
      set used = case when public.ai_provider_budget_counters.expires_at > now_utc
                      then public.ai_provider_budget_counters.used + 1 else 1 end,
          expires_at = day_expires,
          updated_at = now_utc;
  end if;

  if p_minute_limit is not null then
    insert into public.ai_provider_budget_counters(bucket, user_id, used, expires_at, updated_at)
    values (minute_bucket, null, 1, minute_expires, now_utc)
    on conflict (bucket) do update
      set used = case when public.ai_provider_budget_counters.expires_at > now_utc
                      then public.ai_provider_budget_counters.used + 1 else 1 end,
          expires_at = minute_expires,
          updated_at = now_utc;
  end if;

  return jsonb_build_object('allowed', true);
end;
$$;

create or replace function public.record_ai_usage(
  p_user_id uuid,
  p_endpoint text,
  p_model text,
  p_effort text,
  p_input_tokens integer,
  p_cached_tokens integer,
  p_output_tokens integer,
  p_duration_ms integer,
  p_status text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_endpoint is null or length(trim(p_endpoint)) not between 1 and 64
     or p_model is null or length(trim(p_model)) not between 1 and 64
     or p_status is null or length(trim(p_status)) not between 1 and 32 then
    raise exception 'Invalid AI usage record';
  end if;

  insert into public.ai_cost_ledger(
    user_id, endpoint, model, effort, input_tokens, cached_tokens, output_tokens, duration_ms, status
  ) values (
    p_user_id,
    left(trim(p_endpoint), 64),
    left(trim(p_model), 64),
    left(coalesce(trim(p_effort), ''), 16),
    greatest(0, coalesce(p_input_tokens, 0)),
    greatest(0, coalesce(p_cached_tokens, 0)),
    greatest(0, coalesce(p_output_tokens, 0)),
    greatest(0, coalesce(p_duration_ms, 0)),
    left(trim(p_status), 32)
  );
end;
$$;

revoke all on function public.reserve_provider_budget(uuid, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.reserve_provider_budget(uuid, integer, integer, integer) to service_role;

revoke all on function public.record_ai_usage(uuid, text, text, text, integer, integer, integer, integer, text) from public, anon, authenticated;
grant execute on function public.record_ai_usage(uuid, text, text, text, integer, integer, integer, integer, text) to service_role;
