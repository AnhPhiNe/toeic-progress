-- Permanent content deletion, with minimal tombstones for cross-device sync.
-- Apply once after domain_tables. Also scrubs content already marked deleted.
begin;
lock table public.user_profiles,public.study_sessions,public.mistakes,public.vocabulary_logs,
  public.weekly_plans,public.pacing_runs,public.exam_checklist,public.streak_shields,
  public.study_session_parts,public.weekly_plan_tasks,public.pacing_run_phases,public.sync_records_legacy in access exclusive mode;

create table public.sync_tombstones (
  user_id uuid not null references auth.users(id) on delete cascade,
  entity_type text not null check(entity_type in ('sessions','mistakes','vocabLog','weeklyPlans','pacingRuns','checklist','shieldDays')),
  record_id text not null check(length(record_id) between 1 and 200),
  updated_at timestamptz not null, deleted_at timestamptz not null,
  server_version bigint not null,
  primary key(user_id,entity_type,record_id)
);
create index sync_tombstones_owner_version on public.sync_tombstones(user_id,server_version);
alter table public.sync_tombstones enable row level security;
revoke all on public.sync_tombstones from anon,authenticated;
grant select on public.sync_tombstones to authenticated;
grant all on public.sync_tombstones to service_role;
create policy "Permanent owner reads tombstones" on public.sync_tombstones for select to authenticated
  using(user_id=(select auth.uid()) and coalesce((select auth.jwt()->>'is_anonymous')::boolean,false)=false);

create table public.learning_data_resets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  reset_at timestamptz not null, server_version bigint not null
);
alter table public.learning_data_resets enable row level security;
revoke all on public.learning_data_resets from anon,authenticated;
grant all on public.learning_data_resets to service_role;

alter table public.mistakes drop constraint mistakes_user_id_linked_session_id_fkey;
alter table public.mistakes add constraint mistakes_user_id_linked_session_id_fkey
  foreign key(user_id,linked_session_id) references public.study_sessions(user_id,id)
  on delete set null(linked_session_id) deferrable initially deferred;

create or replace function private.soft_delete_domain_record() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if coalesce(current_setting('toeic.purge',true),'')='on' or not exists(select 1 from auth.users where id=old.user_id) then return old; end if;
  execute format('update public.%I set deleted_at=clock_timestamp() where user_id=$1 and id=$2',tg_table_name) using old.user_id,old.id;
  return null;
end;
$$;

create or replace function private.touch_domain_parent() returns trigger language plpgsql security definer set search_path='' as $$
declare row_value jsonb; parent_id text; owner_id uuid;
begin
  if coalesce(current_setting('toeic.domain_sync',true),'')='on' or coalesce(current_setting('toeic.purge',true),'')='on' then return null; end if;
  row_value := case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
  owner_id := (row_value->>'user_id')::uuid;
  parent_id := row_value->>tg_argv[1];
  if not exists(select 1 from auth.users where id=owner_id) then return null; end if;
  if tg_op='UPDATE' and (to_jsonb(old)->>'user_id' is distinct from row_value->>'user_id'
    or to_jsonb(old)->>tg_argv[1] is distinct from parent_id) then raise exception 'Child ownership is immutable'; end if;
  if tg_argv[0]='study_sessions' then
    execute 'update public.study_sessions set has_practice_parts=true,updated_at=clock_timestamp() where user_id=$1 and id=$2' using owner_id,parent_id;
  else
    execute format('update public.%I set updated_at=clock_timestamp() where user_id=$1 and id=$2',tg_argv[0]) using owner_id,parent_id;
  end if;
  return null;
end;
$$;

create function private.purge_domain_content(p_owner_id uuid,p_entity_type text,p_record_id text,
  p_updated_at timestamptz,p_deleted_at timestamptz,p_server_version bigint)
