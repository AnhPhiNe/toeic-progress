"""Generate the explicit SQL adapter behind the existing sync interface."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def field(column, key, definition, expression=None):
    expression = expression or f"(p_payload->>'{key}')::{definition.split()[0]}"
    return column, key, definition, expression


def text(column, key, maximum=None, required=False, default=None):
    definition = 'text' + (' not null' if required else '')
    if maximum:
        definition += f' check(length({column}) <= {maximum})'
    expression = f"p_payload->>'{key}'"
    if default is not None:
        expression = f"coalesce({expression},'{default}')"
    return field(column, key, definition, expression)


def integer(column, key, lower, upper=None, default=None, required=False):
    bounds = f'{column}>={lower}' + (f' and {column}<={upper}' if upper is not None else '')
    definition = 'integer' + (f' default {default}' if default is not None else '') + (' not null' if required else '') + f' check({bounds})'
    expression = f"(p_payload->>'{key}')::integer"
    if default is not None:
        expression = f'coalesce({expression},{default})'
    return field(column, key, definition, expression)


def number(column, key, lower=0, upper=None, required=True):
    bounds = f'{column}>={lower}' + (f' and {column}<={upper}' if upper is not None else '')
    definition = 'numeric' + (' not null' if required else '') + f" check({bounds} and {column}::text not in ('NaN','Infinity','-Infinity'))"
    return field(column, key, definition)


def enum(column, key, values, default=None, required=True):
    choices = ','.join(f"'{value}'" for value in values)
    definition = 'text' + (' not null' if required else '') + f' check({column} in ({choices}))'
    expression = f"p_payload->>'{key}'"
    if default is not None:
        expression = f"coalesce({expression},'{default}')"
    return field(column, key, definition, expression)


def day(column, key, required=True):
    return field(column, key, 'date' + (' not null' if required else ''), f"nullif(p_payload->>'{key}','')::date")


def instant(column, key, required=True):
    expression = f"(p_payload->>'{key}')::timestamptz"
    if required:
        expression = f'coalesce({expression},p_updated_at)'
    return field(column, key, 'timestamptz' + (' not null' if required else ''), expression)


def array(column, key, required=False, maximum=20):
    expression = f"case when jsonb_typeof(p_payload->'{key}')='array' then array(select jsonb_array_elements_text(p_payload->'{key}')) else {'array[]::text[]' if required else 'null'} end"
    return field(column, key, 'text[]' + (' not null' if required else '') + f' check(cardinality({column})<={maximum})', expression)


parts = [6, 25, 39, 30, 30, 16, 54]
tables = {
    'profile': ('user_profiles', [
        text('name', 'name', 100, True, 'Học viên'), integer('target_score', 'targetScore', 10, 990, 990, True),
        day('exam_date', 'examDate', False), enum('selected_skill', 'selectedSkill', ['LR', 'SW'], 'LR'),
        integer('daily_goal_minutes', 'dailyMinGoalMinutes', 1, 1440, 30, True),
        integer('streak_freezes', 'streakFreezes', 0, 5, 2, True), integer('shield_allowance', 'shieldAllowance', 0),
        integer('current_streak', 'currentStreak', 0, default=0, required=True), integer('longest_streak', 'longestStreak', 0, default=0, required=True),
        day('last_study_date', 'lastStudyDate', False), text('motto', 'motto', 2000, True, ''),
    ]),
    'sessions': ('study_sessions', [
        enum('skill_type', 'skillType', ['LR', 'SW']), enum('session_type', 'sessionType', ['FULL_TEST', 'PART_PRACTICE']),
        text('test_name', 'testName', 300, True), day('study_date', 'date'), number('duration_minutes', 'durationMinutes', 0, 1440),
        instant('created_at', 'createdAt'), integer('raw_listening', 'rawListening', 0, 100), integer('raw_reading', 'rawReading', 0, 100),
        integer('scaled_listening', 'scaledListening', 0, 495), integer('scaled_reading', 'scaledReading', 0, 495),
        integer('total_score', 'totalScore', 0, 990), integer('attempt_number', 'attemptNumber', 1), text('notes', 'notes', 16000),
        *[field(f'part{i}_correct', f'part{i}', f'integer check(part{i}_correct between 0 and {maximum})', f"(p_payload->'partScores'->>'part{i}')::integer") for i, maximum in enumerate(parts, 1)],
        field('has_practice_parts', 'practiceParts', 'boolean not null', "coalesce(jsonb_typeof(p_payload->'practiceParts')='array',false)"),
    ]),
    'mistakes': ('mistakes', [
        integer('part', 'part', 1, 7, required=True),
        enum('category', 'category', ['VOCABULARY_TRAP','ADVANCED_GRAMMAR','LISTENING_SPEED','TIME_PRESSURE','CARELESS_DISTRACTION','OTHER']),
        enum('status', 'status', ['NEEDS_REVIEW','MASTERED']), text('question_context', 'questionContext', 16000, True),
        text('user_mistake', 'userMistake', 4000, True), text('correct_answer', 'correctAnswer', 2000, True),
        text('trap_tip', 'trapTip', 4000), array('options', 'options', maximum=4), array('tags', 'tags', True), instant('created_at', 'createdAt'),
        day('next_review_date', 'nextReviewDate', False), integer('review_stage', 'reviewStage', 0), integer('review_count', 'reviewCount', 0),
        instant('last_reviewed_at', 'lastReviewedAt', False), text('session_id', 'sessionId', 200),
    ]),
    'vocabLog': ('vocabulary_logs', [day('study_date', 'date'), integer('word_count', 'count', 1, 10000, required=True)]),
    'weeklyPlans': ('weekly_plans', [day('week_key', 'weekKey')]),
    'pacingRuns': ('pacing_runs', [text('preset_id','presetId',required=True), text('preset_name','presetName',required=True), day('study_date','date'),
        number('planned_minutes','plannedMinutes'), number('actual_minutes','actualMinutes'),
        field('finished_naturally','finishedNaturally','boolean not null'), instant('created_at','createdAt')]),
    'checklist': ('exam_checklist', [field('checked','checked','boolean not null')]),
    'shieldDays': ('streak_shields', [day('study_date','date')]),
}

sql = ["""-- Native business tables behind the existing /api/v1/sync interface.
-- Apply once, after the first two migrations. Entire migration is atomic.
begin;
lock table public.sync_records in access exclusive mode;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to service_role;
"""]

for entity, (table, fields) in tables.items():
    columns = [f'  {column} {definition}' for column, _, definition, _ in fields]
    if entity == 'mistakes':
        columns.append('  linked_session_id text')
    constraints = []
    if entity == 'profile':
        constraints += ["check(id='profile')", 'check(deleted_at is null)']
    if entity == 'weeklyPlans':
        constraints += ['check(id=week_key::text and extract(isodow from week_key)=1)']
    if entity == 'sessions':
        all_null = ' and '.join(f'part{i}_correct is null' for i in range(1, 8))
        all_set = ' and '.join(f'part{i}_correct is not null' for i in range(1, 8))
        constraints += [f'check(({all_null}) or ({all_set}))']
    if entity == 'mistakes':
        constraints += ['foreign key(user_id,linked_session_id) references public.study_sessions(user_id,id) deferrable initially deferred',
                        'check(linked_session_id is null or linked_session_id=session_id)']
    sql.append(f"create table public.{table} (\n  user_id uuid not null references auth.users(id) on delete cascade,\n  id text not null check(length(id) between 1 and 200),\n" + ',\n'.join(columns) + ",\n  extra jsonb not null default '{}'::jsonb check(jsonb_typeof(extra)='object'),\n  updated_at timestamptz not null,\n  deleted_at timestamptz,\n  server_version bigint not null check(server_version>0),\n  primary key(user_id,id)" + ''.join(',\n  '+item for item in constraints) + f"\n);\ncreate index {table}_owner_version on public.{table}(user_id,server_version);\n")

sql.append("""
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
""")

for entity, (table, fields) in tables.items():
    columns = [column for column, _, _, _ in fields]
    expressions = [expression for _, _, _, expression in fields]
    keys = {key for _, key, _, _ in fields} | {'id', 'updatedAt', 'deletedAt'}
    if entity == 'sessions':
        keys -= {f'part{i}' for i in range(1, 8)}
        keys.add('partScores')
    if entity == 'weeklyPlans':
        keys.add('tasks')
    if entity == 'pacingRuns':
        keys.add('phases')
    strip = ','.join(f"'{key}'" for key in sorted(keys))
    names = ['user_id','id',*columns,'extra','updated_at','deleted_at','server_version']
    values = ['p_owner_id','p_record_id',*expressions,f'p_payload - array[{strip}]','p_updated_at','p_deleted_at','version']
    update = ',\n      '.join(f'{column}=excluded.{column}' for column in [*columns,'extra','updated_at','deleted_at','server_version'])
    sql.append(f"  when '{entity}' then\n    insert into public.{table} as existing({','.join(names)})\n    values({','.join(values)})\n    on conflict(user_id,id) do update set {update}\n    where excluded.updated_at>existing.updated_at or (excluded.updated_at=existing.updated_at and excluded.deleted_at is not null and existing.deleted_at is null)\n    returning true into changed;\n")
    if entity == 'sessions':
        sql.append("""    if changed then
      delete from public.study_session_parts where user_id=p_owner_id and session_id=p_record_id;
      for item,ordinal in select value,ordinality from jsonb_array_elements(coalesce(p_payload->'practiceParts','[]'::jsonb)) with ordinality loop
        insert into public.study_session_parts(user_id,session_id,position,part,correct,total,extra)
        values(p_owner_id,p_record_id,ordinal-1,(item->>'part')::integer,(item->>'correct')::integer,(item->>'total')::integer,item-array['part','correct','total']);
      end loop;
    end if;
