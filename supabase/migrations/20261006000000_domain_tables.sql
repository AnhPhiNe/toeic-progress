-- Native business tables behind the existing /api/v1/sync interface.
-- Apply once, after the first two migrations. Entire migration is atomic.
begin;
lock table public.sync_records in access exclusive mode;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to service_role;

create table public.user_profiles (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null check(length(id) between 1 and 200),
  name text not null check(length(name) <= 100),
  target_score integer default 990 not null check(target_score>=10 and target_score<=990),
  exam_date date,
  selected_skill text not null check(selected_skill in ('LR','SW')),
  daily_goal_minutes integer default 30 not null check(daily_goal_minutes>=1 and daily_goal_minutes<=1440),
  streak_freezes integer default 2 not null check(streak_freezes>=0 and streak_freezes<=5),
  shield_allowance integer check(shield_allowance>=0),
  current_streak integer default 0 not null check(current_streak>=0),
  longest_streak integer default 0 not null check(longest_streak>=0),
  last_study_date date,
  motto text not null check(length(motto) <= 2000),
  extra jsonb not null default '{}'::jsonb check(jsonb_typeof(extra)='object'),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  server_version bigint not null check(server_version>0),
  primary key(user_id,id),
  check(id='profile'),
  check(deleted_at is null)
);
create index user_profiles_owner_version on public.user_profiles(user_id,server_version);

create table public.study_sessions (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null check(length(id) between 1 and 200),
  skill_type text not null check(skill_type in ('LR','SW')),
  session_type text not null check(session_type in ('FULL_TEST','PART_PRACTICE')),
  test_name text not null check(length(test_name) <= 300),
  study_date date not null,
  duration_minutes numeric not null check(duration_minutes>=0 and duration_minutes<=1440 and duration_minutes::text not in ('NaN','Infinity','-Infinity')),
  created_at timestamptz not null,
  raw_listening integer check(raw_listening>=0 and raw_listening<=100),
  raw_reading integer check(raw_reading>=0 and raw_reading<=100),
  scaled_listening integer check(scaled_listening>=0 and scaled_listening<=495),
  scaled_reading integer check(scaled_reading>=0 and scaled_reading<=495),
  total_score integer check(total_score>=0 and total_score<=990),
  attempt_number integer check(attempt_number>=1),
  notes text check(length(notes) <= 16000),
  part1_correct integer check(part1_correct between 0 and 6),
  part2_correct integer check(part2_correct between 0 and 25),
  part3_correct integer check(part3_correct between 0 and 39),
  part4_correct integer check(part4_correct between 0 and 30),
  part5_correct integer check(part5_correct between 0 and 30),
  part6_correct integer check(part6_correct between 0 and 16),
  part7_correct integer check(part7_correct between 0 and 54),
  has_practice_parts boolean not null,
  extra jsonb not null default '{}'::jsonb check(jsonb_typeof(extra)='object'),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  server_version bigint not null check(server_version>0),
  primary key(user_id,id),
  check((part1_correct is null and part2_correct is null and part3_correct is null and part4_correct is null and part5_correct is null and part6_correct is null and part7_correct is null) or (part1_correct is not null and part2_correct is not null and part3_correct is not null and part4_correct is not null and part5_correct is not null and part6_correct is not null and part7_correct is not null))
);
create index study_sessions_owner_version on public.study_sessions(user_id,server_version);

create table public.mistakes (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null check(length(id) between 1 and 200),
  part integer not null check(part>=1 and part<=7),
  category text not null check(category in ('VOCABULARY_TRAP','ADVANCED_GRAMMAR','LISTENING_SPEED','TIME_PRESSURE','CARELESS_DISTRACTION','OTHER')),
  status text not null check(status in ('NEEDS_REVIEW','MASTERED')),
  question_context text not null check(length(question_context) <= 16000),
  user_mistake text not null check(length(user_mistake) <= 4000),
  correct_answer text not null check(length(correct_answer) <= 2000),
  trap_tip text check(length(trap_tip) <= 4000),
  options text[] check(cardinality(options)<=4),
  tags text[] not null check(cardinality(tags)<=20),
  created_at timestamptz not null,
  next_review_date date,
  review_stage integer check(review_stage>=0),
  review_count integer check(review_count>=0),
  last_reviewed_at timestamptz,
  session_id text check(length(session_id) <= 200),
  linked_session_id text,
  extra jsonb not null default '{}'::jsonb check(jsonb_typeof(extra)='object'),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  server_version bigint not null check(server_version>0),
  primary key(user_id,id),
  foreign key(user_id,linked_session_id) references public.study_sessions(user_id,id) deferrable initially deferred,
  check(linked_session_id is null or linked_session_id=session_id)
);
create index mistakes_owner_version on public.mistakes(user_id,server_version);

