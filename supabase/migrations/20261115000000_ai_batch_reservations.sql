-- One screenshot capture is one AI use, however many requests it needs.
-- A capture of up to ~10 pages is sent as several extract-page requests that share a batch id.
-- The first request of a batch is charged to the account (and every other quota exactly like reserve_ai_request);
-- later requests of the same batch only count against the shared minute/day/IP safety caps, so a runaway client
-- is still stopped. A batch accepts at most p_max_chunks requests and expires after p_ttl_seconds.
begin;

create table public.ai_batches (
  owner_id uuid not null references auth.users(id) on delete cascade,
  batch_id uuid not null,
  chunks integer not null default 1 check(chunks between 1 and 20),
  created_at timestamptz not null default now(),
  primary key(owner_id,batch_id)
);
alter table public.ai_batches enable row level security;
revoke all on public.ai_batches from anon,authenticated;
grant all on public.ai_batches to service_role;

create or replace function public.reserve_ai_batch_request(
  p_owner_id uuid,p_guest boolean,p_request_id uuid,p_batch_id uuid,p_input_hash text,p_ip_hash text,
  p_user_limit integer,p_day_limit integer,p_minute_limit integer,p_ip_limit integer,
  p_max_chunks integer default 4,p_ttl_seconds integer default 3600
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
  batch_chunks integer;
  batch_started timestamptz;
  first_bucket integer := 1;
  i integer;
begin
  if p_owner_id is null or p_request_id is null or p_batch_id is null or length(p_input_hash)<>64 or length(p_ip_hash)<>64
    or least(p_user_limit,p_day_limit,p_minute_limit,p_ip_limit)<0 or p_max_chunks<1 or p_ttl_seconds<1 then raise exception 'Invalid reservation'; end if;
  if not exists(select 1 from auth.users where id=p_owner_id and is_anonymous=p_guest) then raise exception 'Invalid identity'; end if;
  -- Same global lock as reserve_ai_request, so both functions see consistent counters.
  perform pg_advisory_xact_lock(2026100501);
  if exists(select 1 from public.ai_requests where owner_id=p_owner_id and request_id=p_request_id) then
    return jsonb_build_object('allowed',false,'code','duplicate');
  end if;
  select chunks,created_at into batch_chunks,batch_started from public.ai_batches where owner_id=p_owner_id and batch_id=p_batch_id;
  if found and batch_started < quota_now - make_interval(secs => p_ttl_seconds) then
    delete from public.ai_batches where owner_id=p_owner_id and batch_id=p_batch_id;
    batch_chunks := null;
  end if;
  if batch_chunks is not null then
    if batch_chunks >= p_max_chunks then return jsonb_build_object('allowed',false,'code','batch_full'); end if;
    first_bucket := 2;
  end if;
  buckets := array[
    'user:'||p_owner_id::text||case when p_guest then ':guest' else ':'||to_char(quota_now at time zone 'UTC','YYYY-MM') end,
    'day:'||day_key,
    'minute:'||to_char(quota_now at time zone 'UTC','YYYY-MM-DD-HH24-MI'),
    'ip:'||p_ip_hash||':'||day_key];
  expires := array[case when p_guest then null else month_end end,day_end,date_trunc('minute',quota_now)+interval '1 minute',day_end];
  for i in first_bucket..4 loop
    select coalesce(used,0) into count_value from public.ai_usage_counters where bucket=buckets[i];
    if coalesce(count_value,0)>=limits[i] then return jsonb_build_object('allowed',false,'code','quota'); end if;
  end loop;
  insert into public.ai_requests(owner_id,request_id,input_hash) values(p_owner_id,p_request_id,p_input_hash);
  for i in first_bucket..4 loop
    insert into public.ai_usage_counters(bucket,owner_id,used,expires_at) values(buckets[i],case when i=1 then p_owner_id else null end,1,expires[i])
      on conflict(bucket) do update set used=public.ai_usage_counters.used+1;
  end loop;
  if batch_chunks is null then
    insert into public.ai_batches(owner_id,batch_id) values(p_owner_id,p_batch_id);
  else
    update public.ai_batches set chunks=chunks+1 where owner_id=p_owner_id and batch_id=p_batch_id;
  end if;
  select used into user_used from public.ai_usage_counters where bucket=buckets[1];
  return jsonb_build_object('allowed',true,'remaining',p_user_limit-coalesce(user_used,0),'limit',p_user_limit);
end;
$$;
revoke all on function public.reserve_ai_batch_request(uuid,boolean,uuid,uuid,text,text,integer,integer,integer,integer,integer,integer) from public,anon,authenticated;
grant execute on function public.reserve_ai_batch_request(uuid,boolean,uuid,uuid,text,text,integer,integer,integer,integer,integer,integer) to service_role;

create or replace function public.cleanup_ai_usage()
returns void language sql security definer set search_path='' as $$
  delete from public.ai_usage_counters where expires_at<now()-interval '1 day';
  delete from public.ai_requests where created_at<now()-interval '30 days';
  delete from public.api_rate_limits where window_start<now()-interval '1 day';
  delete from public.ai_batches where created_at<now()-interval '1 day';
$$;
revoke all on function public.cleanup_ai_usage() from public,anon,authenticated;
grant execute on function public.cleanup_ai_usage() to service_role;

commit;
