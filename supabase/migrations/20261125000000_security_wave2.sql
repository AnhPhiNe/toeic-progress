-- Security wave 2 (applies on top of 20261124000000_pending_deletions).
--
--   S-07  `extra` is bounded (size and depth) on every synced table, and sync
--         replies are paged (1000 rows / 2 MiB): sync_snapshot never builds one
--         unbounded jsonb_agg. Clients follow `hasMore` with public.sync_page.
--   S-08  A tombstone for a record the server never had is a no-op (echoed back
--         so the device stops re-sending it). reset_learning_data erases without
--         tombstones and drops old ones. Tombstones older than 180 days (and any
--         above 10,000 per account) are purged; a per-account floor makes a device
--         that slept past a purge take a full snapshot. Only live records count
--         toward the 10,000-record limit.
--   S-09  Stars are computed here from the synced rows (offline-friendly): any
--         study_date in the league week, not before the member joined, not in
--         the future; each row carries an immutable server first_synced_at, so an
--         old record cannot be re-dated into this week. Plausibility caps:
--         60 stars a day, at most 3 full tests (each >= 15 minutes), 5 practices
--         and 5 bakery runs a day. Standings are recounted on every sync, on
--         reset and right before a week is finalised (no ghost stars).
--   S-10  The week comes from the database clock, never from the caller; a stale
--         p_week is refused. A finished week is finalised only after the grace
--         window (Monday 12:00 Asia/Ho_Chi_Minh) so late offline syncs still
--         count, by run_maintenance (lazily, bounded, by a GET when it is late).
--         One lock order everywhere: account lock, then the league lock (shared
--         for in-week work, exclusive to finalise), then member row, then
--         placement lock, then standings.
--   S-18  league_leave keeps the seat for the week (opted_out = true): the row is
--         still ranked and moved up/down at the end; rejoining the same week
--         returns to the same room.
--   S-20  public.league_state(uuid): the whole league screen in one call.
--
-- Deploy order: this migration first, then the backend (it calls league_state
-- and sync_page), then the frontend. The old backend keeps working on this
-- schema (league_refresh ignores p_stars and recounts here).
-- Idempotent: safe to run more than once.
begin;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- The application clock. Tests pin it with set_config('toeic.now', ...); API
-- roles cannot set arbitrary settings, so production always uses the real clock.
create or replace function private.app_now() returns timestamptz
language sql volatile set search_path = '' as $$
  select coalesce(nullif(current_setting('toeic.now', true), '')::timestamptz, clock_timestamp())
$$;

-- Asia/Ho_Chi_Minh is a fixed UTC+7 (no daylight saving).
create or replace function private.vn_date(p_at timestamptz) returns date
language sql immutable set search_path = '' as $$
  select ((p_at at time zone 'UTC') + interval '7 hours')::date
$$;

create or replace function private.vn_midnight(p_day date) returns timestamptz
language sql immutable set search_path = '' as $$
  select (p_day::timestamp - interval '7 hours') at time zone 'UTC'
$$;

create or replace function private.league_week(p_at timestamptz) returns date
language sql immutable set search_path = '' as $$
  select (date_trunc('week', (p_at at time zone 'UTC') + interval '7 hours'))::date
$$;

-- A week is final from the following Monday 12:00 in Vietnam.
create or replace function private.league_grace_end(p_week date) returns timestamptz
language sql immutable set search_path = '' as $$
  select private.vn_midnight(p_week + 7) + interval '12 hours'
$$;

-- Nesting depth of a JSON value (a scalar is 1), stopping at 64.
create or replace function private.jsonb_depth(p_value jsonb) returns integer
language sql immutable set search_path = '' as $$
  with recursive walk(v, d) as (
    select p_value, 1
    union all
    select c.value, w.d + 1 from walk w
      cross join lateral (
        select e.value from jsonb_each(case when jsonb_typeof(w.v) = 'object' then w.v else '{}'::jsonb end) e
        union all
        select a.value from jsonb_array_elements(case when jsonb_typeof(w.v) = 'array' then w.v else '[]'::jsonb end) a
      ) c
    where w.d < 64
  )
  select max(d) from walk
$$;

-- ---------------------------------------------------------------------------
-- S-07: bounded `extra` on every synced table. NOT VALID: rows already stored
-- are not rechecked; every new write is.
-- ---------------------------------------------------------------------------

do $$
declare t text; lim integer;
begin
  for t, lim in select * from (values ('user_profiles', 40960), ('study_sessions', 16384), ('study_session_parts', 2048),
      ('mistakes', 49152), ('vocabulary_logs', 4096), ('pacing_runs', 8192), ('pacing_run_phases', 2048),
      ('streak_shields', 2048)) v(t, lim) loop
    if not exists (select 1 from pg_catalog.pg_constraint where conrelid = ('public.' || t)::regclass and conname = 'extra_bounded') then
      execute format('alter table public.%I add constraint extra_bounded check (octet_length(extra::text) <= %s and private.jsonb_depth(extra) <= 8) not valid', t, lim);
    end if;
  end loop;
end;
$$;

-- Pacing presets had no length limit.
do $$
begin
  if not exists (select 1 from pg_catalog.pg_constraint where conrelid = 'public.pacing_runs'::regclass and conname = 'pacing_runs_preset_bounded') then
    alter table public.pacing_runs add constraint pacing_runs_preset_bounded
      check (length(preset_id) <= 100 and length(preset_name) <= 200) not valid;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- S-09: immutable server first-sync time on the rows that earn stars.
-- ---------------------------------------------------------------------------

do $$
declare t text;
begin
  -- Backfill must not bump versions or timestamps.
  perform set_config('toeic.sync_writer', 'on', true);
  foreach t in array array['study_sessions','mistakes','vocabulary_logs','pacing_runs'] loop
    if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = t and column_name = 'first_synced_at') then
      execute format('alter table public.%I add column first_synced_at timestamptz', t);
      -- The best server-side evidence for old rows: their last write.
      execute format('update public.%I set first_synced_at = least(updated_at, now())', t);
      execute format('alter table public.%I alter column first_synced_at set default now(), alter column first_synced_at set not null', t);
    end if;
  end loop;
  perform set_config('toeic.sync_writer', 'off', true);
end;
$$;