create table public.vocabulary_logs (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null check(length(id) between 1 and 200),
  study_date date not null,
  word_count integer not null check(word_count>=1 and word_count<=10000),
  extra jsonb not null default '{}'::jsonb check(jsonb_typeof(extra)='object'),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  server_version bigint not null check(server_version>0),
  primary key(user_id,id)
);
create index vocabulary_logs_owner_version on public.vocabulary_logs(user_id,server_version);

create table public.weekly_plans (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null check(length(id) between 1 and 200),
  week_key date not null,
  extra jsonb not null default '{}'::jsonb check(jsonb_typeof(extra)='object'),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  server_version bigint not null check(server_version>0),
  primary key(user_id,id),
  check(id=week_key::text and extract(isodow from week_key)=1)
);
create index weekly_plans_owner_version on public.weekly_plans(user_id,server_version);

create table public.pacing_runs (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null check(length(id) between 1 and 200),
  preset_id text not null,
  preset_name text not null,
  study_date date not null,
  planned_minutes numeric not null check(planned_minutes>=0 and planned_minutes::text not in ('NaN','Infinity','-Infinity')),
  actual_minutes numeric not null check(actual_minutes>=0 and actual_minutes::text not in ('NaN','Infinity','-Infinity')),
  finished_naturally boolean not null,
  created_at timestamptz not null,
  extra jsonb not null default '{}'::jsonb check(jsonb_typeof(extra)='object'),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  server_version bigint not null check(server_version>0),
  primary key(user_id,id)
);
create index pacing_runs_owner_version on public.pacing_runs(user_id,server_version);

create table public.exam_checklist (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null check(length(id) between 1 and 200),
  checked boolean not null,
  extra jsonb not null default '{}'::jsonb check(jsonb_typeof(extra)='object'),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  server_version bigint not null check(server_version>0),
  primary key(user_id,id)
);
create index exam_checklist_owner_version on public.exam_checklist(user_id,server_version);

create table public.streak_shields (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null check(length(id) between 1 and 200),
  study_date date not null,
  extra jsonb not null default '{}'::jsonb check(jsonb_typeof(extra)='object'),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  server_version bigint not null check(server_version>0),
  primary key(user_id,id)
);
create index streak_shields_owner_version on public.streak_shields(user_id,server_version);


create table public.study_session_parts (
  user_id uuid not null, session_id text not null,
  position integer not null check(position between 0 and 6),
  part integer not null check(part between 1 and 7),
  correct integer not null check(correct>=0), total integer not null check(total>0),
  extra jsonb not null default '{}'::jsonb check(jsonb_typeof(extra)='object'),
  primary key(user_id,session_id,position),
  foreign key(user_id,session_id) references public.study_sessions(user_id,id) on delete cascade,
  check(correct<=total and total<=(array[6,25,39,30,30,16,54])[part])
);
create table public.weekly_plan_tasks (
  user_id uuid not null, week_id text not null, id text not null check(length(id) between 1 and 200),
  position integer not null check(position between 0 and 99),
  title text not null check(length(title) between 1 and 300),
  task_type text not null check(task_type in ('AUTO_FULL_TEST','AUTO_PART_PRACTICE','AUTO_STUDY_TIME','CUSTOM')),
  target numeric not null check(target>0 and target<=100000), unit text not null check(length(unit) between 1 and 50),
  part_number integer check(part_number between 1 and 7),
  manual_done numeric check(manual_done>=0 and manual_done::text not in ('NaN','Infinity','-Infinity')),
  is_completed boolean, notes text check(length(notes)<=4000),
  color text check(color in ('indigo','blue','amber','sky','rose','purple')),
  created_at timestamptz not null,
  extra jsonb not null default '{}'::jsonb check(jsonb_typeof(extra)='object'),
  primary key(user_id,week_id,id), unique(user_id,week_id,position),
  foreign key(user_id,week_id) references public.weekly_plans(user_id,id) on delete cascade
);
create table public.pacing_run_phases (
  user_id uuid not null, run_id text not null,
  position integer not null check(position between 0 and 99), name text not null check(length(name)<=200),
  planned_minutes numeric not null check(planned_minutes>=0 and planned_minutes::text not in ('NaN','Infinity','-Infinity')),
  actual_minutes numeric not null check(actual_minutes>=0 and actual_minutes::text not in ('NaN','Infinity','-Infinity')),
  overrun_minutes numeric not null check(overrun_minutes::text not in ('NaN','Infinity','-Infinity')),
  extra jsonb not null default '{}'::jsonb check(jsonb_typeof(extra)='object'),
  primary key(user_id,run_id,position),
  foreign key(user_id,run_id) references public.pacing_runs(user_id,id) on delete cascade
);
create index study_sessions_owner_date on public.study_sessions(user_id,study_date);
create index mistakes_owner_review on public.mistakes(user_id,status,next_review_date);
create index mistakes_owner_session on public.mistakes(user_id,session_id);
create index vocabulary_logs_owner_date on public.vocabulary_logs(user_id,study_date);

