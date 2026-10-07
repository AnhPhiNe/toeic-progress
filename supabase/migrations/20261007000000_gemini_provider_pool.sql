begin;

-- Independent project quotas shared by ALL keys/workers in each project.
-- Only hashes/operational metadata; no keys, prompts, drafts or user IDs.
create table public.ai_provider_state (
  scope text primary key,
  blocked_until timestamptz,
  reason text,
  last_used_at timestamptz not null default 'epoch'
);
create table public.ai_provider_attempts (
  id uuid primary key,
  project_id text not null,
  model text not null,
  key_id text not null,
  input_tokens integer not null check(input_tokens>0),
  reserved_at timestamptz not null,
  lease_until timestamptz not null,
  finished boolean not null default false,
  probe_scopes text[] not null default '{}'
);
create index ai_provider_attempts_window on public.ai_provider_attempts(project_id,model,reserved_at);
create index ai_provider_attempts_leases on public.ai_provider_attempts(lease_until) where not finished;
alter table public.ai_provider_state enable row level security;
alter table public.ai_provider_attempts enable row level security;
revoke all on public.ai_provider_state,public.ai_provider_attempts from public,anon,authenticated;
grant all on public.ai_provider_state,public.ai_provider_attempts to service_role;

create function public.reserve_gemini_attempt(
  p_id uuid,p_model text,p_projects jsonb,p_input_tokens integer,p_max_concurrent integer,p_key_max_concurrent integer,
  p_rpm_cooldown integer default 60,p_rpd_cooldown integer default 86400
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  stamp timestamptz;
  day_start timestamptz;
  project jsonb;
  project_scope text;
  model_scope text;
  key_ids text[];
  rpm integer; tpm integer; rpd integer;
  minute_count integer;
  minute_tokens bigint;
  day_count integer;
  delay integer;
  min_delay integer := null;
  selected_key text;
  row_state public.ai_provider_state;
  probes text[];
  blocked boolean;
  busy boolean := false;
begin
  if p_id is null or p_model is null or p_model !~ '^gemini-[a-zA-Z0-9.-]+$'
    or p_projects is null or jsonb_typeof(p_projects)!='array' or jsonb_array_length(p_projects) not between 1 and 8
    or p_input_tokens is null or p_input_tokens not between 1 and 100000
    or p_max_concurrent is null or p_max_concurrent not between 1 and 16
    or p_key_max_concurrent is null or p_key_max_concurrent not between 1 and 8
    or p_rpm_cooldown is null or p_rpm_cooldown not between 60 and 3600
    or p_rpd_cooldown is null or p_rpd_cooldown not between 86400 and 604800 then
    raise exception 'Invalid Gemini reservation';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('toeic-gemini-pool',20261007));
  stamp := clock_timestamp();
  day_start := date_trunc('day',stamp at time zone 'America/Los_Angeles') at time zone 'America/Los_Angeles';
  delete from public.ai_provider_attempts where reserved_at<stamp-interval '2 days';
  if exists(select 1 from public.ai_provider_attempts where id=p_id) then
    return jsonb_build_object('allowed',false,'code','duplicate','retry_after',60);
  end if;
  -- Least in-flight project, then oldest use. Shared quota cannot be bypassed
  -- with another key after restarting or by another API worker.
  for project in select value from jsonb_array_elements(p_projects)
    order by (select count(*) from public.ai_provider_attempts a
      where a.project_id=value->>'id' and not a.finished and a.lease_until>stamp),
      coalesce((select last_used_at from public.ai_provider_state where scope='project:'||(value->>'id')),'epoch'),
      value->>'id'
  loop
    if project->>'id' is null or (project->>'id') !~ '^[a-f0-9]{64}$' or jsonb_typeof(project->'key_ids')!='array' then
      raise exception 'Invalid Gemini project';
    end if;
    key_ids:=array(select jsonb_array_elements_text(project->'key_ids'));
    rpm:=(project->>'rpm')::integer; tpm:=(project->>'tpm')::integer; rpd:=(project->>'rpd')::integer;
    if cardinality(key_ids) not between 1 and 16
      or exists(select 1 from unnest(key_ids) k where k is null or k !~ '^[a-f0-9]{64}$')
      or rpm is null or rpm not between 1 and 10000 or tpm is null or tpm not between 1 and 10000000
      or rpd is null or rpd not between 1 and 100000 then raise exception 'Invalid Gemini limits'; end if;
    project_scope:='project:'||(project->>'id'); model_scope:=project_scope||':model:'||p_model;
    insert into public.ai_provider_state(scope)
      select unnest(array[project_scope,model_scope] || array(select 'key:'||k from unnest(key_ids) k))
      on conflict do nothing;
    probes:='{}'; blocked:=false;
    for row_state in select * from public.ai_provider_state where scope in (project_scope,model_scope) loop
      if row_state.blocked_until>stamp then
        delay:=greatest(1,ceil(extract(epoch from row_state.blocked_until-stamp))::integer);
        min_delay:=least(min_delay,delay); blocked:=true;
      elsif row_state.reason is not null then probes:=array_append(probes,row_state.scope);
      end if;
    end loop;
    if blocked then continue; end if;
    if (select count(*) from public.ai_provider_attempts
      where project_id=project->>'id' and not finished and lease_until>stamp)>=p_max_concurrent then
      min_delay:=least(min_delay,1); busy:=true; continue;
    end if;
    select count(*)::integer,coalesce(sum(input_tokens),0) into minute_count,minute_tokens
      from public.ai_provider_attempts a where a.project_id=project->>'id' and a.model=p_model
      and reserved_at>stamp-interval '60 seconds';
    select count(*)::integer into day_count from public.ai_provider_attempts a
      where a.project_id=project->>'id' and a.model=p_model and reserved_at>=day_start;
    if day_count>=rpd then
      delay:=p_rpd_cooldown;
      update public.ai_provider_state set blocked_until=stamp+make_interval(secs=>delay),reason='rpd'
        where scope=model_scope;
      min_delay:=least(min_delay,delay); continue;
    end if;
    if minute_count>=rpm or minute_tokens+p_input_tokens>tpm then
      delay:=p_rpm_cooldown;
      update public.ai_provider_state set blocked_until=stamp+make_interval(secs=>delay),
        reason=case when minute_count>=rpm then 'rpm' else 'tpm' end where scope=model_scope;
      min_delay:=least(min_delay,delay); continue;
    end if;
    select s.scope into selected_key from public.ai_provider_state s
      where s.scope=any(array(select 'key:'||k from unnest(key_ids) k))
        and s.reason is distinct from 'invalid_key'
        and (s.blocked_until is null or s.blocked_until<=stamp)
        and (select count(*) from public.ai_provider_attempts a
          where a.key_id=substring(s.scope from 5) and not a.finished and a.lease_until>stamp)<p_key_max_concurrent
      order by (select count(*) from public.ai_provider_attempts a
        where a.key_id=substring(s.scope from 5) and not a.finished and a.lease_until>stamp),s.last_used_at,s.scope limit 1;
    if selected_key is null then min_delay:=least(min_delay,30); busy:=true; continue; end if;
    if (select reason from public.ai_provider_state where scope=selected_key) is not null then
      probes:=array_append(probes,selected_key);
    end if;
    -- At cooldown expiry allow ONE probe, not a burst of concurrent retries.
    update public.ai_provider_state set blocked_until=stamp+interval '90 seconds',reason='probe'
      where scope=any(probes);
    update public.ai_provider_state set last_used_at=stamp where scope in (selected_key,project_scope);
    insert into public.ai_provider_attempts(id,project_id,model,key_id,input_tokens,reserved_at,lease_until,probe_scopes)
      values(p_id,project->>'id',p_model,substring(selected_key from 5),p_input_tokens,stamp,stamp+interval '90 seconds',probes);
    return jsonb_build_object('allowed',true,'project_id',project->>'id','key_id',substring(selected_key from 5));
  end loop;
  return jsonb_build_object('allowed',false,'code',case when busy then 'busy' else 'quota' end,
    'retry_after',coalesce(min_delay,60));