returns void language plpgsql security definer set search_path='' as $$
declare target_table text; previous_mode text;
begin
  target_table := case p_entity_type
    when 'sessions' then 'study_sessions'
    when 'mistakes' then 'mistakes'
    when 'vocabLog' then 'vocabulary_logs'
    when 'weeklyPlans' then 'weekly_plans'
    when 'pacingRuns' then 'pacing_runs'
    when 'checklist' then 'exam_checklist'
    when 'shieldDays' then 'streak_shields'
    else null end;
  if target_table is null then raise exception 'Invalid content deletion type'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_owner_id::text,20261005));
  insert into public.sync_tombstones as existing(user_id,entity_type,record_id,updated_at,deleted_at,server_version)
    values(p_owner_id,p_entity_type,p_record_id,p_updated_at,p_deleted_at,p_server_version)
    on conflict(user_id,entity_type,record_id) do update set updated_at=excluded.updated_at,
      deleted_at=excluded.deleted_at,server_version=excluded.server_version
    where excluded.updated_at>existing.updated_at;
  previous_mode := coalesce(current_setting('toeic.purge',true),'');
  perform set_config('toeic.purge','on',true);
  execute format('delete from public.%I where user_id=$1 and id=$2',target_table) using p_owner_id,p_record_id;
  -- Retired migration copies must not keep content after the user deleted it.
  delete from public.sync_records_legacy where user_id=p_owner_id and entity_type=p_entity_type and record_id=p_record_id;
  perform set_config('toeic.purge',previous_mode,true);
end;
$$;

alter function private.store_domain_record(uuid,text,text,jsonb,timestamptz,timestamptz,bigint) rename to store_live_domain_record;
create function private.store_domain_record(p_owner_id uuid,p_entity_type text,p_record_id text,p_payload jsonb,
  p_updated_at timestamptz,p_deleted_at timestamptz,p_server_version bigint default null)
returns void language plpgsql security definer set search_path='' as $$
declare current_record record; selected_version bigint;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_owner_id::text,20261005));
  select updated_at,deleted_at into current_record from public.sync_records
    where user_id=p_owner_id and entity_type=p_entity_type and record_id=p_record_id;
  if found then
    if p_updated_at<current_record.updated_at or (p_updated_at=current_record.updated_at
      and not(p_deleted_at is not null and current_record.deleted_at is null)) then return; end if;
  end if;
  if p_deleted_at is not null then
    selected_version := coalesce(p_server_version,nextval('public.sync_record_version'));
    perform private.purge_domain_content(p_owner_id,p_entity_type,p_record_id,p_updated_at,p_deleted_at,selected_version);
  else
    delete from public.sync_tombstones where user_id=p_owner_id and entity_type=p_entity_type and record_id=p_record_id;
    perform private.store_live_domain_record(p_owner_id,p_entity_type,p_record_id,p_payload,p_updated_at,null,p_server_version);
    delete from public.sync_records_legacy where user_id=p_owner_id and entity_type=p_entity_type and record_id=p_record_id;
  end if;
end;
$$;

create or replace view public.sync_records with (security_invoker=true) as

select r.user_id,'profile'::text as entity_type,r.id as record_id,
  r.extra||jsonb_strip_nulls(jsonb_build_object('name',r.name,'targetScore',r.target_score,'examDate',coalesce(r.exam_date::text,''),'selectedSkill',r.selected_skill,'dailyMinGoalMinutes',r.daily_goal_minutes,'streakFreezes',r.streak_freezes,'shieldAllowance',r.shield_allowance,'currentStreak',r.current_streak,'longestStreak',r.longest_streak,'lastStudyDate',coalesce(r.last_study_date::text,''),'motto',r.motto)) as payload,
  r.updated_at,r.deleted_at,r.server_version from public.user_profiles r
union all
select r.user_id,'sessions'::text as entity_type,r.id as record_id,
  r.extra||jsonb_strip_nulls(jsonb_build_object('id',r.id,'skillType',r.skill_type,'sessionType',r.session_type,'testName',r.test_name,'date',r.study_date,'durationMinutes',r.duration_minutes,'createdAt',r.created_at,'rawListening',r.raw_listening,'rawReading',r.raw_reading,'scaledListening',r.scaled_listening,'scaledReading',r.scaled_reading,'totalScore',r.total_score,'attemptNumber',r.attempt_number,'notes',r.notes,'partScores',case when r.part1_correct is not null then jsonb_build_object('part1',r.part1_correct,'part2',r.part2_correct,'part3',r.part3_correct,'part4',r.part4_correct,'part5',r.part5_correct,'part6',r.part6_correct,'part7',r.part7_correct) end,'practiceParts',case when r.has_practice_parts then coalesce((select jsonb_agg(p.extra||jsonb_build_object('part',p.part,'correct',p.correct,'total',p.total) order by p.position) from public.study_session_parts p where p.user_id=r.user_id and p.session_id=r.id),'[]'::jsonb) end)) as payload,
  r.updated_at,r.deleted_at,r.server_version from public.study_sessions r