-- Private adapter: both migration and sync cross the same typed storage seam.
create function private.store_domain_record(p_owner_id uuid,p_entity_type text,p_record_id text,p_payload jsonb,
  p_updated_at timestamptz,p_deleted_at timestamptz,p_server_version bigint default null)
returns void language plpgsql security definer set search_path='' as $$
declare changed boolean; item jsonb; ordinal bigint; version bigint;
begin
  version := coalesce(p_server_version,nextval('public.sync_record_version'));
  case p_entity_type

  when 'profile' then
    insert into public.user_profiles as existing(user_id,id,name,target_score,exam_date,selected_skill,daily_goal_minutes,streak_freezes,shield_allowance,current_streak,longest_streak,last_study_date,motto,extra,updated_at,deleted_at,server_version)
    values(p_owner_id,p_record_id,coalesce(p_payload->>'name','Học viên'),coalesce((p_payload->>'targetScore')::integer,990),nullif(p_payload->>'examDate','')::date,coalesce(p_payload->>'selectedSkill','LR'),coalesce((p_payload->>'dailyMinGoalMinutes')::integer,30),coalesce((p_payload->>'streakFreezes')::integer,2),(p_payload->>'shieldAllowance')::integer,coalesce((p_payload->>'currentStreak')::integer,0),coalesce((p_payload->>'longestStreak')::integer,0),nullif(p_payload->>'lastStudyDate','')::date,coalesce(p_payload->>'motto',''),p_payload - array['currentStreak','dailyMinGoalMinutes','deletedAt','examDate','id','lastStudyDate','longestStreak','motto','name','selectedSkill','shieldAllowance','streakFreezes','targetScore','updatedAt'],p_updated_at,p_deleted_at,version)
    on conflict(user_id,id) do update set name=excluded.name,
      target_score=excluded.target_score,
      exam_date=excluded.exam_date,
      selected_skill=excluded.selected_skill,
      daily_goal_minutes=excluded.daily_goal_minutes,
      streak_freezes=excluded.streak_freezes,
      shield_allowance=excluded.shield_allowance,
      current_streak=excluded.current_streak,
      longest_streak=excluded.longest_streak,
      last_study_date=excluded.last_study_date,
      motto=excluded.motto,
      extra=excluded.extra,
      updated_at=excluded.updated_at,
      deleted_at=excluded.deleted_at,
      server_version=excluded.server_version
    where excluded.updated_at>existing.updated_at or (excluded.updated_at=existing.updated_at and excluded.deleted_at is not null and existing.deleted_at is null)
    returning true into changed;

  when 'sessions' then
    insert into public.study_sessions as existing(user_id,id,skill_type,session_type,test_name,study_date,duration_minutes,created_at,raw_listening,raw_reading,scaled_listening,scaled_reading,total_score,attempt_number,notes,part1_correct,part2_correct,part3_correct,part4_correct,part5_correct,part6_correct,part7_correct,has_practice_parts,extra,updated_at,deleted_at,server_version)
    values(p_owner_id,p_record_id,p_payload->>'skillType',p_payload->>'sessionType',p_payload->>'testName',nullif(p_payload->>'date','')::date,(p_payload->>'durationMinutes')::numeric,coalesce((p_payload->>'createdAt')::timestamptz,p_updated_at),(p_payload->>'rawListening')::integer,(p_payload->>'rawReading')::integer,(p_payload->>'scaledListening')::integer,(p_payload->>'scaledReading')::integer,(p_payload->>'totalScore')::integer,(p_payload->>'attemptNumber')::integer,p_payload->>'notes',(p_payload->'partScores'->>'part1')::integer,(p_payload->'partScores'->>'part2')::integer,(p_payload->'partScores'->>'part3')::integer,(p_payload->'partScores'->>'part4')::integer,(p_payload->'partScores'->>'part5')::integer,(p_payload->'partScores'->>'part6')::integer,(p_payload->'partScores'->>'part7')::integer,coalesce(jsonb_typeof(p_payload->'practiceParts')='array',false),p_payload - array['attemptNumber','createdAt','date','deletedAt','durationMinutes','id','notes','partScores','practiceParts','rawListening','rawReading','scaledListening','scaledReading','sessionType','skillType','testName','totalScore','updatedAt'],p_updated_at,p_deleted_at,version)
    on conflict(user_id,id) do update set skill_type=excluded.skill_type,
      session_type=excluded.session_type,
      test_name=excluded.test_name,
      study_date=excluded.study_date,
      duration_minutes=excluded.duration_minutes,
      created_at=excluded.created_at,
      raw_listening=excluded.raw_listening,
      raw_reading=excluded.raw_reading,
      scaled_listening=excluded.scaled_listening,
      scaled_reading=excluded.scaled_reading,
      total_score=excluded.total_score,
      attempt_number=excluded.attempt_number,
      notes=excluded.notes,
      part1_correct=excluded.part1_correct,
      part2_correct=excluded.part2_correct,
      part3_correct=excluded.part3_correct,
      part4_correct=excluded.part4_correct,
      part5_correct=excluded.part5_correct,
      part6_correct=excluded.part6_correct,
      part7_correct=excluded.part7_correct,
      has_practice_parts=excluded.has_practice_parts,
      extra=excluded.extra,
      updated_at=excluded.updated_at,
      deleted_at=excluded.deleted_at,
      server_version=excluded.server_version
    where excluded.updated_at>existing.updated_at or (excluded.updated_at=existing.updated_at and excluded.deleted_at is not null and existing.deleted_at is null)
    returning true into changed;

    if changed then
      delete from public.study_session_parts where user_id=p_owner_id and session_id=p_record_id;
      for item,ordinal in select value,ordinality from jsonb_array_elements(coalesce(p_payload->'practiceParts','[]'::jsonb)) with ordinality loop
        insert into public.study_session_parts(user_id,session_id,position,part,correct,total,extra)
        values(p_owner_id,p_record_id,ordinal-1,(item->>'part')::integer,(item->>'correct')::integer,(item->>'total')::integer,item-array['part','correct','total']);
      end loop;
    end if;

  when 'mistakes' then
    insert into public.mistakes as existing(user_id,id,part,category,status,question_context,user_mistake,correct_answer,trap_tip,options,tags,created_at,next_review_date,review_stage,review_count,last_reviewed_at,session_id,extra,updated_at,deleted_at,server_version)
    values(p_owner_id,p_record_id,(p_payload->>'part')::integer,p_payload->>'category',p_payload->>'status',p_payload->>'questionContext',p_payload->>'userMistake',p_payload->>'correctAnswer',p_payload->>'trapTip',case when jsonb_typeof(p_payload->'options')='array' then array(select jsonb_array_elements_text(p_payload->'options')) else null end,case when jsonb_typeof(p_payload->'tags')='array' then array(select jsonb_array_elements_text(p_payload->'tags')) else array[]::text[] end,coalesce((p_payload->>'createdAt')::timestamptz,p_updated_at),nullif(p_payload->>'nextReviewDate','')::date,(p_payload->>'reviewStage')::integer,(p_payload->>'reviewCount')::integer,(p_payload->>'lastReviewedAt')::timestamptz,p_payload->>'sessionId',p_payload - array['category','correctAnswer','createdAt','deletedAt','id','lastReviewedAt','nextReviewDate','options','part','questionContext','reviewCount','reviewStage','sessionId','status','tags','trapTip','updatedAt','userMistake'],p_updated_at,p_deleted_at,version)
    on conflict(user_id,id) do update set part=excluded.part,
      category=excluded.category,
      status=excluded.status,
      question_context=excluded.question_context,
      user_mistake=excluded.user_mistake,
      correct_answer=excluded.correct_answer,
      trap_tip=excluded.trap_tip,
      options=excluded.options,
      tags=excluded.tags,
      created_at=excluded.created_at,
      next_review_date=excluded.next_review_date,
      review_stage=excluded.review_stage,
      review_count=excluded.review_count,
      last_reviewed_at=excluded.last_reviewed_at,
      session_id=excluded.session_id,
      extra=excluded.extra,
      updated_at=excluded.updated_at,
      deleted_at=excluded.deleted_at,
      server_version=excluded.server_version
    where excluded.updated_at>existing.updated_at or (excluded.updated_at=existing.updated_at and excluded.deleted_at is not null and existing.deleted_at is null)
    returning true into changed;

  when 'vocabLog' then
    insert into public.vocabulary_logs as existing(user_id,id,study_date,word_count,extra,updated_at,deleted_at,server_version)
    values(p_owner_id,p_record_id,nullif(p_payload->>'date','')::date,(p_payload->>'count')::integer,p_payload - array['count','date','deletedAt','id','updatedAt'],p_updated_at,p_deleted_at,version)
    on conflict(user_id,id) do update set study_date=excluded.study_date,
      word_count=excluded.word_count,
      extra=excluded.extra,
      updated_at=excluded.updated_at,
      deleted_at=excluded.deleted_at,
      server_version=excluded.server_version
    where excluded.updated_at>existing.updated_at or (excluded.updated_at=existing.updated_at and excluded.deleted_at is not null and existing.deleted_at is null)
    returning true into changed;

  when 'weeklyPlans' then
    insert into public.weekly_plans as existing(user_id,id,week_key,extra,updated_at,deleted_at,server_version)
    values(p_owner_id,p_record_id,nullif(p_payload->>'weekKey','')::date,p_payload - array['deletedAt','id','tasks','updatedAt','weekKey'],p_updated_at,p_deleted_at,version)
    on conflict(user_id,id) do update set week_key=excluded.week_key,
      extra=excluded.extra,
      updated_at=excluded.updated_at,
      deleted_at=excluded.deleted_at,
      server_version=excluded.server_version
    where excluded.updated_at>existing.updated_at or (excluded.updated_at=existing.updated_at and excluded.deleted_at is not null and existing.deleted_at is null)
    returning true into changed;

    if changed then
      delete from public.weekly_plan_tasks where user_id=p_owner_id and week_id=p_record_id;
      for item,ordinal in select value,ordinality from jsonb_array_elements(p_payload->'tasks') with ordinality loop
        insert into public.weekly_plan_tasks(user_id,week_id,id,position,title,task_type,target,unit,part_number,manual_done,is_completed,notes,color,created_at,extra)
        values(p_owner_id,p_record_id,item->>'id',ordinal-1,item->>'title',item->>'type',(item->>'target')::numeric,item->>'unit',
          (item->>'partNumber')::integer,(item->>'manualDone')::numeric,(item->>'isCompleted')::boolean,item->>'notes',item->>'color',(item->>'createdAt')::timestamptz,
          item-array['id','title','type','target','unit','partNumber','manualDone','isCompleted','notes','color','createdAt']);
      end loop;
    end if;

  when 'pacingRuns' then
    insert into public.pacing_runs as existing(user_id,id,preset_id,preset_name,study_date,planned_minutes,actual_minutes,finished_naturally,created_at,extra,updated_at,deleted_at,server_version)
    values(p_owner_id,p_record_id,p_payload->>'presetId',p_payload->>'presetName',nullif(p_payload->>'date','')::date,(p_payload->>'plannedMinutes')::numeric,(p_payload->>'actualMinutes')::numeric,(p_payload->>'finishedNaturally')::boolean,coalesce((p_payload->>'createdAt')::timestamptz,p_updated_at),p_payload - array['actualMinutes','createdAt','date','deletedAt','finishedNaturally','id','phases','plannedMinutes','presetId','presetName','updatedAt'],p_updated_at,p_deleted_at,version)
    on conflict(user_id,id) do update set preset_id=excluded.preset_id,
      preset_name=excluded.preset_name,
      study_date=excluded.study_date,
      planned_minutes=excluded.planned_minutes,
      actual_minutes=excluded.actual_minutes,
      finished_naturally=excluded.finished_naturally,
      created_at=excluded.created_at,
      extra=excluded.extra,
      updated_at=excluded.updated_at,
      deleted_at=excluded.deleted_at,
      server_version=excluded.server_version
    where excluded.updated_at>existing.updated_at or (excluded.updated_at=existing.updated_at and excluded.deleted_at is not null and existing.deleted_at is null)
    returning true into changed;

    if changed then
      delete from public.pacing_run_phases where user_id=p_owner_id and run_id=p_record_id;
      for item,ordinal in select value,ordinality from jsonb_array_elements(p_payload->'phases') with ordinality loop
        insert into public.pacing_run_phases(user_id,run_id,position,name,planned_minutes,actual_minutes,overrun_minutes,extra)
        values(p_owner_id,p_record_id,ordinal-1,item->>'name',(item->>'plannedMinutes')::numeric,(item->>'actualMinutes')::numeric,(item->>'overrunMinutes')::numeric,
          item-array['name','plannedMinutes','actualMinutes','overrunMinutes']);
      end loop;
    end if;

  when 'checklist' then
    insert into public.exam_checklist as existing(user_id,id,checked,extra,updated_at,deleted_at,server_version)
    values(p_owner_id,p_record_id,(p_payload->>'checked')::boolean,p_payload - array['checked','deletedAt','id','updatedAt'],p_updated_at,p_deleted_at,version)
    on conflict(user_id,id) do update set checked=excluded.checked,
      extra=excluded.extra,
      updated_at=excluded.updated_at,
      deleted_at=excluded.deleted_at,
      server_version=excluded.server_version
    where excluded.updated_at>existing.updated_at or (excluded.updated_at=existing.updated_at and excluded.deleted_at is not null and existing.deleted_at is null)
    returning true into changed;

  when 'shieldDays' then
    insert into public.streak_shields as existing(user_id,id,study_date,extra,updated_at,deleted_at,server_version)
    values(p_owner_id,p_record_id,nullif(p_payload->>'date','')::date,p_payload - array['date','deletedAt','id','updatedAt'],p_updated_at,p_deleted_at,version)
    on conflict(user_id,id) do update set study_date=excluded.study_date,
      extra=excluded.extra,
      updated_at=excluded.updated_at,
      deleted_at=excluded.deleted_at,
      server_version=excluded.server_version
    where excluded.updated_at>existing.updated_at or (excluded.updated_at=existing.updated_at and excluded.deleted_at is not null and existing.deleted_at is null)
    returning true into changed;

  else raise exception 'Unknown entity type';
  end case;
