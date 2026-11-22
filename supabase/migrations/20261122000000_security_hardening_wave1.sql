-- Wave 1 pre-Stage 3 security hardening migration:
-- 1. Persistent one-way HMAC identity carryover (private schema, no raw email/PII)
--    so self-service account deletion cannot clear admin blocks, monthly/daily AI
--    quotas, redeem/destructive rate limits, or multi-use redeem code history.
-- 2. Batch-level explain ticket question cap on public.ai_batches.
-- 3. Cost-weighted public.reserve_provider_budget (removing opportunistic DELETE
--    from inside the global advisory lock).
-- 4. Maintenance cleanup for ai_cost_ledger, ai_provider_budget_counters and
--    private.identity_carryover_counters + complete public.schema_ready() checks.
begin;

-- ---------------------------------------------------------------------------
-- 1. Persistent anti-abuse identity carryover (private schema only, no PII)
-- ---------------------------------------------------------------------------

create table if not exists private.identity_blocks (
  identity_hash text primary key check (identity_hash ~ '^[a-f0-9]{64}$'),
  blocked_at timestamptz not null default now()
);

create table if not exists private.identity_carryover_counters (
  bucket text primary key,
  used integer not null default 0 check (used >= 0),
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);
create index if not exists identity_carryover_counters_expires_idx
  on private.identity_carryover_counters(expires_at);

create table if not exists private.identity_redeem_uses (
  code_id bigint not null references public.redeem_codes(id) on delete cascade,
  identity_hash text not null check (identity_hash ~ '^[a-f0-9]{64}$'),
  redeemed_at timestamptz not null default now(),
  primary key (code_id, identity_hash)
);
create index if not exists identity_redeem_uses_hash_idx
  on private.identity_redeem_uses(identity_hash);

revoke all on table private.identity_blocks from public, anon, authenticated, service_role;
revoke all on table private.identity_carryover_counters from public, anon, authenticated, service_role;
revoke all on table private.identity_redeem_uses from public, anon, authenticated, service_role;

