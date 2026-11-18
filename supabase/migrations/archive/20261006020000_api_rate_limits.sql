begin;

-- Short-lived operational counters; no learning content, IPs, tokens, or question hashes.
create table public.api_rate_limits (
  owner_id uuid not null references auth.users(id) on delete cascade,
  bucket text not null check(bucket in ('account','sync','usage','ai','destructive')),
  window_start timestamptz not null,
  used integer not null check(used>0),
  primary key(owner_id,bucket,window_start)
);
create index api_rate_limits_expiry on public.api_rate_limits(window_start);
alter table public.api_rate_limits enable row level security;
revoke all on public.api_rate_limits from public,anon,authenticated;
grant all on public.api_rate_limits to service_role;

create function public.reserve_api_request(p_owner_id uuid,p_scope text,p_account_limit integer,p_scope_limit integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  stamp timestamptz;
  current_window timestamptz;
  retry_seconds integer;
  account_used integer;
  scope_used integer;
begin
  if p_owner_id is null or p_scope is null or p_scope not in ('sync','usage','ai','destructive')
    or p_account_limit is null or p_scope_limit is null
    or p_account_limit not between 1 and 10000 or p_scope_limit not between 1 and 1000 then
    raise exception 'Invalid API reservation';
  end if;
  if not exists(select 1 from auth.users where id=p_owner_id) then raise exception 'Invalid identity'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_owner_id::text,20261006));
  stamp := clock_timestamp();
  current_window := date_trunc('minute',stamp);
  retry_seconds := greatest(1,ceil(extract(epoch from current_window+interval '1 minute'-stamp))::integer);
  -- Per-owner cleanup bounds storage even before a maintenance job has been scheduled.
  delete from public.api_rate_limits where owner_id=p_owner_id and window_start<current_window;
  select used into account_used from public.api_rate_limits
    where owner_id=p_owner_id and bucket='account' and window_start=current_window;
  select used into scope_used from public.api_rate_limits
    where owner_id=p_owner_id and bucket=p_scope and window_start=current_window;
  if coalesce(account_used,0)>=p_account_limit or coalesce(scope_used,0)>=p_scope_limit then
    return jsonb_build_object('allowed',false,'retry_after',retry_seconds);
  end if;
  insert into public.api_rate_limits as current(owner_id,bucket,window_start,used)
    values(p_owner_id,'account',current_window,1),(p_owner_id,p_scope,current_window,1)
    on conflict(owner_id,bucket,window_start) do update set used=current.used+1;
  return jsonb_build_object('allowed',true);
end;
$$;
revoke all on function public.reserve_api_request(uuid,text,integer,integer) from public,anon,authenticated;
grant execute on function public.reserve_api_request(uuid,text,integer,integer) to service_role;

create or replace function public.cleanup_ai_usage()
returns void language sql security definer set search_path='' as $$
  delete from public.ai_usage_counters where expires_at<now()-interval '1 day';
  delete from public.ai_requests where created_at<now()-interval '30 days';
  delete from public.api_rate_limits where window_start<now()-interval '1 day';
$$;
revoke all on function public.cleanup_ai_usage() from public,anon,authenticated;
grant execute on function public.cleanup_ai_usage() to service_role;

commit;
