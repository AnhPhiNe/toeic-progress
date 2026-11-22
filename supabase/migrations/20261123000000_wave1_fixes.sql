-- Wave 1 fixes (applies on top of 20261122000000_security_hardening_wave1):
-- 1. prepare_account_deletion becomes idempotent per deleted account. A retry
--    after a failed delete used to add the same counters again
--    (used = used + excluded.used). Each account's contribution per carryover
--    bucket is now remembered in private.account_deletion_contributions and
--    only the growth since the previous call is added.
-- 2. schema_ready() also checks the wave-1 objects.
-- Idempotent: safe to run more than once.
begin;

create table if not exists private.account_deletion_contributions (
  user_id uuid not null references auth.users(id) on delete cascade,
  bucket text not null,
  used integer not null default 0 check (used >= 0),
  expires_at timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, bucket)
);
revoke all on table private.account_deletion_contributions from public, anon, authenticated, service_role;

-- Add one account's counter value to an identity carryover bucket, counting
-- only what this account has not contributed before.
create or replace function private.carry_identity_counter(
  p_user_id uuid,
  p_bucket text,
  p_used integer,
  p_expires_at timestamptz,
  p_now timestamptz
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  previous integer := 0;
  delta integer;
begin
  if p_used is null or p_used <= 0 then
    return;
  end if;
  select used into previous
    from private.account_deletion_contributions
   where user_id = p_user_id and bucket = p_bucket and expires_at > p_now
   for update;
  previous := coalesce(previous, 0);
  delta := greatest(p_used - previous, 0);

  insert into private.account_deletion_contributions(user_id, bucket, used, expires_at, updated_at)
  values (p_user_id, p_bucket, greatest(p_used, previous), p_expires_at, p_now)
  on conflict (user_id, bucket) do update
    set used = greatest(excluded.used, case when private.account_deletion_contributions.expires_at > p_now
                                            then private.account_deletion_contributions.used else 0 end),
        expires_at = excluded.expires_at,
        updated_at = p_now;

  insert into private.identity_carryover_counters(bucket, used, expires_at, updated_at)
  values (p_bucket, p_used, p_expires_at, p_now)
  on conflict (bucket) do update
    set used = case when private.identity_carryover_counters.expires_at > p_now
                    then private.identity_carryover_counters.used + delta else p_used end,
        expires_at = excluded.expires_at,
        updated_at = p_now;
end;
$$;

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

  -- Admin AI block (idempotent by nature).
  if exists (select 1 from public.ai_access_grants where user_id = p_user_id and status = 'blocked') then
    insert into private.identity_blocks(identity_hash, blocked_at)
    values (p_identity_hash, now_utc)
    on conflict (identity_hash) do update set blocked_at = excluded.blocked_at;
  end if;

  -- Current UTC month AI usage counter.
  select used, expires_at into month_used, month_exp
    from public.ai_usage_counters
   where bucket = 'user:' || p_user_id::text || ':' || month_key
     and (expires_at is null or expires_at > now_utc);
  if found then
    perform private.carry_identity_counter(
      p_user_id,
      'id_month:' || p_identity_hash || ':' || month_key,
      month_used,
      coalesce(month_exp, (date_trunc('month', now_utc at time zone 'UTC') + interval '1 month') at time zone 'UTC'),
      now_utc);
  end if;

  -- Current UTC day provider owner budget counter.
  select used, expires_at into provider_used, provider_exp
    from public.ai_provider_budget_counters
   where bucket = 'provider_owner:' || p_user_id::text || ':' || day_key
     and expires_at > now_utc;
  if found then
    perform private.carry_identity_counter(
      p_user_id, 'id_provider_day:' || p_identity_hash || ':' || day_key, provider_used, provider_exp, now_utc);
  end if;

  -- Active redeem (hourly) and destructive (per-minute) rate limits.
  for rl in
    select bucket, window_start, used
      from public.api_rate_limits
     where user_id = p_user_id
       and ((bucket = 'redeem' and window_start >= date_trunc('hour', now_utc))
         or (bucket = 'destructive' and window_start >= date_trunc('minute', now_utc)))
  loop
    perform private.carry_identity_counter(
      p_user_id,
      'id_rl:' || p_identity_hash || ':' || rl.bucket || ':' || to_char(rl.window_start at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI'),
      rl.used,
      case when rl.bucket = 'redeem' then rl.window_start + interval '1 hour' else rl.window_start + interval '2 minutes' end,
      now_utc);
  end loop;

  -- Multi-use redeem code history (idempotent by nature).
  insert into private.identity_redeem_uses(code_id, identity_hash, redeemed_at)
  select code_id, p_identity_hash, redeemed_at
    from public.redeem_code_uses
   where user_id = p_user_id
  on conflict (code_id, identity_hash) do nothing;

  return jsonb_build_object('prepared', true, 'carried', true);
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
    and to_regclass('private.identity_carryover_counters') is not null
    and to_regclass('private.identity_redeem_uses') is not null
    and to_regclass('private.account_deletion_contributions') is not null
    and to_regprocedure('public.prepare_account_deletion(uuid,text)') is not null
    and to_regprocedure('public.apply_identity_carryover(uuid,text)') is not null
    and to_regprocedure('public.reserve_batch_explain_quota(uuid,uuid,integer,integer)') is not null
    and to_regprocedure('private.carry_identity_counter(uuid,text,integer,timestamp with time zone,timestamp with time zone)') is not null
    and exists (select 1 from pg_catalog.pg_attribute
                 where attrelid = to_regclass('public.ai_batches') and attname = 'explain_questions' and not attisdropped))
$$;

revoke all on function private.carry_identity_counter(uuid, text, integer, timestamptz, timestamptz) from public, anon, authenticated, service_role;

revoke all on function public.prepare_account_deletion(uuid, text) from public, anon, authenticated;
grant execute on function public.prepare_account_deletion(uuid, text) to service_role;

revoke all on function public.schema_ready() from public, anon, authenticated;
grant execute on function public.schema_ready() to service_role;

notify pgrst, 'reload schema';
commit;