-- Capture anti-abuse state right before auth.users deletion (ON DELETE CASCADE).
create or replace function public.prepare_account_deletion(
  p_user_id uuid,
  p_identity_hash text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  now_utc timestamptz := now();
  month_key text := to_char(now_utc at time zone 'UTC', 'YYYY-MM');
  day_key text := to_char(now_utc at time zone 'UTC', 'YYYY-MM-DD');
  month_used integer := 0;
  month_exp timestamptz;
  provider_used integer := 0;
  provider_exp timestamptz;
  rl record;
begin
  if p_user_id is null then
    raise exception 'Invalid account deletion request';
  end if;
  if p_identity_hash is null then
    return jsonb_build_object('prepared', true, 'carried', false);
  end if;
  if p_identity_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'Invalid identity hash';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('id_carry:' || p_identity_hash, 20261122));

  -- Preserve admin AI block across account delete -> re-register.
  if exists (select 1 from public.ai_access_grants where user_id = p_user_id and status = 'blocked') then
    insert into private.identity_blocks(identity_hash, blocked_at)
    values (p_identity_hash, now_utc)
    on conflict (identity_hash) do update set blocked_at = excluded.blocked_at;
  end if;

  -- Preserve current UTC month AI usage counter.
  select used, expires_at into month_used, month_exp
    from public.ai_usage_counters
   where bucket = 'user:' || p_user_id::text || ':' || month_key
     and (expires_at is null or expires_at > now_utc);
  if found and month_used > 0 then
    insert into private.identity_carryover_counters(bucket, used, expires_at, updated_at)
    values (
      'id_month:' || p_identity_hash || ':' || month_key,
      month_used,
      coalesce(month_exp, (date_trunc('month', now_utc at time zone 'UTC') + interval '1 month') at time zone 'UTC'),
      now_utc
    )
    on conflict (bucket) do update
      set used = case when private.identity_carryover_counters.expires_at > now_utc
                      then private.identity_carryover_counters.used + excluded.used else excluded.used end,
          expires_at = excluded.expires_at,
          updated_at = now_utc;
  end if;

  -- Preserve current UTC day provider owner budget counter.
  select used, expires_at into provider_used, provider_exp
    from public.ai_provider_budget_counters
   where bucket = 'provider_owner:' || p_user_id::text || ':' || day_key
     and expires_at > now_utc;
  if found and provider_used > 0 then
    insert into private.identity_carryover_counters(bucket, used, expires_at, updated_at)
    values (
      'id_provider_day:' || p_identity_hash || ':' || day_key,
      provider_used,
      provider_exp,
      now_utc
    )
    on conflict (bucket) do update
      set used = case when private.identity_carryover_counters.expires_at > now_utc
                      then private.identity_carryover_counters.used + excluded.used else excluded.used end,
          expires_at = excluded.expires_at,
          updated_at = now_utc;
  end if;

  -- Preserve active redeem (hourly) and destructive (per-minute) rate limits.
  for rl in
    select bucket, window_start, used
      from public.api_rate_limits
     where user_id = p_user_id
       and ((bucket = 'redeem' and window_start >= date_trunc('hour', now_utc))
         or (bucket = 'destructive' and window_start >= date_trunc('minute', now_utc)))
  loop
    insert into private.identity_carryover_counters(bucket, used, expires_at, updated_at)
    values (
      'id_rl:' || p_identity_hash || ':' || rl.bucket || ':' || to_char(rl.window_start at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI'),
      rl.used,
      case when rl.bucket = 'redeem' then rl.window_start + interval '1 hour' else rl.window_start + interval '2 minutes' end,
      now_utc
    )
    on conflict (bucket) do update
      set used = case when private.identity_carryover_counters.expires_at > now_utc
                      then private.identity_carryover_counters.used + excluded.used else excluded.used end,
          expires_at = excluded.expires_at,
          updated_at = now_utc;
  end loop;

  -- Preserve multi-use redeem code history so deleting an account cannot redeem the same code twice.
  insert into private.identity_redeem_uses(code_id, identity_hash, redeemed_at)
  select code_id, p_identity_hash, redeemed_at
    from public.redeem_code_uses
   where user_id = p_user_id
  on conflict (code_id, identity_hash) do nothing;

  return jsonb_build_object('prepared', true, 'carried', true);
end;
$$;

-- Restore any pending anti-abuse state into a recreated account's active rows.
-- Runs idempotently and clears moved carryover rows so an admin who later unblocks
-- the recreated account is not overridden.
create or replace function public.apply_identity_carryover(
  p_user_id uuid,
  p_identity_hash text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  now_utc timestamptz := now();
  month_key text := to_char(now_utc at time zone 'UTC', 'YYYY-MM');
  day_key text := to_char(now_utc at time zone 'UTC', 'YYYY-MM-DD');
  was_blocked boolean := false;
  month_bucket text;
  month_row record;
  provider_bucket text;
  provider_row record;
  rl_row record;
  rl_prefix text;
  rl_scope text;
  rl_window timestamptz;
begin
  if p_user_id is null or p_identity_hash is null or p_identity_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'Invalid identity carryover request';
  end if;
  if not exists (select 1 from auth.users where id = p_user_id and not is_anonymous) then
    return jsonb_build_object('applied', false);
  end if;

  perform pg_advisory_xact_lock(hashtextextended('id_carry:' || p_identity_hash, 20261122));

  -- 1. Restore admin block if pending for this identity.
  delete from private.identity_blocks where identity_hash = p_identity_hash returning true into was_blocked;
  if coalesce(was_blocked, false) then
    insert into public.ai_access_grants(user_id, status)
    values (p_user_id, 'blocked')
    on conflict (user_id) do update set status = 'blocked', updated_at = now_utc;
  end if;

  -- 2. Restore current month AI quota counter.
  month_bucket := 'id_month:' || p_identity_hash || ':' || month_key;
  delete from private.identity_carryover_counters
   where bucket = month_bucket and expires_at > now_utc
   returning used, expires_at into month_row;
  if found and month_row.used > 0 then
    insert into public.ai_usage_counters(bucket, user_id, used, expires_at)
    values ('user:' || p_user_id::text || ':' || month_key, p_user_id, month_row.used, month_row.expires_at)
    on conflict (bucket) do update
      set used = public.ai_usage_counters.used + excluded.used,
          expires_at = greatest(coalesce(public.ai_usage_counters.expires_at, excluded.expires_at), excluded.expires_at);
  end if;

  -- 3. Restore current day provider owner budget counter.
  provider_bucket := 'id_provider_day:' || p_identity_hash || ':' || day_key;
  delete from private.identity_carryover_counters
   where bucket = provider_bucket and expires_at > now_utc
   returning used, expires_at into provider_row;
  if found and provider_row.used > 0 then
    insert into public.ai_provider_budget_counters(bucket, user_id, used, expires_at, updated_at)
    values ('provider_owner:' || p_user_id::text || ':' || day_key, p_user_id, provider_row.used, provider_row.expires_at, now_utc)
    on conflict (bucket) do update
      set used = case when public.ai_provider_budget_counters.expires_at > now_utc
                      then public.ai_provider_budget_counters.used + excluded.used else excluded.used end,
          expires_at = excluded.expires_at,
          updated_at = now_utc;
  end if;

  -- 4. Restore active redeem / destructive rate-limit windows.
  rl_prefix := 'id_rl:' || p_identity_hash || ':';
  for rl_row in
    delete from private.identity_carryover_counters
     where bucket like rl_prefix || '%' and expires_at > now_utc
     returning bucket, used
  loop
    rl_scope := split_part(rl_row.bucket, ':', 3);
    if rl_scope in ('redeem', 'destructive') then
      rl_window := (to_timestamp(substring(rl_row.bucket from length(rl_prefix) + length(rl_scope) + 2), 'YYYY-MM-DD"T"HH24:MI') at time zone 'UTC');
      insert into public.api_rate_limits as r(user_id, bucket, window_start, used)
      values (p_user_id, rl_scope, rl_window, rl_row.used)
      on conflict (user_id, bucket, window_start) do update set used = r.used + excluded.used;
    end if;
  end loop;

  -- 5. Restore multi-use redeem code history into redeem_code_uses.
  insert into public.redeem_code_uses(code_id, user_id, redeemed_at)
  select code_id, p_user_id, redeemed_at
    from private.identity_redeem_uses
   where identity_hash = p_identity_hash
  on conflict (code_id, user_id) do nothing;

  return jsonb_build_object('applied', true, 'blocked', coalesce(was_blocked, false));
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Batch-level explain ticket question ceiling on public.ai_batches
-- ---------------------------------------------------------------------------

alter table public.ai_batches
  add column if not exists explain_questions integer not null default 0 check (explain_questions >= 0);

create or replace function public.reserve_batch_explain_quota(
  p_user_id uuid,
  p_batch_id uuid,
  p_count integer,
  p_max_questions integer default 16
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_used integer;
  granted integer;
begin
  if p_user_id is null or p_batch_id is null or p_count is null or p_count < 0
     or p_max_questions is null or p_max_questions not between 1 and 100 then
    raise exception 'Invalid batch explain reservation';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('ai:' || p_user_id::text, 20261120));

  select explain_questions into current_used
    from public.ai_batches
   where user_id = p_user_id and batch_id = p_batch_id
   for update;

  if not found then
    return jsonb_build_object('granted', 0, 'used', 0, 'limit', p_max_questions);
  end if;

  granted := greatest(0, least(p_count, p_max_questions - current_used));
  if granted > 0 then
    update public.ai_batches
       set explain_questions = explain_questions + granted
     where user_id = p_user_id and batch_id = p_batch_id;
  end if;

  return jsonb_build_object('granted', granted, 'used', current_used + granted, 'limit', p_max_questions);
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Cost-weighted provider budget guard (without DELETE inside global lock)
-- ---------------------------------------------------------------------------

drop function if exists public.reserve_provider_budget(uuid, integer, integer, integer);

create or replace function public.reserve_provider_budget(
  p_user_id uuid,
  p_day_limit integer,
  p_owner_limit integer,
  p_minute_limit integer,
  p_cost integer default 1
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
     or (p_minute_limit is not null and p_minute_limit < 1)
     or p_cost is null or p_cost not between 1 and 100 then
    raise exception 'Invalid provider budget limits';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('ai_provider_budget', 0));

  if p_day_limit is not null then
    select coalesce(used, 0) into day_used
      from public.ai_provider_budget_counters
     where bucket = day_bucket and expires_at > now_utc;
    if day_used + p_cost > p_day_limit then
      return jsonb_build_object('allowed', false, 'code', 'day', 'retry_after', 3600);
    end if;
  end if;

  if owner_bucket is not null and p_owner_limit is not null then
    select coalesce(used, 0) into owner_used
      from public.ai_provider_budget_counters
     where bucket = owner_bucket and expires_at > now_utc;
    if owner_used + p_cost > p_owner_limit then
      return jsonb_build_object('allowed', false, 'code', 'owner_day', 'retry_after', 3600);
    end if;
  end if;

  if p_minute_limit is not null then
    select coalesce(used, 0) into minute_used
      from public.ai_provider_budget_counters
     where bucket = minute_bucket and expires_at > now_utc;
    if minute_used + p_cost > p_minute_limit then
      return jsonb_build_object('allowed', false, 'code', 'minute', 'retry_after', retry_sec);
    end if;
  end if;

  if p_day_limit is not null then
    insert into public.ai_provider_budget_counters(bucket, user_id, used, expires_at, updated_at)
    values (day_bucket, null, p_cost, day_expires, now_utc)
    on conflict (bucket) do update
      set used = case when public.ai_provider_budget_counters.expires_at > now_utc
                      then public.ai_provider_budget_counters.used + excluded.used else excluded.used end,
          expires_at = day_expires,
          updated_at = now_utc;
  end if;

  if owner_bucket is not null and p_owner_limit is not null then
    insert into public.ai_provider_budget_counters(bucket, user_id, used, expires_at, updated_at)
    values (owner_bucket, p_user_id, p_cost, day_expires, now_utc)
    on conflict (bucket) do update
      set used = case when public.ai_provider_budget_counters.expires_at > now_utc
                      then public.ai_provider_budget_counters.used + excluded.used else excluded.used end,
          expires_at = day_expires,
          updated_at = now_utc;
  end if;

  if p_minute_limit is not null then
    insert into public.ai_provider_budget_counters(bucket, user_id, used, expires_at, updated_at)
    values (minute_bucket, null, p_cost, minute_expires, now_utc)
    on conflict (bucket) do update
      set used = case when public.ai_provider_budget_counters.expires_at > now_utc
                      then public.ai_provider_budget_counters.used + excluded.used else excluded.used end,
          expires_at = minute_expires,
          updated_at = now_utc;
  end if;

  return jsonb_build_object('allowed', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Maintenance cleanup & complete schema_ready() probe
-- ---------------------------------------------------------------------------

create or replace function public.run_maintenance(p_limit integer default 5000, p_league_weeks integer default 12)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  stamp timestamptz := clock_timestamp();
  this_monday date := (date_trunc('week', (stamp at time zone 'UTC') + interval '7 hours'))::date;
  counters integer; requests integer; batches integer; limits integer; ledger integer; weeks integer;
  provider_counters integer; cost_ledger integer; carryover integer;
begin
  if p_limit is null or p_limit not between 1 and 100000 or p_league_weeks is null or p_league_weeks not between 2 and 520 then
    raise exception 'Invalid maintenance request';
  end if;
  delete from public.ai_usage_counters where bucket in (select bucket from public.ai_usage_counters
    where expires_at < stamp - interval '1 day' order by expires_at limit p_limit);
  get diagnostics counters = row_count;
  delete from public.ai_requests where (user_id, request_id) in (select user_id, request_id from public.ai_requests
    where created_at < stamp - interval '30 days' order by created_at limit p_limit);
  get diagnostics requests = row_count;
  delete from public.ai_batches where (user_id, batch_id) in (select user_id, batch_id from public.ai_batches
    where created_at < stamp - interval '1 day' order by created_at limit p_limit);
  get diagnostics batches = row_count;
  delete from public.api_rate_limits where (user_id, bucket, window_start) in (select user_id, bucket, window_start from public.api_rate_limits
    where window_start < stamp - interval '1 day' order by window_start limit p_limit);
  get diagnostics limits = row_count;
  delete from public.ai_explanation_questions where (user_id, ticket_id, question_number) in (
    select user_id, ticket_id, question_number from public.ai_explanation_questions
    where expires_at < stamp and (lease_until is null or lease_until < stamp) order by expires_at limit p_limit for update skip locked);
  get diagnostics ledger = row_count;
  delete from public.league_weeks where week_start < this_monday - 7 * p_league_weeks;
  get diagnostics weeks = row_count;
  delete from public.ai_provider_budget_counters where bucket in (select bucket from public.ai_provider_budget_counters
    where expires_at < stamp - interval '1 day' order by expires_at limit p_limit);
  get diagnostics provider_counters = row_count;
  delete from public.ai_cost_ledger where id in (select id from public.ai_cost_ledger
    where created_at < stamp - interval '90 days' order by created_at limit p_limit);
  get diagnostics cost_ledger = row_count;
  delete from private.identity_carryover_counters where bucket in (select bucket from private.identity_carryover_counters
    where expires_at < stamp - interval '1 day' order by expires_at limit p_limit);
  get diagnostics carryover = row_count;
  return jsonb_build_object(
    'aiUsageCounters', counters,
    'aiRequests', requests,
    'aiBatches', batches,
    'apiRateLimits', limits,
    'explanationQuestions', ledger,
    'leagueWeeks', weeks,
    'providerBudgetCounters', provider_counters,
    'aiCostLedger', cost_ledger,
    'identityCarryover', carryover,
    'limit', p_limit
  );
end;
$$;

create or replace function public.schema_ready()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('baseline', 2, 'ready',
    to_regclass('public.user_profiles') is not null
    and to_regclass('public.ai_explanation_questions') is not null
    and to_regclass('public.league_standings') is not null
    and to_regclass('public.user_plans') is not null
    and to_regclass('public.ai_provider_budget_counters') is not null
    and to_regclass('public.ai_cost_ledger') is not null
    and to_regclass('private.sync_rows') is not null
    and to_regclass('private.identity_blocks') is not null
    and to_regclass('private.identity_carryover_counters') is not null)
$$;

revoke all on function public.prepare_account_deletion(uuid, text) from public, anon, authenticated;
grant execute on function public.prepare_account_deletion(uuid, text) to service_role;

revoke all on function public.apply_identity_carryover(uuid, text) from public, anon, authenticated;
grant execute on function public.apply_identity_carryover(uuid, text) to service_role;

revoke all on function public.reserve_batch_explain_quota(uuid, uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.reserve_batch_explain_quota(uuid, uuid, integer, integer) to service_role;

revoke all on function public.reserve_provider_budget(uuid, integer, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.reserve_provider_budget(uuid, integer, integer, integer, integer) to service_role;

notify pgrst, 'reload schema';
commit;