union all
select r.user_id,'mistakes'::text as entity_type,r.id as record_id,
  r.extra||jsonb_strip_nulls(jsonb_build_object('id',r.id,'part',r.part,'category',r.category,'status',r.status,'questionContext',r.question_context,'userMistake',r.user_mistake,'correctAnswer',r.correct_answer,'trapTip',r.trap_tip,'options',r.options,'tags',r.tags,'createdAt',r.created_at,'nextReviewDate',r.next_review_date,'reviewStage',r.review_stage,'reviewCount',r.review_count,'lastReviewedAt',r.last_reviewed_at,'sessionId',r.session_id)) as payload,
  r.updated_at,r.deleted_at,r.server_version from public.mistakes r
union all
select r.user_id,'vocabLog'::text as entity_type,r.id as record_id,
  r.extra||jsonb_strip_nulls(jsonb_build_object('id',r.id,'date',r.study_date,'count',r.word_count)) as payload,
  r.updated_at,r.deleted_at,r.server_version from public.vocabulary_logs r
union all
select r.user_id,'weeklyPlans'::text as entity_type,r.id as record_id,
  r.extra||jsonb_strip_nulls(jsonb_build_object('id',r.id,'weekKey',r.week_key,'tasks',coalesce((select jsonb_agg(t.extra||jsonb_strip_nulls(jsonb_build_object('id',t.id,'title',t.title,'type',t.task_type,'target',t.target,'unit',t.unit,'partNumber',t.part_number,'manualDone',t.manual_done,'isCompleted',t.is_completed,'notes',t.notes,'color',t.color,'createdAt',t.created_at)) order by t.position) from public.weekly_plan_tasks t where t.user_id=r.user_id and t.week_id=r.id),'[]'::jsonb))) as payload,
  r.updated_at,r.deleted_at,r.server_version from public.weekly_plans r
union all
select r.user_id,'pacingRuns'::text as entity_type,r.id as record_id,
  r.extra||jsonb_strip_nulls(jsonb_build_object('id',r.id,'presetId',r.preset_id,'presetName',r.preset_name,'date',r.study_date,'plannedMinutes',r.planned_minutes,'actualMinutes',r.actual_minutes,'finishedNaturally',r.finished_naturally,'createdAt',r.created_at,'phases',coalesce((select jsonb_agg(p.extra||jsonb_build_object('name',p.name,'plannedMinutes',p.planned_minutes,'actualMinutes',p.actual_minutes,'overrunMinutes',p.overrun_minutes) order by p.position) from public.pacing_run_phases p where p.user_id=r.user_id and p.run_id=r.id),'[]'::jsonb))) as payload,
  r.updated_at,r.deleted_at,r.server_version from public.pacing_runs r
union all
select r.user_id,'checklist'::text as entity_type,r.id as record_id,
  r.extra||jsonb_strip_nulls(jsonb_build_object('id',r.id,'checked',r.checked)) as payload,
  r.updated_at,r.deleted_at,r.server_version from public.exam_checklist r
union all
select r.user_id,'shieldDays'::text as entity_type,r.id as record_id,
  r.extra||jsonb_strip_nulls(jsonb_build_object('id',r.id,'date',r.study_date)) as payload,
  r.updated_at,r.deleted_at,r.server_version from public.streak_shields r
union all
select user_id,entity_type,record_id,jsonb_build_object('id',record_id) as payload,
  updated_at,deleted_at,server_version from public.sync_tombstones;