end;
$$;
revoke all on function private.store_domain_record(uuid,text,text,jsonb,timestamptz,timestamptz,bigint) from public,anon,authenticated;

-- Backfill while the old table is locked. Invalid legacy rows abort the whole
-- transaction; no source rows are discarded or silently rewritten.
do $$
declare item record;
begin
  for item in select * from public.sync_records order by user_id,case entity_type when 'profile' then 0 when 'sessions' then 1 else 2 end loop
    perform private.store_domain_record(item.user_id,item.entity_type,item.record_id,item.payload,item.updated_at,item.deleted_at,item.server_version);
  end loop;
end;
$$;
update public.mistakes as m set linked_session_id=s.id from public.study_sessions as s
  where m.user_id=s.user_id and m.session_id=s.id;
set constraints all immediate;
alter table public.sync_records rename to sync_records_legacy;
revoke all on public.sync_records_legacy from anon,authenticated,service_role;

-- Compatibility projection. Business tables are the source of truth; the
-- transport still receives the JSON shape understood by existing browsers.
create view public.sync_records with (security_invoker=true) as

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
  r.updated_at,r.deleted_at,r.server_version from public.streak_shields r;


create view public.exam_history with (security_invoker=true) as
  select * from public.study_sessions where session_type='FULL_TEST' and deleted_at is null;

