-- Pending account deletions (applies on top of 20261123000000_wave1_fixes):
-- the backend records a private row before it bans an account for deletion.
-- The row goes away with the Auth user (on delete cascade) or when the ban is
-- lifted after a failed attempt. If lifting the ban also fails, the row stays
-- and the daily maintenance job finishes the deletion (purge + delete user).
-- Idempotent: safe to run more than once.
begin;

create table if not exists private.pending_account_deletions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  requested_at timestamptz not null default now(),
  attempts integer not null default 0 check (attempts >= 0),
  last_error text check (last_error is null or char_length(last_error) <= 200),
  updated_at timestamptz not null default now()
);
revoke all on table private.pending_account_deletions from public, anon, authenticated, service_role;

-- Record (or refresh) a pending deletion just before the ban. A fresh request
-- moves requested_at forward so maintenance never races a live attempt.
create or replace function public.mark_account_deletion_pending(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_user_id is null then
    raise exception 'Invalid account deletion request';
  end if;
  insert into private.pending_account_deletions(user_id, requested_at, updated_at)
  values (p_user_id, now(), now())
  on conflict (user_id) do update set requested_at = now(), updated_at = now();
  return jsonb_build_object('pending', true);
end;
$$;

-- Forget a pending deletion once the account is usable again (ban lifted).
create or replace function public.clear_account_deletion_pending(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  removed integer;
begin
  if p_user_id is null then
    raise exception 'Invalid account deletion request';
  end if;
  delete from private.pending_account_deletions where user_id = p_user_id;
  get diagnostics removed = row_count;
  return jsonb_build_object('cleared', removed > 0);
end;
$$;

-- Pending deletions older than p_older_than_seconds, oldest first.
create or replace function public.list_pending_account_deletions(
  p_older_than_seconds integer default 600,
  p_limit integer default 50
) returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_older_than_seconds is null or p_older_than_seconds < 0
     or p_limit is null or p_limit < 1 or p_limit > 500 then
    raise exception 'Invalid pending deletion request';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('userId', due.user_id, 'requestedAt', due.requested_at, 'attempts', due.attempts)
                     order by due.requested_at, due.user_id)
      from (select p.user_id, p.requested_at, p.attempts
              from private.pending_account_deletions p
             where p.requested_at <= now() - make_interval(secs => p_older_than_seconds)
             order by p.requested_at, p.user_id
             limit p_limit) due
  ), '[]'::jsonb);
end;
$$;

-- Count one finishing attempt by maintenance and keep a short error note.
create or replace function public.note_account_deletion_attempt(p_user_id uuid, p_error text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  next_attempts integer;
begin
  if p_user_id is null then
    raise exception 'Invalid account deletion request';
  end if;
  update private.pending_account_deletions
     set attempts = attempts + 1,
         last_error = left(p_error, 200),
         updated_at = now()
   where user_id = p_user_id
  returning attempts into next_attempts;
  return jsonb_build_object('found', next_attempts is not null, 'attempts', next_attempts);
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
    and to_regclass('private.pending_account_deletions') is not null
    and to_regprocedure('public.prepare_account_deletion(uuid,text)') is not null
    and to_regprocedure('public.apply_identity_carryover(uuid,text)') is not null
    and to_regprocedure('public.reserve_batch_explain_quota(uuid,uuid,integer,integer)') is not null
    and to_regprocedure('private.carry_identity_counter(uuid,text,integer,timestamp with time zone,timestamp with time zone)') is not null
    and to_regprocedure('public.mark_account_deletion_pending(uuid)') is not null
    and to_regprocedure('public.clear_account_deletion_pending(uuid)') is not null
    and to_regprocedure('public.list_pending_account_deletions(integer,integer)') is not null
    and to_regprocedure('public.note_account_deletion_attempt(uuid,text)') is not null
    and exists (select 1 from pg_catalog.pg_attribute
                 where attrelid = to_regclass('public.ai_batches') and attname = 'explain_questions' and not attisdropped))
$$;

revoke all on function public.mark_account_deletion_pending(uuid) from public, anon, authenticated;
revoke all on function public.clear_account_deletion_pending(uuid) from public, anon, authenticated;
revoke all on function public.list_pending_account_deletions(integer, integer) from public, anon, authenticated;
revoke all on function public.note_account_deletion_attempt(uuid, text) from public, anon, authenticated;
grant execute on function public.mark_account_deletion_pending(uuid) to service_role;
grant execute on function public.clear_account_deletion_pending(uuid) to service_role;
grant execute on function public.list_pending_account_deletions(integer, integer) to service_role;
grant execute on function public.note_account_deletion_attempt(uuid, text) to service_role;

revoke all on function public.schema_ready() from public, anon, authenticated;
grant execute on function public.schema_ready() to service_role;

notify pgrst, 'reload schema';
commit;