create function private.compact_deleted_domain_record() returns trigger language plpgsql security definer set search_path='' as $$
declare entity text;
begin
  if new.deleted_at is null then return null; end if;
  entity := case tg_table_name
    when 'study_sessions' then 'sessions'
    when 'mistakes' then 'mistakes'
    when 'vocabulary_logs' then 'vocabLog'
    when 'weekly_plans' then 'weeklyPlans'
    when 'pacing_runs' then 'pacingRuns'
    when 'exam_checklist' then 'checklist'
    when 'streak_shields' then 'shieldDays'
    end;
  perform private.purge_domain_content(new.user_id,entity,new.id,new.updated_at,new.deleted_at,new.server_version);
  return null;
end;
$$;

create trigger compact_deleted_record after insert or update on public.study_sessions for each row execute function private.compact_deleted_domain_record();
create trigger compact_deleted_record after insert or update on public.mistakes for each row execute function private.compact_deleted_domain_record();
create trigger compact_deleted_record after insert or update on public.vocabulary_logs for each row execute function private.compact_deleted_domain_record();
create trigger compact_deleted_record after insert or update on public.weekly_plans for each row execute function private.compact_deleted_domain_record();
create trigger compact_deleted_record after insert or update on public.pacing_runs for each row execute function private.compact_deleted_domain_record();
create trigger compact_deleted_record after insert or update on public.exam_checklist for each row execute function private.compact_deleted_domain_record();
create trigger compact_deleted_record after insert or update on public.streak_shields for each row execute function private.compact_deleted_domain_record();

-- Remove only content already marked deleted. Live data is not reset by this migration.
do $$
declare item record; saved_mode text;
begin
  saved_mode := coalesce(current_setting('toeic.domain_sync',true),'');
  perform set_config('toeic.domain_sync','on',true);
  for item in select * from public.sync_records where deleted_at is not null loop
    perform private.purge_domain_content(item.user_id,item.entity_type,item.record_id,item.updated_at,item.deleted_at,item.server_version);
  end loop;
  delete from public.sync_records_legacy as legacy where exists(select 1 from public.sync_tombstones as tombstone
    where tombstone.user_id=legacy.user_id and tombstone.entity_type=legacy.entity_type and tombstone.record_id=legacy.record_id);
  perform set_config('toeic.domain_sync',saved_mode,true);
end;
$$;
set constraints all immediate;

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
  reset_version bigint := 0;
  reset_barrier boolean := false;
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
  perform set_config('toeic.domain_sync','on',true);
  -- Serializes writes AND cursor reads for one owner. Sequence numbers cannot
  -- be skipped by a later-committing transaction for the same account.
  perform pg_advisory_xact_lock(hashtextextended(p_owner_id::text, 20261005));
  select coalesce(server_version,0) into reset_version from public.learning_data_resets where user_id=p_owner_id;
  reset_barrier := coalesce(reset_version,0)>p_cursor and not p_replace;
  if reset_barrier then
    -- Discard writes from devices that have not observed the reset. Return the
    -- full canonical snapshot so current clients can discard stale local state.
    select coalesce(max(server_version),0) into latest from public.sync_records where user_id=p_owner_id;
    select coalesce(jsonb_agg(jsonb_build_object('entity_type',entity_type,'record_id',record_id,
      'payload',payload,'updated_at',updated_at,'deleted_at',deleted_at) order by entity_type,record_id),'[]'::jsonb)
      into response_rows from public.sync_records where user_id=p_owner_id;
    perform set_config('toeic.domain_sync','off',true);
    return jsonb_build_object('cursor',latest,'records',response_rows,'hasRecords',latest>0,'resetBarrier',true);
  end if;

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
    perform private.store_domain_record(p_owner_id,item->>'entity_type',item->>'record_id',item->'payload',stamp,removed);
  end loop;
  if (select count(*) from public.sync_records where user_id=p_owner_id) > 10000 then raise exception 'Account record limit reached'; end if;
  if p_replace then
    for item in select to_jsonb(existing) from public.sync_records as existing where existing.user_id=p_owner_id and not exists(
      select 1 from jsonb_array_elements(p_records) as supplied
      where supplied->>'entity_type'=existing.entity_type and supplied->>'record_id'=existing.record_id) loop
      perform private.store_domain_record(p_owner_id,item->>'entity_type',item->>'record_id',item->'payload',override_at,override_at);
    end loop;
  end if;
  update public.mistakes as m set linked_session_id=s.id from public.study_sessions as s
    where m.user_id=p_owner_id and s.user_id=m.user_id and m.session_id=s.id and m.linked_session_id is distinct from s.id;
  select coalesce(max(server_version),0) into latest from public.sync_records where user_id=p_owner_id;
  select coalesce(jsonb_agg(jsonb_build_object('entity_type',entity_type,'record_id',record_id,
    'payload',payload,'updated_at',updated_at,'deleted_at',deleted_at) order by entity_type,record_id),'[]'::jsonb)
    into response_rows from public.sync_records as existing where user_id=p_owner_id and (p_cursor > latest or server_version > p_cursor
      or exists(select 1 from jsonb_array_elements(p_records) as submitted where submitted->>'entity_type'=existing.entity_type and submitted->>'record_id'=existing.record_id));
  perform set_config('toeic.domain_sync','off',true);
  return jsonb_build_object('cursor',latest,'records',response_rows,'hasRecords',latest>0);