create function private.reject_legacy_write() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'Legacy storage is frozen; retry through the current FastAPI sync interface'; end;
$$;
create trigger freeze_legacy before insert or update on public.sync_records_legacy
  for each row execute function private.reject_legacy_write();

-- Operator edits also get versions. Hard deletes become tombstones, except
-- during Auth user deletion, where FK cascades must remove all retained copies.
create function private.stamp_domain_record() returns trigger language plpgsql security definer set search_path='' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text,20261005));
  if tg_op='UPDATE' and (new.user_id is distinct from old.user_id or new.id is distinct from old.id) then raise exception 'Record identity is immutable'; end if;
  if tg_table_name='mistakes' then
    select id into new.linked_session_id from public.study_sessions where user_id=new.user_id and id=new.session_id;
  end if;
  if coalesce(current_setting('toeic.domain_sync',true),'')<>'on' then
    new.updated_at := case when tg_op='UPDATE' then greatest(clock_timestamp(),old.updated_at+interval '1 millisecond') else coalesce(new.updated_at,clock_timestamp()) end;
    new.server_version := nextval('public.sync_record_version');
  end if;
  return new;
end;
$$;
create function private.soft_delete_domain_record() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if not exists(select 1 from auth.users where id=old.user_id) then return old; end if;
  execute format('update public.%I set deleted_at=clock_timestamp() where user_id=$1 and id=$2',tg_table_name) using old.user_id,old.id;
  return null;