create or replace function private.keep_first_synced() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.first_synced_at := private.app_now();
  else
    new.first_synced_at := old.first_synced_at;
  end if;
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['study_sessions','mistakes','vocabulary_logs','pacing_runs'] loop
    execute format('drop trigger if exists keep_first_synced on public.%I', t);
    execute format('create trigger keep_first_synced before insert or update on public.%I for each row execute function private.keep_first_synced()', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- S-08: tombstone purge floor per account, and an index for the TTL.
-- ---------------------------------------------------------------------------

-- Highest server_version of a purged tombstone. A device whose cursor is below
-- it may have missed a deletion and gets the full snapshot instead of a delta.
create table if not exists private.sync_floors (
  user_id uuid primary key references auth.users(id) on delete cascade,
  server_version bigint not null
);
revoke all on table private.sync_floors from public, anon, authenticated, service_role;
create index if not exists sync_tombstones_deleted on public.sync_tombstones(deleted_at);

-- Tombstones at or below a reset barrier are never needed: every device behind
-- the barrier gets the full snapshot. Free them once (reset no longer makes them).
delete from public.sync_tombstones t using public.learning_data_resets r
  where r.user_id = t.user_id and t.server_version <= r.server_version;

-- ---------------------------------------------------------------------------
-- Sync: store, paged snapshot, write path, page continuation, reset
-- ---------------------------------------------------------------------------

-- Last-writer-wins store of one wire record. Returns true when it changed.
-- Equal timestamps: a deletion beats a live record, otherwise the server wins.
-- Deleting a record the server never had is a no-op (no tombstone).
create or replace function private.store_record(p_user_id uuid, p_entity text, p_id text, p_payload jsonb,
  p_updated_at timestamptz, p_deleted_at timestamptz)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  current_row record;
  version bigint;
  item jsonb;
  ordinal bigint;
begin
  if private.entity_table(p_entity) is null then raise exception 'Unknown entity type'; end if;
  select k.updated_at, k.deleted_at into current_row from private.sync_keys k
    where k.user_id = p_user_id and k.entity_type = p_entity and k.record_id = p_id;
  if not found and p_deleted_at is not null then
    if p_entity = 'profile' then raise exception 'Invalid profile'; end if;
    return false;
  end if;
  if found and (p_updated_at < current_row.updated_at or (p_updated_at = current_row.updated_at
      and not (p_deleted_at is not null and current_row.deleted_at is null))) then
    return false;
  end if;
  version := nextval('private.sync_version');

  if p_deleted_at is not null then
    if p_entity = 'profile' then raise exception 'Invalid profile'; end if;
    insert into public.sync_tombstones as t(user_id, entity_type, record_id, updated_at, deleted_at, server_version)
      values (p_user_id, p_entity, p_id, p_updated_at, p_deleted_at, version)
      on conflict (user_id, entity_type, record_id) do update
        set updated_at = excluded.updated_at, deleted_at = excluded.deleted_at, server_version = excluded.server_version;
    execute format('delete from public.%I where user_id = $1 and id = $2', private.entity_table(p_entity)) using p_user_id, p_id;
    return true;
  end if;

  delete from public.sync_tombstones where user_id = p_user_id and entity_type = p_entity and record_id = p_id;
  case p_entity
  when 'profile' then
    insert into public.user_profiles as r(user_id, name, target_score, exam_date, selected_skill, daily_goal_minutes, streak_freezes,
      shield_allowance, current_streak, longest_streak, last_study_date, motto, extra, updated_at, server_version)
    values (p_user_id, coalesce(p_payload->>'name','Học viên'), coalesce((p_payload->>'targetScore')::integer, 990),
      nullif(p_payload->>'examDate','')::date, coalesce(p_payload->>'selectedSkill','LR'),
      coalesce((p_payload->>'dailyMinGoalMinutes')::integer, 30), coalesce((p_payload->>'streakFreezes')::integer, 2),
      (p_payload->>'shieldAllowance')::integer, coalesce((p_payload->>'currentStreak')::integer, 0),
      coalesce((p_payload->>'longestStreak')::integer, 0), nullif(p_payload->>'lastStudyDate','')::date, coalesce(p_payload->>'motto',''),
      p_payload - array['currentStreak','dailyMinGoalMinutes','deletedAt','examDate','id','lastStudyDate','longestStreak','motto',
        'name','selectedSkill','shieldAllowance','streakFreezes','targetScore','updatedAt'],
      p_updated_at, version)
    on conflict (user_id) do update set name = excluded.name, target_score = excluded.target_score, exam_date = excluded.exam_date,
      selected_skill = excluded.selected_skill, daily_goal_minutes = excluded.daily_goal_minutes, streak_freezes = excluded.streak_freezes,
      shield_allowance = excluded.shield_allowance, current_streak = excluded.current_streak, longest_streak = excluded.longest_streak,
      last_study_date = excluded.last_study_date, motto = excluded.motto, extra = excluded.extra,
      updated_at = excluded.updated_at, server_version = excluded.server_version;

  when 'sessions' then
    insert into public.study_sessions as r(user_id, id, skill_type, session_type, test_name, study_date, duration_minutes, created_at,
      raw_listening, raw_reading, scaled_listening, scaled_reading, total_score, attempt_number, notes,
      part1_correct, part2_correct, part3_correct, part4_correct, part5_correct, part6_correct, part7_correct,
      has_practice_parts, extra, updated_at, server_version)
    values (p_user_id, p_id, p_payload->>'skillType', p_payload->>'sessionType', p_payload->>'testName', nullif(p_payload->>'date','')::date,
      (p_payload->>'durationMinutes')::numeric, coalesce((p_payload->>'createdAt')::timestamptz, p_updated_at),
      (p_payload->>'rawListening')::integer, (p_payload->>'rawReading')::integer, (p_payload->>'scaledListening')::integer,
      (p_payload->>'scaledReading')::integer, (p_payload->>'totalScore')::integer, (p_payload->>'attemptNumber')::integer, p_payload->>'notes',
      (p_payload->'partScores'->>'part1')::integer, (p_payload->'partScores'->>'part2')::integer, (p_payload->'partScores'->>'part3')::integer,
      (p_payload->'partScores'->>'part4')::integer, (p_payload->'partScores'->>'part5')::integer, (p_payload->'partScores'->>'part6')::integer,
      (p_payload->'partScores'->>'part7')::integer, coalesce(jsonb_typeof(p_payload->'practiceParts') = 'array', false),
      p_payload - array['attemptNumber','createdAt','date','deletedAt','durationMinutes','id','notes','partScores','practiceParts',
        'rawListening','rawReading','scaledListening','scaledReading','sessionType','skillType','testName','totalScore','updatedAt'],
      p_updated_at, version)
    on conflict (user_id, id) do update set skill_type = excluded.skill_type, session_type = excluded.session_type,
      test_name = excluded.test_name, study_date = excluded.study_date, duration_minutes = excluded.duration_minutes,
      created_at = excluded.created_at, raw_listening = excluded.raw_listening, raw_reading = excluded.raw_reading,
      scaled_listening = excluded.scaled_listening, scaled_reading = excluded.scaled_reading, total_score = excluded.total_score,
      attempt_number = excluded.attempt_number, notes = excluded.notes, part1_correct = excluded.part1_correct,
      part2_correct = excluded.part2_correct, part3_correct = excluded.part3_correct, part4_correct = excluded.part4_correct,
      part5_correct = excluded.part5_correct, part6_correct = excluded.part6_correct, part7_correct = excluded.part7_correct,
      has_practice_parts = excluded.has_practice_parts, extra = excluded.extra, updated_at = excluded.updated_at,
      server_version = excluded.server_version;
    delete from public.study_session_parts where user_id = p_user_id and session_id = p_id;
    for item, ordinal in select value, ordinality from jsonb_array_elements(coalesce(p_payload->'practiceParts','[]'::jsonb)) with ordinality loop
      insert into public.study_session_parts(user_id, session_id, position, part, correct, total, extra)
      values (p_user_id, p_id, ordinal - 1, (item->>'part')::integer, (item->>'correct')::integer, (item->>'total')::integer,
        item - array['part','correct','total']);
    end loop;

  when 'mistakes' then
    insert into public.mistakes as r(user_id, id, part, category, status, question_context, user_mistake, correct_answer, trap_tip,
      options, tags, created_at, next_review_date, review_stage, review_count, last_reviewed_at, session_id, extra, updated_at, server_version)
    values (p_user_id, p_id, (p_payload->>'part')::integer, p_payload->>'category', p_payload->>'status', p_payload->>'questionContext',
      p_payload->>'userMistake', p_payload->>'correctAnswer', p_payload->>'trapTip',
      case when jsonb_typeof(p_payload->'options') = 'array' then array(select jsonb_array_elements_text(p_payload->'options')) end,
      case when jsonb_typeof(p_payload->'tags') = 'array' then array(select jsonb_array_elements_text(p_payload->'tags')) else array[]::text[] end,
      coalesce((p_payload->>'createdAt')::timestamptz, p_updated_at), nullif(p_payload->>'nextReviewDate','')::date,
      (p_payload->>'reviewStage')::integer, (p_payload->>'reviewCount')::integer, (p_payload->>'lastReviewedAt')::timestamptz,
      p_payload->>'sessionId',
      p_payload - array['category','correctAnswer','createdAt','deletedAt','id','lastReviewedAt','nextReviewDate','options','part',
        'questionContext','reviewCount','reviewStage','sessionId','status','tags','trapTip','updatedAt','userMistake'],
      p_updated_at, version)
    on conflict (user_id, id) do update set part = excluded.part, category = excluded.category, status = excluded.status,
      question_context = excluded.question_context, user_mistake = excluded.user_mistake, correct_answer = excluded.correct_answer,
      trap_tip = excluded.trap_tip, options = excluded.options, tags = excluded.tags, created_at = excluded.created_at,
      next_review_date = excluded.next_review_date, review_stage = excluded.review_stage, review_count = excluded.review_count,
      last_reviewed_at = excluded.last_reviewed_at, session_id = excluded.session_id, extra = excluded.extra,
      updated_at = excluded.updated_at, server_version = excluded.server_version;

  when 'vocabLog' then
    insert into public.vocabulary_logs as r(user_id, id, study_date, word_count, extra, updated_at, server_version)
    values (p_user_id, p_id, nullif(p_payload->>'date','')::date, (p_payload->>'count')::integer,
      p_payload - array['count','date','deletedAt','id','updatedAt'], p_updated_at, version)
    on conflict (user_id, id) do update set study_date = excluded.study_date, word_count = excluded.word_count,
      extra = excluded.extra, updated_at = excluded.updated_at, server_version = excluded.server_version;

  when 'pacingRuns' then
    insert into public.pacing_runs as r(user_id, id, preset_id, preset_name, study_date, planned_minutes, actual_minutes,
      finished_naturally, created_at, extra, updated_at, server_version)
    values (p_user_id, p_id, p_payload->>'presetId', p_payload->>'presetName', nullif(p_payload->>'date','')::date,
      (p_payload->>'plannedMinutes')::numeric, (p_payload->>'actualMinutes')::numeric, (p_payload->>'finishedNaturally')::boolean,
      coalesce((p_payload->>'createdAt')::timestamptz, p_updated_at),
      p_payload - array['actualMinutes','createdAt','date','deletedAt','finishedNaturally','id','phases','plannedMinutes','presetId','presetName','updatedAt'],
      p_updated_at, version)
    on conflict (user_id, id) do update set preset_id = excluded.preset_id, preset_name = excluded.preset_name,
      study_date = excluded.study_date, planned_minutes = excluded.planned_minutes, actual_minutes = excluded.actual_minutes,
      finished_naturally = excluded.finished_naturally, created_at = excluded.created_at, extra = excluded.extra,
      updated_at = excluded.updated_at, server_version = excluded.server_version;
    delete from public.pacing_run_phases where user_id = p_user_id and run_id = p_id;
    for item, ordinal in select value, ordinality from jsonb_array_elements(coalesce(p_payload->'phases','[]'::jsonb)) with ordinality loop
      insert into public.pacing_run_phases(user_id, run_id, position, name, planned_minutes, actual_minutes, overrun_minutes, extra)
      values (p_user_id, p_id, ordinal - 1, item->>'name', (item->>'plannedMinutes')::numeric, (item->>'actualMinutes')::numeric,
        (item->>'overrunMinutes')::numeric, item - array['name','plannedMinutes','actualMinutes','overrunMinutes']);
    end loop;

  when 'shieldDays' then
    insert into public.streak_shields as r(user_id, id, study_date, extra, updated_at, server_version)
    values (p_user_id, p_id, nullif(p_payload->>'date','')::date, p_payload - array['date','deletedAt','id','updatedAt'], p_updated_at, version)
    on conflict (user_id, id) do update set study_date = excluded.study_date, extra = excluded.extra,
      updated_at = excluded.updated_at, server_version = excluded.server_version;
  end case;
  return true;
end;
$$;

-- One page of changes after p_cursor (all rows when p_cursor is from another
-- database generation), in server_version order: at most sync_page_rows rows
-- (default 1000) and about sync_page_bytes of payload (default 2 MiB; the row
-- that crosses the budget is the last one). `cursor` is the last version sent
-- when hasMore, else the latest version. Records named in p_submitted that are
-- outside this page are echoed so the device sees their canonical copy.
create or replace function private.sync_snapshot(p_user_id uuid, p_cursor bigint, p_submitted jsonb, p_extra jsonb default '{}'::jsonb)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  latest bigint; since bigint; epoch text; page_rows integer; page_bytes bigint; reset_version bigint;
  rows_json jsonb; echo_json jsonb; page_last bigint; more boolean := false; upto bigint;
begin
  select coalesce(max(server_version), 0) into latest from private.sync_keys where user_id = p_user_id;
  select value into epoch from private.settings where key = 'sync_epoch';
  page_rows := coalesce((select value::integer from private.settings where key = 'sync_page_rows'), 1000);
  page_bytes := coalesce((select value::bigint from private.settings where key = 'sync_page_bytes'), 2097152);
  select server_version into reset_version from public.learning_data_resets where user_id = p_user_id;
  since := case when p_cursor > latest then 0 else p_cursor end;
  select coalesce(jsonb_agg(jsonb_build_object('entity_type',x.entity_type,'record_id',x.record_id,'payload',x.payload,
      'updated_at',x.updated_at,'deleted_at',x.deleted_at) order by x.server_version), '[]'::jsonb), max(x.server_version)
    into rows_json, page_last
    from (
      select y.*, sum(y.size) over (order by y.server_version) - y.size as prior_bytes from (
        select v.entity_type, v.record_id, v.payload, v.updated_at, v.deleted_at, v.server_version, octet_length(v.payload::text) as size
        from (select k.entity_type, k.record_id from private.sync_keys k
              where k.user_id = p_user_id and k.server_version > since order by k.server_version limit page_rows) k
        join private.sync_rows v on v.user_id = p_user_id and v.entity_type = k.entity_type and v.record_id = k.record_id
      ) y
    ) x where x.prior_bytes < page_bytes;
  more := page_last is not null and exists (select 1 from private.sync_keys k where k.user_id = p_user_id and k.server_version > page_last);
  upto := case when more then page_last else latest end;
  select coalesce(jsonb_agg(jsonb_build_object('entity_type',v.entity_type,'record_id',v.record_id,'payload',v.payload,
      'updated_at',v.updated_at,'deleted_at',v.deleted_at) order by v.entity_type, v.record_id), '[]'::jsonb)
    into echo_json from private.sync_rows v
    where v.user_id = p_user_id and not (v.server_version > since and v.server_version <= upto)
      and (v.entity_type, v.record_id) in (select s->>'entity_type', s->>'record_id' from jsonb_array_elements(p_submitted) s);
  return jsonb_build_object('cursor', upto, 'records', rows_json || echo_json, 'hasRecords', latest > 0, 'hasMore', more,
    'resetVersion', coalesce(reset_version, 0), 'epoch', epoch) || p_extra;
end;
$$;

-- Purge the oldest tombstones of one account beyond p_keep and raise its floor.
create or replace function private.trim_tombstones(p_user_id uuid, p_keep integer) returns integer
language plpgsql security definer set search_path = '' as $$
declare extra_rows integer; removed integer := 0;
begin
  select count(*) - p_keep into extra_rows from public.sync_tombstones where user_id = p_user_id;
  if extra_rows <= 0 then return 0; end if;
  with gone as (
    delete from public.sync_tombstones t where t.user_id = p_user_id and (t.entity_type, t.record_id) in (
      select s.entity_type, s.record_id from public.sync_tombstones s where s.user_id = p_user_id order by s.server_version limit extra_rows)
    returning t.server_version
  ), floors as (
    insert into private.sync_floors(user_id, server_version) select p_user_id, max(server_version) from gone having count(*) > 0
      on conflict (user_id) do update set server_version = greatest(private.sync_floors.server_version, excluded.server_version)
  )
  select count(*) into removed from gone;
  return removed;
end;
$$;

-- ---------------------------------------------------------------------------
-- League (defined before the sync path, which recounts stars)
-- ---------------------------------------------------------------------------

alter table public.league_standings add column if not exists opted_out boolean not null default false;
comment on column public.league_standings.opted_out is 'Left during this week: the seat stays (ranked, moved up/down) so leaving cannot dodge demotion or hop rooms.';
-- The member's group lives in league_standings(week_start, user_id); this copy is no longer maintained.
update public.league_members set group_id = null where group_id is not null;
comment on column public.league_members.group_id is 'Unused since 2026-11-25: the seat is league_standings(week_start, user_id).';

-- Stars for one week from the learner's own synced rows, as they stand at p_now.
-- Offline-friendly: any study_date in the week counts, however late it syncs,
-- until the week is final. Not before the member joined, not in the future, and
-- only rows first synced in or after that week (an old row cannot be re-dated).
-- Mirrors STARS / DAILY_CAP in backend/app/services/league.py.
create or replace function private.league_stars(p_user_id uuid, p_week date, p_now timestamptz) returns jsonb
language sql stable security definer set search_path = '' as $$
  with b as (
    select greatest(p_week, coalesce((select private.vn_date(m.joined_at) from public.league_members m where m.user_id = p_user_id), p_week)) as first_day,
           least(p_week + 6, private.vn_date(p_now)) as last_day,
           private.vn_midnight(p_week) as week_at,
           p_now + interval '5 minutes' as latest_at
  ), ev as (
    select s.study_date as day, 'full_test'::text as kind, 20 as stars, s.created_at as at
      from public.study_sessions s, b
     where s.user_id = p_user_id and s.study_date between b.first_day and b.last_day and s.session_type = 'FULL_TEST'
       and (s.total_score is not null or s.part1_correct is not null) and s.duration_minutes >= 15
       and s.first_synced_at between b.week_at and p_now and s.created_at <= b.latest_at
    union all
    select s.study_date, 'part_practice', 8, s.created_at
      from public.study_sessions s, b
     where s.user_id = p_user_id and s.study_date between b.first_day and b.last_day and s.session_type = 'PART_PRACTICE'
       and (s.has_practice_parts or s.duration_minutes >= 5)
       and s.first_synced_at between b.week_at and p_now and s.created_at <= b.latest_at
    union all
    select r.study_date, 'bake', 6, r.created_at
      from public.pacing_runs r, b
     where r.user_id = p_user_id and r.study_date between b.first_day and b.last_day and r.finished_naturally and r.actual_minutes >= 3
       and r.first_synced_at between b.week_at and p_now and r.created_at <= b.latest_at
    union all
    select v.study_date, 'vocab_day', 5, min(v.updated_at)
      from public.vocabulary_logs v, b
     where v.user_id = p_user_id and v.study_date between b.first_day and b.last_day and v.first_synced_at between b.week_at and p_now
     group by v.study_date
    union all
    select private.vn_date(m.created_at), 'card_added', 1, m.created_at
      from public.mistakes m, b
     where m.user_id = p_user_id and m.created_at between b.week_at and b.latest_at and m.first_synced_at between b.week_at and p_now
    union all
    select private.vn_date(m.last_reviewed_at), 'card_reviewed', 2, m.last_reviewed_at
      from public.mistakes m, b
     where m.user_id = p_user_id and m.last_reviewed_at between b.week_at and b.latest_at
  ), counted as (
    select ev.day, ev.kind, ev.stars, row_number() over (partition by ev.day, ev.kind order by ev.at, ev.stars) as n
      from ev, b where ev.day between b.first_day and b.last_day
  ), daily as (
    select day, least(60, sum(stars))::integer as stars from counted
     where n <= case kind when 'full_test' then 3 when 'part_practice' then 5 when 'bake' then 5 else 1000 end
     group by day
  )
  select jsonb_build_object(
    'total', coalesce((select sum(stars) from daily), 0)::integer,
    'today', coalesce((select stars from daily where day = private.vn_date(p_now)), 0),
    'daily', coalesce((select jsonb_object_agg(day::text, stars order by day) from daily), '{}'::jsonb))
$$;

create or replace function private.league_set_stars(p_user_id uuid, p_week date, p_now timestamptz) returns void
language plpgsql security definer set search_path = '' as $$
declare total integer := (private.league_stars(p_user_id, p_week, p_now)->>'total')::integer;
begin
  update public.league_standings set stars = total, reached_at = clock_timestamp()
    where week_start = p_week and user_id = p_user_id and final_rank is null and stars <> total;
end;
$$;

-- Recount every open (not final, inside its grace window) standing of one
-- learner. Called by sync, reset and the league screen; the account lock, if
-- any, is already held, so the league lock comes second as everywhere else.
create or replace function private.league_sync_user(p_user_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare now_at timestamptz := private.app_now(); wk date;
begin
  if not exists (select 1 from public.league_standings where user_id = p_user_id and final_rank is null) then return; end if;
  perform pg_advisory_xact_lock_shared(hashtextextended('league:rollover', 20261118));
  for wk in select week_start from public.league_standings
      where user_id = p_user_id and final_rank is null and private.league_grace_end(week_start) > now_at loop
    perform private.league_set_stars(p_user_id, wk, now_at);
  end loop;
end;
$$;

create or replace function private.league_open_week(p_now timestamptz) returns date
language plpgsql security definer set search_path = '' as $$
declare cw date := private.league_week(p_now);
begin
  insert into public.league_weeks(week_start) values (cw) on conflict do nothing;
  return cw;
end;
$$;

-- Finalise up to p_limit groups whose week is past its grace window. Holds the
-- league lock exclusively, so no in-week call (all take it shared) can
-- interleave: no deadlock, no stale-week write. Stars are recounted from the
-- records as they stood at the deadline first (no ghost stars).
create or replace function private.league_finalize_due(p_now timestamptz, p_limit integer) returns integer
language plpgsql security definer set search_path = '' as $$
declare grp record; done integer := 0; deadline timestamptz;
begin
  perform pg_advisory_xact_lock(hashtextextended('league:rollover', 20261118));
  for grp in select g.id, g.tier, g.week_start from public.league_groups g
      where private.league_grace_end(g.week_start) <= p_now
        and exists (select 1 from public.league_standings s where s.group_id = g.id and s.final_rank is null)
      order by g.week_start, g.id limit p_limit loop
    deadline := private.league_grace_end(grp.week_start);
    update public.league_standings s set stars = x.total, reached_at = clock_timestamp()
      from (select s2.user_id, (private.league_stars(s2.user_id, grp.week_start, deadline)->>'total')::integer as total
              from public.league_standings s2 where s2.group_id = grp.id) x
      where s.group_id = grp.id and s.user_id = x.user_id and s.stars <> x.total;
    with ranked as (
      select s.user_id, s.stars, row_number() over (order by s.stars desc, s.reached_at, s.user_id) as rnk, count(*) over () as n
      from public.league_standings s where s.group_id = grp.id
    ), zoned as (select r.*, private.league_zone(r.n::integer) as z from ranked r)
    update public.league_standings s set final_rank = z.rnk,
      outcome = case when z.rnk <= z.z and grp.tier < 4 and z.stars > 0 then 'up'
                     when z.rnk > z.n - z.z and grp.tier > 1 then 'down' else 'stay' end
    from zoned z where s.group_id = grp.id and s.user_id = z.user_id;
    -- Move tiers; a seat already taken in an open later week at the old tier is
    -- given up, so the next visit seats the learner at the new tier.
    with moved as (
      update public.league_members m set tier = grp.tier + case s.outcome when 'up' then 1 else -1 end, updated_at = now()
        from public.league_standings s where s.group_id = grp.id and s.user_id = m.user_id and s.outcome <> 'stay'
      returning m.user_id, m.tier
    )
    delete from public.league_standings s using public.league_groups g, moved
      where s.user_id = moved.user_id and g.id = s.group_id and s.week_start > grp.week_start and s.final_rank is null
        and g.tier <> moved.tier and private.league_grace_end(s.week_start) > p_now;
    done := done + 1;
  end loop;
  return done;
end;
$$;

-- Seat an active member for p_week (league lock held shared): their seat if
-- they already have one this week (also after leaving and rejoining), else the
-- oldest group of their tier with a free seat (max 20, left seats included).
create or replace function private.league_place(p_user_id uuid, p_week date) returns bigint
language plpgsql security definer set search_path = '' as $$
declare mem public.league_members; gid bigint;
begin
  select * into mem from public.league_members where user_id = p_user_id and opted_out_at is null for update;
  if not found then return null; end if;
  select group_id into gid from public.league_standings where week_start = p_week and user_id = p_user_id;
  if gid is not null then
    update public.league_standings set opted_out = false where week_start = p_week and user_id = p_user_id and opted_out;
    return gid;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('league:place:' || p_week::text || ':' || mem.tier::text, 20261118));
  select g.id into gid from public.league_groups g where g.week_start = p_week and g.tier = mem.tier
    and (select count(*) from public.league_standings s where s.group_id = g.id) < 20 order by g.id limit 1;
  if gid is null then
    insert into public.league_groups(week_start, tier) values (p_week, mem.tier) returning id into gid;
  end if;
  insert into public.league_standings(week_start, user_id, group_id, nickname, coat, stars, reached_at)
    values (p_week, p_user_id, gid, mem.nickname, mem.coat, 0, clock_timestamp());
  return gid;
end;
$$;

-- p_week is the caller's idea of this week: a week already over is refused;
-- the database clock decides which week every write goes to.
create or replace function private.league_guard(p_user_id uuid, p_week date) returns date
language plpgsql security definer set search_path = '' as $$
declare cw date := private.league_week(private.app_now());
begin
  perform private.league_check(p_user_id, coalesce(p_week, cw));
  if p_week < cw then raise exception 'Stale league week'; end if;
  return cw;
end;
$$;

-- The whole league screen in one call: membership, seat, this week's stars
-- (recounted from the records), the group table, last week's result.
create or replace function public.league_state(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  now_at timestamptz := private.app_now(); cw date := private.league_week(now_at);
  mem public.league_members; gid bigint; gtier smallint; rows_json jsonb; last_json jsonb; n integer; stars_json jsonb; last_stars integer;
begin
  perform private.league_check(p_user_id, cw);
  -- Late finalisation (maintenance has not run yet): one request does a bounded share, the rest skip.
  if exists (select 1 from public.league_groups g where g.week_start < cw and private.league_grace_end(g.week_start) <= now_at
       and exists (select 1 from public.league_standings s where s.group_id = g.id and s.final_rank is null)) then
    if pg_try_advisory_xact_lock(hashtextextended('league:rollover', 20261118)) then
      perform private.league_finalize_due(now_at, 20);
    end if;
  end if;
  perform pg_advisory_xact_lock_shared(hashtextextended('league:rollover', 20261118));
  perform private.league_open_week(now_at);
  select jsonb_build_object('rank', s.final_rank, 'outcome', s.outcome, 'stars', s.stars, 'tier', g.tier, 'weekStart', s.week_start)
    into last_json from public.league_standings s join public.league_groups g on g.id = s.group_id
    where s.user_id = p_user_id and s.week_start = cw - 7 and s.final_rank is not null;
  select * into mem from public.league_members where user_id = p_user_id;
  if found and mem.opted_out_at is null then gid := private.league_place(p_user_id, cw); end if;
  if gid is null then
    return jsonb_build_object('weekStart', cw, 'member', null, 'lastWeek', coalesce(last_json, 'null'::jsonb));
  end if;
  perform private.league_sync_user(p_user_id);
  stars_json := private.league_stars(p_user_id, cw, now_at);
  last_stars := (private.league_stars(p_user_id, cw - 7, now_at)->>'total')::integer;
  select tier into gtier from public.league_groups where id = gid;
  select count(*)::integer, coalesce(jsonb_agg(jsonb_build_object('rank', t.rnk, 'nickname', t.nickname, 'coat', t.coat, 'stars', t.stars,
      'me', t.user_id = p_user_id) order by t.rnk), '[]'::jsonb)
    into n, rows_json from (
      select s.*, row_number() over (order by s.stars desc, s.reached_at, s.user_id) as rnk
      from public.league_standings s where s.group_id = gid) t;
  return jsonb_build_object(
    'weekStart', cw,
    'member', jsonb_build_object('nickname', mem.nickname, 'coat', mem.coat, 'tier', mem.tier, 'joinedAt', mem.joined_at),
    'group', jsonb_build_object('tier', gtier, 'size', n, 'zone', private.league_zone(n), 'rows', rows_json),
    'lastWeek', coalesce(last_json, 'null'::jsonb),
    'stars', stars_json,
    'lastWeekStars', last_stars);
end;
$$;

-- Older backends: p_stars is ignored (stars are counted here), p_week guarded.
create or replace function public.league_refresh(p_user_id uuid, p_week date, p_stars integer default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if p_stars is not null and p_stars not between 0 and 420 then raise exception 'Invalid league stars'; end if;
  perform private.league_guard(p_user_id, p_week);
  return public.league_state(p_user_id);
end;
$$;

create or replace function public.league_join(p_user_id uuid, p_week date, p_nickname text, p_coat text)
returns void language plpgsql security definer set search_path = '' as $$
declare cw date := private.league_guard(p_user_id, p_week);
begin
  perform pg_advisory_xact_lock_shared(hashtextextended('league:rollover', 20261118));
  perform private.league_open_week(private.app_now());
  insert into public.league_members(user_id, nickname, coat, joined_at) values (p_user_id, p_nickname, coalesce(p_coat, 'nau-cam'), private.app_now())
    on conflict (user_id) do update set nickname = excluded.nickname, coat = excluded.coat, opted_out_at = null, updated_at = now();
  update public.league_standings set nickname = p_nickname, coat = coalesce(p_coat, 'nau-cam') where week_start = cw and user_id = p_user_id;
  perform private.league_place(p_user_id, cw);
  perform private.league_sync_user(p_user_id);
end;
$$;

-- Leaving keeps this week's seat (still ranked, still moved up or down at the
-- end); the learner is not seated in later weeks until they join again.
create or replace function public.league_leave(p_user_id uuid, p_week date)
returns void language plpgsql security definer set search_path = '' as $$
declare cw date := private.league_guard(p_user_id, p_week);
begin
  perform pg_advisory_xact_lock_shared(hashtextextended('league:rollover', 20261118));
  perform 1 from public.league_members where user_id = p_user_id for update;
  update public.league_members set opted_out_at = private.app_now(), group_id = null, updated_at = now()
    where user_id = p_user_id and opted_out_at is null;
  update public.league_standings set opted_out = true where week_start = cw and user_id = p_user_id and final_rank is null;
end;
$$;

create or replace function public.league_update(p_user_id uuid, p_week date, p_nickname text, p_coat text)
returns void language plpgsql security definer set search_path = '' as $$
declare cw date := private.league_guard(p_user_id, p_week);
begin
  perform pg_advisory_xact_lock_shared(hashtextextended('league:rollover', 20261118));
  update public.league_members set nickname = coalesce(p_nickname, nickname), coat = coalesce(p_coat, coat), updated_at = now()
    where user_id = p_user_id and opted_out_at is null;
  if not found then raise exception 'Not a league member'; end if;
  update public.league_standings s set nickname = m.nickname, coat = m.coat from public.league_members m
    where s.week_start = cw and s.user_id = p_user_id and m.user_id = p_user_id;
end;
$$;

-- The lazy in-request rollover is gone (finalising is league_finalize_due).
drop function if exists private.league_rollover(date);
drop function if exists private.league_finalize_before(date);

-- ---------------------------------------------------------------------------
-- Sync write path
-- ---------------------------------------------------------------------------

-- The only write path for learning data. Called by the backend after it
-- validated every payload; p_user_id comes from the verified session.
create or replace function public.sync_account_records(p_user_id uuid, p_records jsonb, p_cursor bigint default 0, p_replace boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  item jsonb;
  records jsonb;
  stamp timestamptz;
  removed timestamptz;
  override_at timestamptz;
  reset_version bigint;
  floor_version bigint;
  latest bigint;
  full_snapshot boolean;
  ghosts jsonb := '[]'::jsonb;
  existing record;
  result jsonb;
begin
  if p_user_id is null or p_cursor is null or p_cursor < 0 or jsonb_typeof(p_records) is distinct from 'array'
     or jsonb_array_length(p_records) > 1000 or octet_length(p_records::text) > 4194304 then
    raise exception 'Invalid sync request';
  end if;
  if not exists (select 1 from auth.users where id = p_user_id and not is_anonymous) then
    raise exception 'Permanent account required';
  end if;
  -- Weekly plans and the exam checklist were retired; older apps may still send them.
  records := coalesce((select jsonb_agg(value) from jsonb_array_elements(p_records)
    where coalesce(value->>'entity_type','') not in ('checklist','weeklyPlans')), '[]'::jsonb);
  if p_replace and not exists (select 1 from jsonb_array_elements(records) s
      where s->>'entity_type' = 'profile' and s->>'record_id' = 'profile') then
    raise exception 'Invalid replacement';
  end if;
  perform private.lock_account(p_user_id);
  perform private.set_writer(true);

  select server_version into reset_version from public.learning_data_resets where user_id = p_user_id;
  if coalesce(reset_version, 0) > p_cursor and not p_replace then
    -- This device has not seen the reset: drop its writes, send the canonical snapshot.
    result := private.sync_snapshot(p_user_id, 9223372036854775807, '[]'::jsonb, '{"resetBarrier": true}'::jsonb);
    perform private.set_writer(false);
    return result;
  end if;
  -- A device behind a tombstone purge may have missed deletions: its writes are
  -- kept, and it gets the whole canonical set to replace its copy.
  select server_version into floor_version from private.sync_floors where user_id = p_user_id;
  select coalesce(max(server_version), 0) into latest from private.sync_keys where user_id = p_user_id;
  full_snapshot := not p_replace and p_cursor > 0 and p_cursor <= latest and p_cursor < coalesce(floor_version, 0);

  if p_replace then
    select greatest(clock_timestamp(), coalesce(max(updated_at) + interval '1 millisecond', clock_timestamp()))
      into override_at from private.sync_keys where user_id = p_user_id;
  end if;
  for item in select value from jsonb_array_elements(records) loop
    if jsonb_typeof(item->'payload') is distinct from 'object' or private.entity_table(item->>'entity_type') is null
       or item->>'record_id' is null or length(item->>'record_id') not between 1 and 200
       or octet_length((item->'payload')::text) > 32768 then
      raise exception 'Invalid record';
    end if;
    if item->>'entity_type' = 'profile' then
      if item->>'record_id' <> 'profile' or item->>'deleted_at' is not null then raise exception 'Invalid profile'; end if;
    elsif item->'payload'->>'id' is distinct from item->>'record_id' then
      raise exception 'Invalid record identity';
    end if;
    stamp := case when p_replace then override_at else (item->>'updated_at')::timestamptz end;
    removed := case when item->>'deleted_at' is null then null when p_replace then override_at else (item->>'deleted_at')::timestamptz end;
    if stamp is null then raise exception 'Missing timestamp'; end if;
    if removed is not null and not exists (select 1 from private.sync_keys k where k.user_id = p_user_id
        and k.entity_type = item->>'entity_type' and k.record_id = item->>'record_id') then
      -- Never on the server: nothing to delete, no tombstone. Echo it so the device stops re-sending it.
      ghosts := ghosts || jsonb_build_array(jsonb_build_object('entity_type', item->>'entity_type', 'record_id', item->>'record_id',
        'payload', jsonb_build_object('id', item->>'record_id'), 'updated_at', stamp, 'deleted_at', removed));
      continue;
    end if;
    perform private.store_record(p_user_id, item->>'entity_type', item->>'record_id', item->'payload', stamp, removed);
  end loop;
  if p_replace then
    -- Records only the server had are deleted, so other devices drop them too.
    for existing in select k.entity_type, k.record_id from private.sync_keys k
        where k.user_id = p_user_id and k.deleted_at is null and k.entity_type <> 'profile'
          and (k.entity_type, k.record_id) not in (select s->>'entity_type', s->>'record_id' from jsonb_array_elements(records) s) loop
      perform private.store_record(p_user_id, existing.entity_type, existing.record_id, jsonb_build_object('id', existing.record_id), override_at, override_at);
    end loop;
  end if;
  -- Only live records count toward the limit; deletion markers are capped on their own.
  if (select count(*) from private.sync_keys where user_id = p_user_id and deleted_at is null) > 10000 then
    raise exception 'Account record limit reached';
  end if;
  perform private.trim_tombstones(p_user_id, 10000);
  perform private.league_sync_user(p_user_id);
  if full_snapshot then
    result := private.sync_snapshot(p_user_id, 9223372036854775807, '[]'::jsonb, '{"fullSnapshot": true}'::jsonb);
  else
    result := private.sync_snapshot(p_user_id, p_cursor, records);
  end if;
  if jsonb_array_length(ghosts) > 0 then
    result := jsonb_set(result, '{records}', (result->'records') || ghosts);
  end if;
  perform private.set_writer(false);
  return result;
end;
$$;

-- Next page of a reply that said hasMore: rows after p_after, same paging.
-- No barrier or floor checks: the device is still reading the reply it got.
create or replace function public.sync_page(p_user_id uuid, p_after bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if p_user_id is null or p_after is null or p_after < 0 then raise exception 'Invalid sync request'; end if;
  if not exists (select 1 from auth.users where id = p_user_id and not is_anonymous) then
    raise exception 'Permanent account required';
  end if;
  perform private.lock_account(p_user_id);
  return private.sync_snapshot(p_user_id, p_after, '[]'::jsonb);
end;
$$;

-- Erases the account's learning data (not the account) and raises a barrier.
-- No tombstones: every device behind the barrier replaces its copy with the
-- canonical (empty) snapshot, so old deletion markers are dropped too.
create or replace function public.reset_learning_data(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare reset_time timestamptz; latest bigint; result jsonb;
begin
  if p_user_id is null or not exists (select 1 from auth.users where id = p_user_id and not is_anonymous) then
    raise exception 'Permanent account required';
  end if;
  perform private.lock_account(p_user_id);
  perform private.set_writer(true);
  select greatest(clock_timestamp(), coalesce(max(updated_at) + interval '1 millisecond', clock_timestamp()))
    into reset_time from private.sync_keys where user_id = p_user_id;
  delete from public.study_sessions where user_id = p_user_id;
  delete from public.mistakes where user_id = p_user_id;
  delete from public.vocabulary_logs where user_id = p_user_id;
  delete from public.pacing_runs where user_id = p_user_id;
  delete from public.streak_shields where user_id = p_user_id;
  delete from public.sync_tombstones where user_id = p_user_id;
  perform private.store_record(p_user_id, 'profile', 'profile', jsonb_build_object(
    'name','Học viên','targetScore',990,'examDate','','currentStreak',0,'longestStreak',0,'streakFreezes',2,
    'shieldAllowance',2,'lastStudyDate','','dailyMinGoalMinutes',30,'motto','','selectedSkill','LR'), reset_time, null);
  select coalesce(max(server_version), 0) into latest from private.sync_keys where user_id = p_user_id;
  insert into public.learning_data_resets(user_id, reset_at, server_version) values (p_user_id, reset_time, latest)
    on conflict (user_id) do update set reset_at = excluded.reset_at, server_version = excluded.server_version;
  -- Cached AI explanations are learning content too; fence in-flight writers.
  update public.ai_explanation_questions set result = null, lease_id = null, lease_until = null, invalidated = true where user_id = p_user_id;
  update public.ai_explanation_requests set status = 'unknown' where user_id = p_user_id and status = 'running';
  -- Erased study earns nothing in an open league week.
  perform private.league_sync_user(p_user_id);
  result := private.sync_snapshot(p_user_id, 9223372036854775807, '[]'::jsonb, '{"resetBarrier": true, "hasRecords": true}'::jsonb);
  perform private.set_writer(false);
  return result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Maintenance and readiness
-- ---------------------------------------------------------------------------

create or replace function public.run_maintenance(p_limit integer default 5000, p_league_weeks integer default 12)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  stamp timestamptz := clock_timestamp();
  this_monday date := (date_trunc('week', (stamp at time zone 'UTC') + interval '7 hours'))::date;
  league_now timestamptz := private.app_now();
  counters integer; requests integer; batches integer; limits integer; ledger integer; weeks integer;
  provider_counters integer; cost_ledger integer; carryover integer; tombstones integer; groups integer; group_limit integer;
begin
  if p_limit is null or p_limit not between 1 and 100000 or p_league_weeks is null or p_league_weeks not between 2 and 520 then
    raise exception 'Invalid maintenance request';
  end if;
  delete from public.ai_usage_counters where bucket in (select bucket from public.ai_usage_counters
    where expires_at < stamp - interval '1 day' order by expires_at limit p_limit);
  get diagnostics counters = row_count;
  delete from public.ai_requests where (user_id, request_id) in (select user_id, request_id from public.ai_requests
    where created_at < stamp - interval '30 days' order by created_at limit p_limit);
  get diagnostics requests = row_count;
  delete from public.ai_batches where (user_id, batch_id) in (select user_id, batch_id from public.ai_batches
    where created_at < stamp - interval '1 day' order by created_at limit p_limit);
  get diagnostics batches = row_count;
  delete from public.api_rate_limits where (user_id, bucket, window_start) in (select user_id, bucket, window_start from public.api_rate_limits
    where window_start < stamp - interval '1 day' order by window_start limit p_limit);
  get diagnostics limits = row_count;
  delete from public.ai_explanation_questions where (user_id, ticket_id, question_number) in (
    select user_id, ticket_id, question_number from public.ai_explanation_questions
    where expires_at < stamp and (lease_until is null or lease_until < stamp) order by expires_at limit p_limit for update skip locked);
  get diagnostics ledger = row_count;
  delete from public.league_weeks where week_start < this_monday - 7 * p_league_weeks;
  get diagnostics weeks = row_count;
  delete from public.ai_provider_budget_counters where bucket in (select bucket from public.ai_provider_budget_counters
    where expires_at < stamp - interval '1 day' order by expires_at limit p_limit);
  get diagnostics provider_counters = row_count;
  delete from public.ai_cost_ledger where id in (select id from public.ai_cost_ledger
    where created_at < stamp - interval '90 days' order by created_at limit p_limit);
  get diagnostics cost_ledger = row_count;
  delete from private.identity_carryover_counters where bucket in (select bucket from private.identity_carryover_counters
    where expires_at < stamp - interval '1 day' order by expires_at limit p_limit);
  get diagnostics carryover = row_count;
  -- Deletion markers older than 180 days; the floor sends sleeping devices a full snapshot.
  with gone as (
    delete from public.sync_tombstones t where (t.user_id, t.entity_type, t.record_id) in (
      select user_id, entity_type, record_id from public.sync_tombstones
      where deleted_at < stamp - interval '180 days' order by deleted_at limit p_limit for update skip locked)
    returning t.user_id, t.server_version
  ), floors as (
    insert into private.sync_floors(user_id, server_version) select user_id, max(server_version) from gone group by user_id
      on conflict (user_id) do update set server_version = greatest(private.sync_floors.server_version, excluded.server_version)
  )
  select count(*) into tombstones from gone;
  -- Finished league weeks past their grace window (bounded: each group recounts up to 20 learners).
  group_limit := least(p_limit, 200);
  groups := private.league_finalize_due(league_now, group_limit);
  return jsonb_build_object(
    'aiUsageCounters', counters,
    'aiRequests', requests,
    'aiBatches', batches,
    'apiRateLimits', limits,
    'explanationQuestions', ledger,
    'leagueWeeks', weeks,
    'providerBudgetCounters', provider_counters,
    'aiCostLedger', cost_ledger,
    'identityCarryover', carryover,
    'syncTombstones', tombstones,
    'leagueGroups', groups,
    'leagueMore', groups >= group_limit,
    'limit', p_limit
  );
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
    and to_regclass('private.sync_floors') is not null
    and to_regprocedure('public.prepare_account_deletion(uuid,text)') is not null
    and to_regprocedure('public.apply_identity_carryover(uuid,text)') is not null
    and to_regprocedure('public.reserve_batch_explain_quota(uuid,uuid,integer,integer)') is not null
    and to_regprocedure('private.carry_identity_counter(uuid,text,integer,timestamp with time zone,timestamp with time zone)') is not null
    and to_regprocedure('public.mark_account_deletion_pending(uuid)') is not null
    and to_regprocedure('public.clear_account_deletion_pending(uuid)') is not null
    and to_regprocedure('public.list_pending_account_deletions(integer,integer)') is not null
    and to_regprocedure('public.note_account_deletion_attempt(uuid,text)') is not null
    and to_regprocedure('public.league_state(uuid)') is not null
    and to_regprocedure('public.sync_page(uuid,bigint)') is not null
    and to_regprocedure('private.league_stars(uuid,date,timestamp with time zone)') is not null
    and exists (select 1 from pg_catalog.pg_attribute
                 where attrelid = to_regclass('public.ai_batches') and attname = 'explain_questions' and not attisdropped)
    and exists (select 1 from pg_catalog.pg_attribute
                 where attrelid = to_regclass('public.study_sessions') and attname = 'first_synced_at' and not attisdropped)
    and exists (select 1 from pg_catalog.pg_attribute
                 where attrelid = to_regclass('public.league_standings') and attname = 'opted_out' and not attisdropped))
$$;

-- ---------------------------------------------------------------------------
-- Privileges: private helpers for nobody; the two new RPCs for the backend only.
-- ---------------------------------------------------------------------------

revoke all on all functions in schema private from public, anon, authenticated, service_role;
revoke all on function public.league_state(uuid) from public, anon, authenticated;
revoke all on function public.sync_page(uuid, bigint) from public, anon, authenticated;
grant execute on function public.league_state(uuid) to service_role;
grant execute on function public.sync_page(uuid, bigint) to service_role;
revoke all on function public.schema_ready() from public, anon, authenticated;
grant execute on function public.schema_ready() to service_role;

notify pgrst, 'reload schema';
commit;