""")
    elif entity == 'weeklyPlans':
        sql.append("""    if changed then
      delete from public.weekly_plan_tasks where user_id=p_owner_id and week_id=p_record_id;
      for item,ordinal in select value,ordinality from jsonb_array_elements(p_payload->'tasks') with ordinality loop
        insert into public.weekly_plan_tasks(user_id,week_id,id,position,title,task_type,target,unit,part_number,manual_done,is_completed,notes,color,created_at,extra)
        values(p_owner_id,p_record_id,item->>'id',ordinal-1,item->>'title',item->>'type',(item->>'target')::numeric,item->>'unit',
          (item->>'partNumber')::integer,(item->>'manualDone')::numeric,(item->>'isCompleted')::boolean,item->>'notes',item->>'color',(item->>'createdAt')::timestamptz,
          item-array['id','title','type','target','unit','partNumber','manualDone','isCompleted','notes','color','createdAt']);
      end loop;
    end if;
""")
    elif entity == 'pacingRuns':
        sql.append("""    if changed then
      delete from public.pacing_run_phases where user_id=p_owner_id and run_id=p_record_id;
      for item,ordinal in select value,ordinality from jsonb_array_elements(p_payload->'phases') with ordinality loop
        insert into public.pacing_run_phases(user_id,run_id,position,name,planned_minutes,actual_minutes,overrun_minutes,extra)
        values(p_owner_id,p_record_id,ordinal-1,item->>'name',(item->>'plannedMinutes')::numeric,(item->>'actualMinutes')::numeric,(item->>'overrunMinutes')::numeric,
          item-array['name','plannedMinutes','actualMinutes','overrunMinutes']);
      end loop;
    end if;