end;
$$;
create function private.touch_domain_parent() returns trigger language plpgsql security definer set search_path='' as $$
declare row_value jsonb; parent_id text; owner_id uuid;
begin
  if coalesce(current_setting('toeic.domain_sync',true),'')='on' then return null; end if;
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

alter table public.user_profiles enable row level security;
revoke all on public.user_profiles from anon,authenticated;
grant select on public.user_profiles to authenticated;
grant all on public.user_profiles to service_role;
create policy "Permanent owner reads user_profiles" on public.user_profiles for select to authenticated using (user_id=(select auth.uid()) and coalesce((select auth.jwt()->>'is_anonymous')::boolean,false)=false);

alter table public.study_sessions enable row level security;
revoke all on public.study_sessions from anon,authenticated;
grant select on public.study_sessions to authenticated;
grant all on public.study_sessions to service_role;
create policy "Permanent owner reads study_sessions" on public.study_sessions for select to authenticated using (user_id=(select auth.uid()) and coalesce((select auth.jwt()->>'is_anonymous')::boolean,false)=false);

alter table public.mistakes enable row level security;
revoke all on public.mistakes from anon,authenticated;
grant select on public.mistakes to authenticated;
grant all on public.mistakes to service_role;
create policy "Permanent owner reads mistakes" on public.mistakes for select to authenticated using (user_id=(select auth.uid()) and coalesce((select auth.jwt()->>'is_anonymous')::boolean,false)=false);

