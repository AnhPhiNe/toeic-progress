"""Generate the migration that removes deleted content and retains only sync identity."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

previous = (ROOT / 'supabase/migrations/20261006000000_domain_tables.sql').read_text(encoding='utf-8')
tables = {
    'sessions': 'study_sessions', 'mistakes': 'mistakes', 'vocabLog': 'vocabulary_logs',
    'weeklyPlans': 'weekly_plans', 'pacingRuns': 'pacing_runs', 'checklist': 'exam_checklist', 'shieldDays': 'streak_shields',
}
sql = ["""-- Permanent content deletion, with minimal tombstones for cross-device sync.
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
"""]

# Purging child rows must not touch surviving parents or resurrect their content.
touch_start = previous.index('create function private.touch_domain_parent()')
touch_end = previous.index('\n$$;', touch_start) + len('\n$$;')
touch = previous[touch_start:touch_end].replace('create function', 'create or replace function', 1)
touch = touch.replace("  if coalesce(current_setting('toeic.domain_sync',true),'')='on' then", "  if coalesce(current_setting('toeic.domain_sync',true),'')='on' or coalesce(current_setting('toeic.purge',true),'')='on' then")
sql.append(touch)
sql.append("""
create function private.purge_domain_content(p_owner_id uuid,p_entity_type text,p_record_id text,
  p_updated_at timestamptz,p_deleted_at timestamptz,p_server_version bigint)
returns void language plpgsql security definer set search_path='' as $$
declare target_table text; previous_mode text;
begin
  target_table := case p_entity_type
""" + '\n'.join(f"    when '{entity}' then '{table}'" for entity, table in tables.items()) + """
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
""")

view_start = previous.index('create view public.sync_records with (security_invoker=true) as')
view_end = previous.index('\ncreate view public.exam_history', view_start)
view = previous[view_start:view_end].rstrip().removesuffix(';').replace('create view', 'create or replace view', 1)
sql.append(view + """
union all
select user_id,entity_type,record_id,jsonb_build_object('id',record_id) as payload,
  updated_at,deleted_at,server_version from public.sync_tombstones;
""")

sql.append("""
create function private.compact_deleted_domain_record() returns trigger language plpgsql security definer set search_path='' as $$
declare entity text;
begin
  if new.deleted_at is null then return null; end if;
  entity := case tg_table_name
""" + '\n'.join(f"    when '{table}' then '{entity}'" for entity, table in tables.items()) + """
    end;
  perform private.purge_domain_content(new.user_id,entity,new.id,new.updated_at,new.deleted_at,new.server_version);
  return null;
end;
$$;
""")
for table in tables.values():
    sql.append(f"create trigger compact_deleted_record after insert or update on public.{table} for each row execute function private.compact_deleted_domain_record();")

sql.append("""
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
""")

sync_start = previous.index('create or replace function public.sync_account_records(')
sync_end = previous.index('-- Retire the v1 generic write interface', sync_start)
sync = previous[sync_start:sync_end]
sync = sync.replace('  response_rows jsonb;', '  response_rows jsonb;\n  reset_version bigint := 0;\n  reset_barrier boolean := false;')
lock = "  perform pg_advisory_xact_lock(hashtextextended(p_owner_id::text, 20261005));"
sync = sync.replace(lock,lock + """
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
""",1)
sql.append(sync)

sql.append("""
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
""")
destination = (ROOT / 'supabase/migrations/20261006010000_purge_deleted_content.sql')
destination.write_text('\n'.join(sql),encoding='utf-8')
print(f'Generated {destination}')