end;
$$;

create function public.finish_gemini_attempt(p_id uuid,p_scope text default null,p_reason text default null,p_seconds integer default 0)
returns void language plpgsql security definer set search_path='' as $$
declare attempt public.ai_provider_attempts; stamp timestamptz; project_scope text;
begin
  if p_id is null or p_seconds is null or p_seconds<0
    or (p_scope is not null and p_scope not in ('model','key','project')) then raise exception 'Invalid Gemini outcome'; end if;
  perform pg_advisory_xact_lock(hashtextextended('toeic-gemini-pool',20261007));
  stamp:=clock_timestamp();
  select * into attempt from public.ai_provider_attempts where id=p_id and not finished;
  if not found then return; end if;
  update public.ai_provider_attempts set finished=true where id=p_id;
  -- A late success cannot clear a more recent failure's marker.
  update public.ai_provider_state set blocked_until=null,reason=null
    where scope=any(attempt.probe_scopes) and reason='probe' and blocked_until=attempt.lease_until;
  if p_scope is not null then
    if p_reason is null or p_reason not in ('rpm','tpm','rpd','unknown_quota','unavailable','invalid_key','network')
      or p_seconds<1 then raise exception 'Invalid Gemini cooldown'; end if;
    project_scope:='project:'||attempt.project_id;
    update public.ai_provider_state
      set blocked_until=greatest(coalesce(blocked_until,stamp),stamp+make_interval(secs=>p_seconds)),reason=p_reason
      where scope=case p_scope when 'model' then project_scope||':model:'||attempt.model
        when 'key' then 'key:'||attempt.key_id else project_scope end;
  end if;
end;
$$;
revoke all on function public.reserve_gemini_attempt(uuid,text,jsonb,integer,integer,integer,integer,integer),
  public.finish_gemini_attempt(uuid,text,text,integer) from public,anon,authenticated;
grant execute on function public.reserve_gemini_attempt(uuid,text,jsonb,integer,integer,integer,integer,integer),
  public.finish_gemini_attempt(uuid,text,text,integer) to service_role;
commit;