alter table public.vocabulary_logs enable row level security;
revoke all on public.vocabulary_logs from anon,authenticated;
grant select on public.vocabulary_logs to authenticated;
grant all on public.vocabulary_logs to service_role;
create policy "Permanent owner reads vocabulary_logs" on public.vocabulary_logs for select to authenticated using (user_id=(select auth.uid()) and coalesce((select auth.jwt()->>'is_anonymous')::boolean,false)=false);

alter table public.weekly_plans enable row level security;
revoke all on public.weekly_plans from anon,authenticated;
grant select on public.weekly_plans to authenticated;
grant all on public.weekly_plans to service_role;
create policy "Permanent owner reads weekly_plans" on public.weekly_plans for select to authenticated using (user_id=(select auth.uid()) and coalesce((select auth.jwt()->>'is_anonymous')::boolean,false)=false);

alter table public.pacing_runs enable row level security;
revoke all on public.pacing_runs from anon,authenticated;
grant select on public.pacing_runs to authenticated;
grant all on public.pacing_runs to service_role;
create policy "Permanent owner reads pacing_runs" on public.pacing_runs for select to authenticated using (user_id=(select auth.uid()) and coalesce((select auth.jwt()->>'is_anonymous')::boolean,false)=false);

alter table public.exam_checklist enable row level security;
revoke all on public.exam_checklist from anon,authenticated;
grant select on public.exam_checklist to authenticated;
grant all on public.exam_checklist to service_role;
create policy "Permanent owner reads exam_checklist" on public.exam_checklist for select to authenticated using (user_id=(select auth.uid()) and coalesce((select auth.jwt()->>'is_anonymous')::boolean,false)=false);

alter table public.streak_shields enable row level security;
revoke all on public.streak_shields from anon,authenticated;
grant select on public.streak_shields to authenticated;
grant all on public.streak_shields to service_role;
create policy "Permanent owner reads streak_shields" on public.streak_shields for select to authenticated using (user_id=(select auth.uid()) and coalesce((select auth.jwt()->>'is_anonymous')::boolean,false)=false);