end;
$$;
revoke all on function public.sync_account_records(uuid,jsonb,bigint,boolean) from public,anon,authenticated;
grant execute on function public.sync_account_records(uuid,jsonb,bigint,boolean) to service_role;





create function public.reset_learning_data(p_owner_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare item record; reset_time timestamptz; latest bigint; snapshot jsonb;
begin
  if not exists(select 1 from auth.users where id=p_owner_id and not is_anonymous) then raise exception 'Permanent account required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_owner_id::text,20261005));
  perform set_config('toeic.domain_sync','on',true);
  select greatest(clock_timestamp(),coalesce(max(updated_at)+interval '1 millisecond',clock_timestamp()))
    into reset_time from public.sync_records where user_id=p_owner_id;
  for item in select * from public.sync_records where user_id=p_owner_id and entity_type<>'profile' loop
    perform private.purge_domain_content(p_owner_id,item.entity_type,item.record_id,reset_time,reset_time,nextval('public.sync_record_version'));
  end loop;
  perform private.store_domain_record(p_owner_id,'profile','profile',jsonb_build_object(
    'name','Học viên','targetScore',990,'examDate','','currentStreak',0,'longestStreak',0,'streakFreezes',2,
    'shieldAllowance',2,'lastStudyDate','','dailyMinGoalMinutes',30,'motto','','selectedSkill','LR'),reset_time,null);
  -- Checklist defaults are new live records; old custom checklist IDs stay tombstoned.
  for item in select * from jsonb_each('{"id_original":true,"exam_slip":true,"pencils_2b":false,"eraser":false,"dress_code":false,"arrive_early":false,"sleep_well":false,"no_smartwatch":false}'::jsonb) loop
    perform private.store_domain_record(p_owner_id,'checklist',item.key,jsonb_build_object('id',item.key,'checked',item.value),reset_time+interval '1 millisecond',null);
  end loop;
  delete from public.sync_records_legacy where user_id=p_owner_id;
  select coalesce(max(server_version),0) into latest from public.sync_records where user_id=p_owner_id;
  insert into public.learning_data_resets(user_id,reset_at,server_version) values(p_owner_id,reset_time,latest)
    on conflict(user_id) do update set reset_at=excluded.reset_at,server_version=excluded.server_version;
  select coalesce(jsonb_agg(jsonb_build_object('entity_type',entity_type,'record_id',record_id,
    'payload',payload,'updated_at',updated_at,'deleted_at',deleted_at) order by entity_type,record_id),'[]'::jsonb)
    into snapshot from public.sync_records where user_id=p_owner_id;
  perform set_config('toeic.domain_sync','off',true);
  return jsonb_build_object('cursor',latest,'records',snapshot,'hasRecords',true,'resetBarrier',true);
end;
$$;
revoke all on function public.reset_learning_data(uuid) from public,anon,authenticated;
grant execute on function public.reset_learning_data(uuid) to service_role;
revoke all on all functions in schema private from public,anon,authenticated;
comment on table public.sync_tombstones is 'Deleted record IDs and versions only; no learning content.';
comment on table public.learning_data_resets is 'Account reset barrier: prevents stale devices re-uploading erased learning data.';
notify pgrst,'reload schema';
commit;
