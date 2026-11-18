-- FastAPI verifies the user with Supabase Auth. Only its service role can call
-- these functions; no caller-supplied user ID is accepted by the HTTP API.
alter table public.sync_records drop constraint sync_records_entity_type_check;
alter table public.sync_records add constraint sync_records_entity_type_check
  check (entity_type in ('profile','sessions','mistakes','pacingRuns','checklist','vocabLog','shieldDays','weeklyPlans'));
create sequence public.sync_record_version;
alter table public.sync_records add column server_version bigint not null default nextval('public.sync_record_version');
create index sync_records_owner_version on public.sync_records(user_id, server_version);
revoke execute on function public.apply_sync_records(jsonb, boolean) from authenticated;
-- Anonymous identities can use AI, but cannot read account storage.
drop policy "Owner reads own records" on public.sync_records;
create policy "Permanent owner reads own records" on public.sync_records for select to authenticated
  using (user_id = (select auth.uid()) and coalesce((select auth.jwt()->>'is_anonymous')::boolean, false) = false);

create or replace function public.sync_account_records(
  p_owner_id uuid, p_records jsonb, p_cursor bigint default 0, p_replace boolean default false
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  item jsonb;
  stamp timestamptz;
  removed timestamptz;
  override_at timestamptz;
  latest bigint;
  response_rows jsonb;
begin
  if p_owner_id is null or p_cursor < 0 or jsonb_typeof(p_records) is distinct from 'array'
    or jsonb_array_length(p_records) > 10000 or octet_length(p_records::text) > 4194304 then
    raise exception 'Invalid sync request';
  end if;
  if not exists(select 1 from auth.users where id = p_owner_id and not is_anonymous) then
    raise exception 'Permanent account required';
  end if;
  if p_replace and not exists(select 1 from jsonb_array_elements(p_records) as supplied
    where supplied->>'entity_type'='profile' and supplied->>'record_id'='profile') then raise exception 'Invalid replacement'; end if;
  -- Serializes writes AND cursor reads for one owner. Sequence numbers cannot
  -- be skipped by a later-committing transaction for the same account.
  perform pg_advisory_xact_lock(hashtextextended(p_owner_id::text, 20261005));
  if p_replace then
    select greatest(clock_timestamp(), coalesce(max(updated_at) + interval '1 millisecond', clock_timestamp()))
      into override_at from public.sync_records where user_id = p_owner_id;
  end if;
  for item in select value from jsonb_array_elements(p_records) loop
    if jsonb_typeof(item->'payload') is distinct from 'object'
       or item->>'entity_type' not in ('profile','sessions','mistakes','pacingRuns','checklist','vocabLog','shieldDays','weeklyPlans')
       or item->>'entity_type' is null or item->>'record_id' is null
       or length(item->>'record_id') not between 1 and 200
       or octet_length((item->'payload')::text) > 32768 then raise exception 'Invalid record'; end if;
    if item->>'entity_type' = 'profile' then
      if item->>'record_id' <> 'profile' or item->>'deleted_at' is not null then raise exception 'Invalid profile'; end if;
    elsif item->'payload'->>'id' is distinct from item->>'record_id' then raise exception 'Invalid record identity'; end if;
    stamp := case when p_replace then override_at else (item->>'updated_at')::timestamptz end;
    removed := case when item->>'deleted_at' is null then null when p_replace then override_at else (item->>'deleted_at')::timestamptz end;
    if stamp is null then raise exception 'Missing timestamp'; end if;
    insert into public.sync_records as existing(user_id,entity_type,record_id,payload,updated_at,deleted_at)
      values(p_owner_id,item->>'entity_type',item->>'record_id',item->'payload',stamp,removed)
    on conflict(user_id,entity_type,record_id) do update set
      payload=excluded.payload,updated_at=excluded.updated_at,deleted_at=excluded.deleted_at,
      server_version=nextval('public.sync_record_version')
    where p_replace or excluded.updated_at > existing.updated_at
      or (excluded.updated_at=existing.updated_at and excluded.deleted_at is not null and existing.deleted_at is null);
  end loop;
  if (select count(*) from public.sync_records where user_id=p_owner_id) > 10000 then raise exception 'Account record limit reached'; end if;
  if p_replace then
    update public.sync_records as existing set updated_at=override_at,deleted_at=override_at,
      server_version=nextval('public.sync_record_version')
    where existing.user_id=p_owner_id and not exists(
      select 1 from jsonb_array_elements(p_records) as supplied
      where supplied->>'entity_type'=existing.entity_type and supplied->>'record_id'=existing.record_id);
  end if;
  select coalesce(max(server_version),0) into latest from public.sync_records where user_id=p_owner_id;
  select coalesce(jsonb_agg(jsonb_build_object('entity_type',entity_type,'record_id',record_id,
    'payload',payload,'updated_at',updated_at,'deleted_at',deleted_at) order by entity_type,record_id),'[]'::jsonb)
    into response_rows from public.sync_records as existing where user_id=p_owner_id and (p_cursor > latest or server_version > p_cursor
      or exists(select 1 from jsonb_array_elements(p_records) as submitted where submitted->>'entity_type'=existing.entity_type and submitted->>'record_id'=existing.record_id));
  return jsonb_build_object('cursor',latest,'records',response_rows,'hasRecords',latest>0);
end;
$$;
revoke all on function public.sync_account_records(uuid,jsonb,bigint,boolean) from public,anon,authenticated;
grant execute on function public.sync_account_records(uuid,jsonb,bigint,boolean) to service_role;

create table public.ai_usage_counters (
  bucket text primary key,
  owner_id uuid references auth.users(id) on delete cascade,
  used integer not null default 0 check(used>=0),
  expires_at timestamptz
);
create table public.ai_requests (
  owner_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  input_hash text not null,
  created_at timestamptz not null default now(),
  primary key(owner_id,request_id)
);
alter table public.ai_usage_counters enable row level security;
alter table public.ai_requests enable row level security;
revoke all on public.ai_usage_counters, public.ai_requests from anon,authenticated;
grant all on public.ai_usage_counters, public.ai_requests to service_role;

create or replace function public.get_ai_usage(p_owner_id uuid,p_guest boolean,p_limit integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  current_bucket text := 'user:'||p_owner_id::text||case when p_guest then ':guest' else ':'||to_char(now() at time zone 'UTC','YYYY-MM') end;
  used_count integer;
begin
  select coalesce(used,0) into used_count from public.ai_usage_counters where bucket=current_bucket;
  return jsonb_build_object('remaining',greatest(0,p_limit-coalesce(used_count,0)),'limit',p_limit,'guest',p_guest);
end;
$$;
revoke all on function public.get_ai_usage(uuid,boolean,integer) from public,anon,authenticated;
grant execute on function public.get_ai_usage(uuid,boolean,integer) to service_role;

create or replace function public.reserve_ai_request(
  p_owner_id uuid,p_guest boolean,p_request_id uuid,p_input_hash text,p_ip_hash text,
  p_user_limit integer,p_day_limit integer,p_minute_limit integer,p_ip_limit integer
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  quota_now timestamptz := now();
  day_key text := to_char(quota_now at time zone 'UTC','YYYY-MM-DD');
  month_end timestamptz := (date_trunc('month',quota_now at time zone 'UTC') + interval '1 month') at time zone 'UTC';
  day_end timestamptz := (date_trunc('day',quota_now at time zone 'UTC') + interval '1 day') at time zone 'UTC';
  buckets text[];
  limits integer[] := array[p_user_limit,p_day_limit,p_minute_limit,p_ip_limit];
  expires timestamptz[];
  count_value integer;
  user_used integer;
  i integer;
begin
  if p_owner_id is null or p_request_id is null or length(p_input_hash)<>64 or length(p_ip_hash)<>64
    or least(p_user_limit,p_day_limit,p_minute_limit,p_ip_limit)<0 then raise exception 'Invalid reservation'; end if;
  if not exists(select 1 from auth.users where id=p_owner_id and is_anonymous=p_guest) then raise exception 'Invalid identity'; end if;
  -- A small beta uses one global transaction lock, making all caps atomic even
  -- across API processes. Only counters and hashes are stored, never question text.
  perform pg_advisory_xact_lock(2026100501);
  if exists(select 1 from public.ai_requests where owner_id=p_owner_id and request_id=p_request_id) then
    return jsonb_build_object('allowed',false,'code','duplicate');
  end if;
  buckets := array[
    'user:'||p_owner_id::text||case when p_guest then ':guest' else ':'||to_char(quota_now at time zone 'UTC','YYYY-MM') end,
    'day:'||day_key,
    'minute:'||to_char(quota_now at time zone 'UTC','YYYY-MM-DD-HH24-MI'),
    'ip:'||p_ip_hash||':'||day_key];
  expires := array[case when p_guest then null else month_end end,day_end,date_trunc('minute',quota_now)+interval '1 minute',day_end];
  for i in 1..4 loop
    select coalesce(used,0) into count_value from public.ai_usage_counters where bucket=buckets[i];
    if coalesce(count_value,0)>=limits[i] then return jsonb_build_object('allowed',false,'code','quota'); end if;
  end loop;
  insert into public.ai_requests(owner_id,request_id,input_hash) values(p_owner_id,p_request_id,p_input_hash);
  for i in 1..4 loop
    insert into public.ai_usage_counters(bucket,owner_id,used,expires_at) values(buckets[i],case when i=1 then p_owner_id else null end,1,expires[i])
      on conflict(bucket) do update set used=public.ai_usage_counters.used+1;
  end loop;
  select used into user_used from public.ai_usage_counters where bucket=buckets[1];
  return jsonb_build_object('allowed',true,'remaining',p_user_limit-user_used,'limit',p_user_limit);
end;
$$;
revoke all on function public.reserve_ai_request(uuid,boolean,uuid,text,text,integer,integer,integer,integer) from public,anon,authenticated;
grant execute on function public.reserve_ai_request(uuid,boolean,uuid,text,text,integer,integer,integer,integer) to service_role;

create or replace function public.cleanup_ai_usage()
returns void language sql security definer set search_path='' as $$
  delete from public.ai_usage_counters where expires_at < now()-interval '1 day';
  delete from public.ai_requests where created_at < now()-interval '30 days';
$$;
revoke all on function public.cleanup_ai_usage() from public,anon,authenticated;
grant execute on function public.cleanup_ai_usage() to service_role;