alter table public.study_session_parts enable row level security;
revoke all on public.study_session_parts from anon,authenticated;
grant select on public.study_session_parts to authenticated;
grant all on public.study_session_parts to service_role;
create policy "Permanent owner reads study_session_parts" on public.study_session_parts for select to authenticated using (user_id=(select auth.uid()) and coalesce((select auth.jwt()->>'is_anonymous')::boolean,false)=false);

alter table public.weekly_plan_tasks enable row level security;
revoke all on public.weekly_plan_tasks from anon,authenticated;
grant select on public.weekly_plan_tasks to authenticated;
grant all on public.weekly_plan_tasks to service_role;
create policy "Permanent owner reads weekly_plan_tasks" on public.weekly_plan_tasks for select to authenticated using (user_id=(select auth.uid()) and coalesce((select auth.jwt()->>'is_anonymous')::boolean,false)=false);

alter table public.pacing_run_phases enable row level security;
revoke all on public.pacing_run_phases from anon,authenticated;
grant select on public.pacing_run_phases to authenticated;
grant all on public.pacing_run_phases to service_role;
create policy "Permanent owner reads pacing_run_phases" on public.pacing_run_phases for select to authenticated using (user_id=(select auth.uid()) and coalesce((select auth.jwt()->>'is_anonymous')::boolean,false)=false);

create trigger stamp_record before insert or update on public.user_profiles for each row execute function private.stamp_domain_record();
create trigger tombstone_record before delete on public.user_profiles for each row execute function private.soft_delete_domain_record();

create trigger stamp_record before insert or update on public.study_sessions for each row execute function private.stamp_domain_record();
create trigger tombstone_record before delete on public.study_sessions for each row execute function private.soft_delete_domain_record();

create trigger stamp_record before insert or update on public.mistakes for each row execute function private.stamp_domain_record();
create trigger tombstone_record before delete on public.mistakes for each row execute function private.soft_delete_domain_record();

create trigger stamp_record before insert or update on public.vocabulary_logs for each row execute function private.stamp_domain_record();
create trigger tombstone_record before delete on public.vocabulary_logs for each row execute function private.soft_delete_domain_record();

create trigger stamp_record before insert or update on public.weekly_plans for each row execute function private.stamp_domain_record();
create trigger tombstone_record before delete on public.weekly_plans for each row execute function private.soft_delete_domain_record();

create trigger stamp_record before insert or update on public.pacing_runs for each row execute function private.stamp_domain_record();
create trigger tombstone_record before delete on public.pacing_runs for each row execute function private.soft_delete_domain_record();

create trigger stamp_record before insert or update on public.exam_checklist for each row execute function private.stamp_domain_record();
create trigger tombstone_record before delete on public.exam_checklist for each row execute function private.soft_delete_domain_record();

create trigger stamp_record before insert or update on public.streak_shields for each row execute function private.stamp_domain_record();
create trigger tombstone_record before delete on public.streak_shields for each row execute function private.soft_delete_domain_record();

create trigger touch_parent after insert or update or delete on public.study_session_parts for each row execute function private.touch_domain_parent('study_sessions','session_id');

create trigger touch_parent after insert or update or delete on public.weekly_plan_tasks for each row execute function private.touch_domain_parent('weekly_plans','week_id');

create trigger touch_parent after insert or update or delete on public.pacing_run_phases for each row execute function private.touch_domain_parent('pacing_runs','run_id');

revoke all on public.sync_records,public.exam_history from anon,authenticated;
grant select on public.sync_records,public.exam_history to authenticated,service_role;
revoke all on all functions in schema private from public,anon,authenticated;

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
  perform set_config('toeic.domain_sync','on',true);
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



-- Retire the v1 generic write interface, retaining its signature for diagnostics.
create or replace function public.apply_sync_records(p_records jsonb,p_replace boolean default false)
returns void language plpgsql set search_path='' as $$
begin raise exception 'Use the FastAPI sync interface'; end;
$$;
revoke all on function public.apply_sync_records(jsonb,boolean) from public,anon,authenticated,service_role;
comment on view public.sync_records is 'Compatibility projection only. Business data lives in the native tables.';
comment on view public.exam_history is 'Full Test sessions; no duplicate copy of study results.';
comment on table public.sync_records_legacy is 'Frozen migration backup. Auth account deletion still cascades into it.';
comment on column public.mistakes.linked_session_id is 'Owned session FK when available. session_id retains historical references absent from imports.';
notify pgrst,'reload schema';
commit;