""")

sql.append("""  else raise exception 'Unknown entity type';
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
""")

views = []
for entity, (table, fields) in tables.items():
    pairs = []
    if entity != 'profile':
        pairs += ["'id'", 'r.id']
    for column, key, _, _ in fields:
        if key in ['practiceParts', *[f'part{i}' for i in range(1, 8)]]:
            continue
        value = f'r.{column}'
        if entity == 'profile' and key in ('examDate','lastStudyDate'):
            value = f"coalesce(r.{column}::text,'')"
        pairs += [f"'{key}'",value]
    if entity == 'sessions':
        part_pairs = ','.join(f"'part{i}',r.part{i}_correct" for i in range(1, 8))
        pairs += ["'partScores'",f'case when r.part1_correct is not null then jsonb_build_object({part_pairs}) end']
        pairs += ["'practiceParts'", "case when r.has_practice_parts then coalesce((select jsonb_agg(p.extra||jsonb_build_object('part',p.part,'correct',p.correct,'total',p.total) order by p.position) from public.study_session_parts p where p.user_id=r.user_id and p.session_id=r.id),'[]'::jsonb) end"]
    if entity == 'weeklyPlans':
        pairs += ["'tasks'", "coalesce((select jsonb_agg(t.extra||jsonb_strip_nulls(jsonb_build_object('id',t.id,'title',t.title,'type',t.task_type,'target',t.target,'unit',t.unit,'partNumber',t.part_number,'manualDone',t.manual_done,'isCompleted',t.is_completed,'notes',t.notes,'color',t.color,'createdAt',t.created_at)) order by t.position) from public.weekly_plan_tasks t where t.user_id=r.user_id and t.week_id=r.id),'[]'::jsonb)"]
    if entity == 'pacingRuns':
        pairs += ["'phases'", "coalesce((select jsonb_agg(p.extra||jsonb_build_object('name',p.name,'plannedMinutes',p.planned_minutes,'actualMinutes',p.actual_minutes,'overrunMinutes',p.overrun_minutes) order by p.position) from public.pacing_run_phases p where p.user_id=r.user_id and p.run_id=r.id),'[]'::jsonb)"]
    views.append(f"select r.user_id,'{entity}'::text as entity_type,r.id as record_id,\n  r.extra||jsonb_strip_nulls(jsonb_build_object({','.join(pairs)})) as payload,\n  r.updated_at,r.deleted_at,r.server_version from public.{table} r")
sql.append('\nunion all\n'.join(views)+';\n')
sql.append("""
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
""")

main_tables = [name for name, _ in tables.values()]
child_tables = ['study_session_parts','weekly_plan_tasks','pacing_run_phases']
for table in main_tables + child_tables:
    sql.append(f"alter table public.{table} enable row level security;\nrevoke all on public.{table} from anon,authenticated;\ngrant select on public.{table} to authenticated;\ngrant all on public.{table} to service_role;\ncreate policy \"Permanent owner reads {table}\" on public.{table} for select to authenticated using (user_id=(select auth.uid()) and coalesce((select auth.jwt()->>'is_anonymous')::boolean,false)=false);\n")
for table in main_tables:
    sql.append(f"create trigger stamp_record before insert or update on public.{table} for each row execute function private.stamp_domain_record();\ncreate trigger tombstone_record before delete on public.{table} for each row execute function private.soft_delete_domain_record();\n")
for child, parent, column in [('study_session_parts','study_sessions','session_id'),('weekly_plan_tasks','weekly_plans','week_id'),('pacing_run_phases','pacing_runs','run_id')]:
    sql.append(f"create trigger touch_parent after insert or update or delete on public.{child} for each row execute function private.touch_domain_parent('{parent}','{column}');\n")
sql.append("revoke all on public.sync_records,public.exam_history from anon,authenticated;\ngrant select on public.sync_records,public.exam_history to authenticated,service_role;\nrevoke all on all functions in schema private from public,anon,authenticated;\n")

# Preserve the sync ordering/version rules while moving physical writes behind
# the private adapter. Reading through the compatibility view keeps cursors safe.
old = (ROOT / 'supabase/migrations/20261005000000_fastapi_backend.sql').read_text(encoding='utf-8')
start = old.index('create or replace function public.sync_account_records(')
end = old.index('create table public.ai_usage_counters', start)
sync = old[start:end]
sync = sync.replace('  -- Serializes writes', "  perform set_config('toeic.domain_sync','on',true);\n  -- Serializes writes", 1)
write_start = sync.index('    insert into public.sync_records as existing')
write_end = sync.index('\n  end loop;', write_start)
sync = sync[:write_start] + '    perform private.store_domain_record(p_owner_id,item->>\'entity_type\',item->>\'record_id\',item->\'payload\',stamp,removed);' + sync[write_end:]
replace_start = sync.index('    update public.sync_records as existing')
replace_end = sync.index('\n  end if;', replace_start)
sync = sync[:replace_start] + """    for item in select to_jsonb(existing) from public.sync_records as existing where existing.user_id=p_owner_id and not exists(
      select 1 from jsonb_array_elements(p_records) as supplied
      where supplied->>'entity_type'=existing.entity_type and supplied->>'record_id'=existing.record_id) loop
      perform private.store_domain_record(p_owner_id,item->>'entity_type',item->>'record_id',item->'payload',override_at,override_at);
    end loop;""" + sync[replace_end:]
sync = sync.replace("  return jsonb_build_object('cursor',latest,'records',response_rows,'hasRecords',latest>0);", "  perform set_config('toeic.domain_sync','off',true);\n  return jsonb_build_object('cursor',latest,'records',response_rows,'hasRecords',latest>0);")
link = """  update public.mistakes as m set linked_session_id=s.id from public.study_sessions as s
    where m.user_id=p_owner_id and s.user_id=m.user_id and m.session_id=s.id and m.linked_session_id is distinct from s.id;
"""
sync = sync.replace('  select coalesce(max(server_version),0) into latest', link+'  select coalesce(max(server_version),0) into latest')
sql.append(sync)
sql.append("""
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
""")

path = (ROOT / 'supabase/migrations/20261006000000_domain_tables.sql')
path.write_text('\n'.join(sql), encoding='utf-8')
print(f'Generated {path}: {len(main_tables)} business tables, {len(child_tables)} child tables.')
