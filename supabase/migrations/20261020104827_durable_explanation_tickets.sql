begin;

-- Operational, owner-scoped cache. Never exposed to browser roles; deletion of
-- an Auth identity cascades both rows and saved results. Tickets expire in 24h.
create table public.ai_explanation_questions (
  owner_id uuid not null references auth.users(id) on delete cascade,
  ticket_id uuid not null,
  question_number integer not null check (question_number between 1 and 200),
  binding text not null check (binding ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz not null,
  attempts integer not null default 0 check (attempts between 0 and 3),
  lease_id uuid,
  lease_until timestamptz,
  invalidated boolean not null default false,
  result jsonb check (result is null or (jsonb_typeof(result)='object' and octet_length(result::text)<=131072)),
  primary key(owner_id,ticket_id,question_number),
  check ((lease_id is null)=(lease_until is null))
);
create index ai_explanation_questions_expiry on public.ai_explanation_questions(expires_at);
create table public.ai_explanation_requests (
  owner_id uuid not null,
  ticket_id uuid not null,
  question_number integer not null,
  request_id uuid not null,
  attempt integer not null check (attempt between 1 and 3),
  status text not null check (status in ('running','failed','unknown','completed')),
  primary key(owner_id,ticket_id,question_number,request_id),
  foreign key(owner_id,ticket_id,question_number)
    references public.ai_explanation_questions(owner_id,ticket_id,question_number) on delete cascade
);
alter table public.ai_explanation_questions enable row level security;
alter table public.ai_explanation_requests enable row level security;
revoke all on public.ai_explanation_questions,public.ai_explanation_requests from public,anon,authenticated;
grant all on public.ai_explanation_questions,public.ai_explanation_requests to service_role;

create function public.explanation_ledger_ready()
returns jsonb language sql stable security invoker set search_path='' as $$
  select jsonb_build_object('version',1,'tables',
    to_regclass('public.ai_explanation_questions') is not null
    and to_regclass('public.ai_explanation_requests') is not null
    and to_regprocedure('public.claim_explanation_question(uuid,uuid,integer,text,timestamp with time zone,uuid,uuid)') is not null
    and to_regprocedure('public.finish_explanation_question(uuid,uuid,integer,uuid,jsonb)') is not null);
$$;

create function public.claim_explanation_question(
  p_owner_id uuid,p_ticket_id uuid,p_question_number integer,p_binding text,
  p_expires_at timestamptz,p_request_id uuid,p_lease_id uuid
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  stamp timestamptz := clock_timestamp();
  q public.ai_explanation_questions%rowtype;
  prior public.ai_explanation_requests%rowtype;
begin
  if p_owner_id is null or p_ticket_id is null or p_question_number is null
    or p_question_number not between 1 and 200 or p_binding is null or p_binding !~ '^[a-f0-9]{64}$'
    or p_request_id is null or p_lease_id is null or p_expires_at is null
    or p_expires_at<=stamp or p_expires_at>stamp+interval '24 hours 1 minute' then
    raise exception 'Invalid explanation claim';
  end if;
  -- Share the existing reset/sync owner lock. A reset that started before this
  -- claim either commits its barrier first, or scrubs the newly inserted row
  -- before its own commit. Never lock the reset row after taking this lock.
  perform pg_advisory_xact_lock(hashtextextended(p_owner_id::text,20261005));
  if exists(select 1 from public.learning_data_resets
    where user_id=p_owner_id and reset_at>=p_expires_at-interval '24 hours') then
    return jsonb_build_object('action','invalidated');
  end if;
  -- Bounded, indexed maintenance. Never remove a live ticket or active lease.
  delete from public.ai_explanation_questions where (owner_id,ticket_id,question_number) in (
    select owner_id,ticket_id,question_number from public.ai_explanation_questions
      where expires_at<stamp and (lease_until is null or lease_until<stamp)
      order by expires_at limit 100 for update skip locked
  );
  insert into public.ai_explanation_questions(owner_id,ticket_id,question_number,binding,expires_at)
    values(p_owner_id,p_ticket_id,p_question_number,p_binding,p_expires_at) on conflict do nothing;
  select * into q from public.ai_explanation_questions
    where owner_id=p_owner_id and ticket_id=p_ticket_id and question_number=p_question_number for update;
  if q.binding<>p_binding or q.expires_at<>p_expires_at then
    return jsonb_build_object('action','content_changed');
  end if;
  if q.invalidated then return jsonb_build_object('action','invalidated'); end if;
  if q.result is not null then
    return jsonb_build_object('action','completed','draft',q.result,'remainingAttempts',3-q.attempts);
  end if;
  -- A disappeared worker has an ambiguous billed attempt. Never replay it as a
  -- new generation. Only a new explicit request can spend the next allowance.
  if q.lease_id is not null and q.lease_until<=stamp then
    update public.ai_explanation_requests set status='unknown'
      where owner_id=p_owner_id and ticket_id=p_ticket_id and question_number=p_question_number and status='running';
    update public.ai_explanation_questions set lease_id=null,lease_until=null
      where owner_id=p_owner_id and ticket_id=p_ticket_id and question_number=p_question_number;
    q.lease_id:=null;
    q.lease_until:=null;
  end if;
  select * into prior from public.ai_explanation_requests
    where owner_id=p_owner_id and ticket_id=p_ticket_id and question_number=p_question_number and request_id=p_request_id;
  if found then
    return jsonb_build_object('action',case when prior.status='running' then 'pending' else 'replayed' end,
      'remainingAttempts',3-q.attempts);
  end if;
  -- Bound reconnect aliases per question. Refusal is fail-closed, never a claim.
  if (select count(*) from public.ai_explanation_requests
      where owner_id=p_owner_id and ticket_id=p_ticket_id and question_number=p_question_number)>=256 then
    return jsonb_build_object('action','pending','remainingAttempts',3-q.attempts);
  end if;
  if q.lease_id is not null then
    insert into public.ai_explanation_requests values(p_owner_id,p_ticket_id,p_question_number,p_request_id,q.attempts,'running');
    return jsonb_build_object('action','pending','remainingAttempts',3-q.attempts);
  end if;
  if q.attempts>=3 then
    return jsonb_build_object('action','exhausted','remainingAttempts',0);
  end if;
  update public.ai_explanation_questions set attempts=attempts+1,lease_id=p_lease_id,lease_until=stamp+interval '120 seconds'
    where owner_id=p_owner_id and ticket_id=p_ticket_id and question_number=p_question_number returning * into q;
  insert into public.ai_explanation_requests values(p_owner_id,p_ticket_id,p_question_number,p_request_id,q.attempts,'running');
  return jsonb_build_object('action','claimed','remainingAttempts',3-q.attempts);
end;
$$;

create function public.finish_explanation_question(
  p_owner_id uuid,p_ticket_id uuid,p_question_number integer,p_lease_id uuid,p_result jsonb
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare q public.ai_explanation_questions%rowtype;
begin
  if p_result is not null and (jsonb_typeof(p_result)<>'object' or octet_length(p_result::text)>131072) then
    raise exception 'Invalid explanation result';
  end if;
  select * into q from public.ai_explanation_questions
    where owner_id=p_owner_id and ticket_id=p_ticket_id and question_number=p_question_number for update;
  -- Fence late writers: a lost/expired lease cannot overwrite a newer attempt.
  if not found or p_lease_id is null or q.lease_id is null or q.lease_until is null
    or q.invalidated or q.lease_id is distinct from p_lease_id or q.lease_until<=clock_timestamp() then
    return jsonb_build_object('accepted',false);
  end if;
  update public.ai_explanation_questions set result=p_result,lease_id=null,lease_until=null
    where owner_id=p_owner_id and ticket_id=p_ticket_id and question_number=p_question_number;
  update public.ai_explanation_requests set status=case when p_result is null then 'failed' else 'completed' end
    where owner_id=p_owner_id and ticket_id=p_ticket_id and question_number=p_question_number and attempt=q.attempts and status='running';
  return jsonb_build_object('accepted',true,'remainingAttempts',3-q.attempts);
end;
$$;

-- Reset removes cached learning content and fences in-flight writers, preserving
-- attempts/idempotency. Old signed tickets may never restore pre-reset content.
create function public.clear_explanation_cache_on_reset()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text,20261005));
  update public.ai_explanation_questions set result=null,lease_id=null,lease_until=null,invalidated=true
    where owner_id=new.user_id;
  update public.ai_explanation_requests set status='unknown'
    where owner_id=new.user_id and status='running';
  return new;
end;
$$;
create trigger clear_explanation_cache_after_reset after insert or update on public.learning_data_resets
for each row execute function public.clear_explanation_cache_on_reset();

create function public.cleanup_explanation_ledger(p_limit integer default 1000)
returns integer language plpgsql security invoker set search_path='' as $$
declare removed integer;
begin
  if p_limit is null or p_limit not between 1 and 10000 then raise exception 'Invalid cleanup limit'; end if;
  delete from public.ai_explanation_questions where (owner_id,ticket_id,question_number) in (
    select owner_id,ticket_id,question_number from public.ai_explanation_questions
      where expires_at<clock_timestamp() and (lease_until is null or lease_until<clock_timestamp())
      order by expires_at limit p_limit for update skip locked
  );
  get diagnostics removed=row_count;
  return removed;
end;
$$;

revoke all on function public.explanation_ledger_ready() from public,anon,authenticated;
revoke all on function public.claim_explanation_question(uuid,uuid,integer,text,timestamptz,uuid,uuid) from public,anon,authenticated;
revoke all on function public.finish_explanation_question(uuid,uuid,integer,uuid,jsonb) from public,anon,authenticated;
revoke all on function public.clear_explanation_cache_on_reset() from public,anon,authenticated;
revoke all on function public.cleanup_explanation_ledger(integer) from public,anon,authenticated;
grant execute on function public.explanation_ledger_ready() to service_role;
grant execute on function public.claim_explanation_question(uuid,uuid,integer,text,timestamptz,uuid,uuid) to service_role;
grant execute on function public.finish_explanation_question(uuid,uuid,integer,uuid,jsonb) to service_role;
grant execute on function public.clear_explanation_cache_on_reset() to service_role;
grant execute on function public.cleanup_explanation_ledger(integer) to service_role;

commit;
