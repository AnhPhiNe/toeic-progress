-- TOEIC Progress database baseline v2 (2026-11-20).
--
-- One migration that builds the whole app schema from an empty public/private
-- schema. It replaces the twelve v1 migrations kept in migrations/archive/ for
-- history only (the Supabase CLI reads top-level files only). auth.* and the
-- storage bucket "mistake-sources" are not touched.
--
-- Security model
--   * Browsers (anon, authenticated) have no table, view, sequence or function
--     privilege at all. Every request goes through the FastAPI backend.
--   * The backend uses service_role: SELECT on the few tables it reads, EXECUTE
--     on the RPCs below. All writes happen inside SECURITY DEFINER RPCs with
--     search_path = '' and schema-qualified names.
--   * RLS is enabled on every table with no policy (deny-all for API roles).
--   * Internal helpers live in schema private, which API roles cannot use.
--
-- Re-applying this file to a v2 database is a no-op (if not exists / or
-- replace). Applying it on top of v1 objects is refused: run
-- supabase/rebuild/drop_v1.sql first (docs/DB_REBUILD_2026-11.md).
begin;

do $$
begin
  if to_regclass('public.weekly_plans') is not null or to_regclass('public.sync_records_legacy') is not null
     or to_regclass('public.exam_checklist') is not null or to_regclass('public.ai_provider_state') is not null
     or exists(select 1 from information_schema.columns where table_schema='public'
       and ((table_name='ai_usage_counters' and column_name='owner_id') or (table_name='user_profiles' and column_name='deleted_at'))) then
    raise exception 'v1 schema objects found: run supabase/rebuild/drop_v1.sql before the v2 baseline';
  end if;
end;
$$;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated, service_role;

-- New objects created by this role in public are private unless granted below.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

create sequence if not exists private.sync_version;

-- Identifies this database generation. Clients that synced with another
-- generation (before a rebuild) re-send their records once.
create table if not exists private.settings (
  key text primary key,
  value text not null
);
insert into private.settings(key, value) values ('sync_epoch', gen_random_uuid()::text) on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Learning data (synced). Live rows only: a deleted record leaves a
-- sync_tombstones row with its id and version, never its content.
-- ---------------------------------------------------------------------------

create table if not exists public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  name text not null check (length(name) <= 100),
  target_score integer not null default 990 check (target_score between 10 and 990),
  exam_date date,
  selected_skill text not null check (selected_skill in ('LR','SW')),
  daily_goal_minutes integer not null default 30 check (daily_goal_minutes between 1 and 1440),
  streak_freezes integer not null default 2 check (streak_freezes between 0 and 5),
  shield_allowance integer check (shield_allowance >= 0),
  current_streak integer not null default 0 check (current_streak >= 0),
  longest_streak integer not null default 0 check (longest_streak >= 0),
  last_study_date date,
  motto text not null default '' check (length(motto) <= 2000),
  -- UI preferences the server never queries: goalChosen, weeklyGoalDays,
  -- habits, suggestOff, suggestedTasks, socGear, socCoat, socName and any
  -- future field. Kept as JSON so new app versions need no migration.
  extra jsonb not null default '{}'::jsonb check (jsonb_typeof(extra) = 'object'),
  updated_at timestamptz not null,
  server_version bigint not null default nextval('private.sync_version')
);
create index if not exists user_profiles_version on public.user_profiles(user_id, server_version);

create table if not exists public.study_sessions (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null check (length(id) between 1 and 200),
  skill_type text not null check (skill_type in ('LR','SW')),
  session_type text not null check (session_type in ('FULL_TEST','PART_PRACTICE')),
  test_name text not null check (length(test_name) <= 300),
  study_date date not null,
  duration_minutes numeric not null check (duration_minutes between 0 and 1440 and duration_minutes::text not in ('NaN','Infinity','-Infinity')),
  created_at timestamptz not null,
  raw_listening integer check (raw_listening between 0 and 100),
  raw_reading integer check (raw_reading between 0 and 100),
  scaled_listening integer check (scaled_listening between 0 and 495),
  scaled_reading integer check (scaled_reading between 0 and 495),
  total_score integer check (total_score between 0 and 990),
  attempt_number integer check (attempt_number >= 1),
  notes text check (length(notes) <= 16000),
  part1_correct integer check (part1_correct between 0 and 6),
  part2_correct integer check (part2_correct between 0 and 25),
  part3_correct integer check (part3_correct between 0 and 39),
  part4_correct integer check (part4_correct between 0 and 30),
  part5_correct integer check (part5_correct between 0 and 30),
  part6_correct integer check (part6_correct between 0 and 16),
  part7_correct integer check (part7_correct between 0 and 54),
  has_practice_parts boolean not null default false,
  extra jsonb not null default '{}'::jsonb check (jsonb_typeof(extra) = 'object'),
  updated_at timestamptz not null,
  server_version bigint not null default nextval('private.sync_version'),
  primary key (user_id, id),
  check ((part1_correct is null and part2_correct is null and part3_correct is null and part4_correct is null
          and part5_correct is null and part6_correct is null and part7_correct is null)
      or (part1_correct is not null and part2_correct is not null and part3_correct is not null and part4_correct is not null
          and part5_correct is not null and part6_correct is not null and part7_correct is not null))
);
create index if not exists study_sessions_version on public.study_sessions(user_id, server_version);
-- League stars read the learner's sessions from last Monday on.
create index if not exists study_sessions_date on public.study_sessions(user_id, study_date);

create table if not exists public.study_session_parts (
  user_id uuid not null,
  session_id text not null,
  position integer not null check (position between 0 and 6),
  part integer not null check (part between 1 and 7),
  correct integer not null check (correct >= 0),
  total integer not null check (total > 0),
  extra jsonb not null default '{}'::jsonb check (jsonb_typeof(extra) = 'object'),
  primary key (user_id, session_id, position),
  foreign key (user_id, session_id) references public.study_sessions(user_id, id) on delete cascade,
  check (correct <= total and total <= (array[6,25,39,30,30,16,54])[part])
);

create table if not exists public.mistakes (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null check (length(id) between 1 and 200),
  part integer not null check (part between 1 and 7),
  category text not null check (category in ('VOCABULARY_TRAP','ADVANCED_GRAMMAR','LISTENING_SPEED','TIME_PRESSURE','CARELESS_DISTRACTION','OTHER')),
  status text not null check (status in ('NEEDS_REVIEW','MASTERED')),
  question_context text not null check (length(question_context) <= 16000),
  user_mistake text not null check (length(user_mistake) <= 4000),
  correct_answer text not null check (length(correct_answer) <= 2000),
  trap_tip text check (length(trap_tip) <= 4000),
  options text[] check (cardinality(options) <= 4),
  tags text[] not null default '{}' check (cardinality(tags) <= 20),
  created_at timestamptz not null,
  next_review_date date,
  review_stage integer check (review_stage >= 0),
  review_count integer check (review_count >= 0),
  last_reviewed_at timestamptz,
  -- The test the card came from. Not a foreign key: a card keeps its source
  -- after the study record is deleted or when it was imported without it.
  session_id text check (length(session_id) <= 200),
  extra jsonb not null default '{}'::jsonb check (jsonb_typeof(extra) = 'object'),
  updated_at timestamptz not null,
  server_version bigint not null default nextval('private.sync_version'),
  primary key (user_id, id)
);
create index if not exists mistakes_version on public.mistakes(user_id, server_version);
-- Attempt analysis reads the cards of one test.
create index if not exists mistakes_session on public.mistakes(user_id, session_id);
-- League stars: cards added or reviewed since last Monday (OR of both).
create index if not exists mistakes_created on public.mistakes(user_id, created_at);
create index if not exists mistakes_reviewed on public.mistakes(user_id, last_reviewed_at) where last_reviewed_at is not null;

create table if not exists public.vocabulary_logs (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null check (length(id) between 1 and 200),
  study_date date not null,
  word_count integer not null check (word_count between 1 and 10000),
  extra jsonb not null default '{}'::jsonb check (jsonb_typeof(extra) = 'object'),
  updated_at timestamptz not null,
  server_version bigint not null default nextval('private.sync_version'),
  primary key (user_id, id)
);
create index if not exists vocabulary_logs_version on public.vocabulary_logs(user_id, server_version);
create index if not exists vocabulary_logs_date on public.vocabulary_logs(user_id, study_date);

create table if not exists public.pacing_runs (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null check (length(id) between 1 and 200),
  preset_id text not null,
  preset_name text not null,
  study_date date not null,
  planned_minutes numeric not null check (planned_minutes >= 0 and planned_minutes::text not in ('NaN','Infinity','-Infinity')),
  actual_minutes numeric not null check (actual_minutes >= 0 and actual_minutes::text not in ('NaN','Infinity','-Infinity')),
  finished_naturally boolean not null,
  created_at timestamptz not null,
  extra jsonb not null default '{}'::jsonb check (jsonb_typeof(extra) = 'object'),
  updated_at timestamptz not null,
  server_version bigint not null default nextval('private.sync_version'),
  primary key (user_id, id)
);
create index if not exists pacing_runs_version on public.pacing_runs(user_id, server_version);
create index if not exists pacing_runs_date on public.pacing_runs(user_id, study_date);

create table if not exists public.pacing_run_phases (
  user_id uuid not null,
  run_id text not null,
  position integer not null check (position between 0 and 99),
  name text not null check (length(name) <= 200),
  planned_minutes numeric not null check (planned_minutes >= 0 and planned_minutes::text not in ('NaN','Infinity','-Infinity')),
  actual_minutes numeric not null check (actual_minutes >= 0 and actual_minutes::text not in ('NaN','Infinity','-Infinity')),
  overrun_minutes numeric not null check (overrun_minutes::text not in ('NaN','Infinity','-Infinity')),
  extra jsonb not null default '{}'::jsonb check (jsonb_typeof(extra) = 'object'),
  primary key (user_id, run_id, position),
  foreign key (user_id, run_id) references public.pacing_runs(user_id, id) on delete cascade
);

create table if not exists public.streak_shields (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null check (length(id) between 1 and 200),
  study_date date not null,
  extra jsonb not null default '{}'::jsonb check (jsonb_typeof(extra) = 'object'),
  updated_at timestamptz not null,
  server_version bigint not null default nextval('private.sync_version'),
  primary key (user_id, id)
);
create index if not exists streak_shields_version on public.streak_shields(user_id, server_version);

create table if not exists public.sync_tombstones (
  user_id uuid not null references auth.users(id) on delete cascade,
  entity_type text not null check (entity_type in ('sessions','mistakes','vocabLog','pacingRuns','shieldDays')),
  record_id text not null check (length(record_id) between 1 and 200),
  updated_at timestamptz not null,
  deleted_at timestamptz not null,
  server_version bigint not null default nextval('private.sync_version'),
  primary key (user_id, entity_type, record_id)
);
create index if not exists sync_tombstones_version on public.sync_tombstones(user_id, server_version);
comment on table public.sync_tombstones is 'Deleted record ids and versions only; no learning content.';

create table if not exists public.learning_data_resets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  reset_at timestamptz not null,
  server_version bigint not null
);
comment on table public.learning_data_resets is 'Reset barrier: devices that have not seen the reset cannot re-upload erased data.';

-- ---------------------------------------------------------------------------
-- AI access, plans, quotas and operational ledgers. No question text, IPs or
-- tokens are stored: only hashes, counters and short-lived results.
-- ---------------------------------------------------------------------------

-- Admin switch only (Supabase Table Editor). The per-account AI cap lives in
-- user_plans, so there is exactly one place for it.
create table if not exists public.ai_access_grants (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null default '',
  display_name text not null default '',
  status text not null default 'active' check (status in ('pending','active','blocked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.ai_access_grants is 'AI on/off per account: set status=blocked to stop one. Monthly caps are in user_plans.';
comment on column public.ai_access_grants.email is 'Search/display only, copied from Auth. Authorization always uses user_id.';

-- One row per account that is not on the default free plan (or has a custom
-- cap). No row = free plan with the backend default cap.
create table if not exists public.user_plans (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan text not null default 'free' check (plan in ('free','plus','admin')),
  -- NULL = never expires. An expired plan counts as free (and its cap is ignored).
  expires_at timestamptz,
  -- NULL = the plan's default monthly AI cap from the backend settings.
  -- plan 'admin' is always unlimited.
  ai_monthly_limit integer check (ai_monthly_limit between 1 and 10000),
  updated_at timestamptz not null default now()
);
comment on table public.user_plans is 'Plan and monthly AI cap per account. admin = unlimited AI; expired plans fall back to free.';

create table if not exists public.redeem_codes (
  id bigint generated always as identity primary key,
  -- HMAC-SHA-256 of the normalised code, hex. The code itself is never stored.
  code_hash text not null unique check (code_hash ~ '^[a-f0-9]{64}$'),
  plan text not null check (plan in ('plus','admin')),
  duration_days integer not null check (duration_days between 1 and 3660),
  max_redemptions integer not null default 1 check (max_redemptions between 1 and 100000),
  redeemed_count integer not null default 0 check (redeemed_count >= 0),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  note text not null default '' check (length(note) <= 500),
  check (redeemed_count <= max_redemptions)
);

create table if not exists public.redeem_code_uses (
  code_id bigint not null references public.redeem_codes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  redeemed_at timestamptz not null default now(),
  primary key (code_id, user_id)
);
create index if not exists redeem_code_uses_user on public.redeem_code_uses(user_id);

create table if not exists public.ai_usage_counters (
  bucket text primary key,
  user_id uuid references auth.users(id) on delete cascade,
  used integer not null default 0 check (used >= 0),
  expires_at timestamptz
);
create index if not exists ai_usage_counters_user on public.ai_usage_counters(user_id) where user_id is not null;
create index if not exists ai_usage_counters_expiry on public.ai_usage_counters(expires_at) where expires_at is not null;

create table if not exists public.ai_requests (
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  input_hash text not null check (input_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  primary key (user_id, request_id)
);
create index if not exists ai_requests_created on public.ai_requests(created_at);

create table if not exists public.ai_batches (
  user_id uuid not null references auth.users(id) on delete cascade,
  batch_id uuid not null,
  chunks integer not null default 1 check (chunks between 1 and 20),
  created_at timestamptz not null default now(),
  primary key (user_id, batch_id)
);
create index if not exists ai_batches_created on public.ai_batches(created_at);

create table if not exists public.ai_explanation_questions (
  user_id uuid not null references auth.users(id) on delete cascade,
  ticket_id uuid not null,
  question_number integer not null check (question_number between 1 and 200),
  binding text not null check (binding ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz not null,
  attempts integer not null default 0 check (attempts between 0 and 3),
  lease_id uuid,
  lease_until timestamptz,
  invalidated boolean not null default false,
  result jsonb check (result is null or (jsonb_typeof(result) = 'object' and octet_length(result::text) <= 131072)),
  primary key (user_id, ticket_id, question_number),
  check ((lease_id is null) = (lease_until is null))
);
create index if not exists ai_explanation_questions_expiry on public.ai_explanation_questions(expires_at);

create table if not exists public.ai_explanation_requests (
  user_id uuid not null,
  ticket_id uuid not null,
  question_number integer not null,
  request_id uuid not null,
  attempt integer not null check (attempt between 1 and 3),
  status text not null check (status in ('running','failed','unknown','completed')),
  primary key (user_id, ticket_id, question_number, request_id),
  foreign key (user_id, ticket_id, question_number)
    references public.ai_explanation_questions(user_id, ticket_id, question_number) on delete cascade
);

-- Short-lived per-account API counters (per minute; 'redeem' per hour).
create table if not exists public.api_rate_limits (
  user_id uuid not null references auth.users(id) on delete cascade,
  bucket text not null check (bucket in ('account','sync','usage','ai','destructive','redeem')),
  window_start timestamptz not null,
  used integer not null check (used > 0),
  primary key (user_id, bucket, window_start)
);
create index if not exists api_rate_limits_window on public.api_rate_limits(window_start);

-- ---------------------------------------------------------------------------
-- Weekly league (Giải đấu tuần). Opt-in; ranked by backend-computed stars.
-- ---------------------------------------------------------------------------

create table if not exists public.league_weeks (
  week_start date primary key check (extract(isodow from week_start) = 1),
  rolled_at timestamptz not null default now()
);

create table if not exists public.league_groups (
  id bigint generated always as identity primary key,
  week_start date not null references public.league_weeks(week_start) on delete cascade,
  tier smallint not null check (tier between 1 and 4),
  created_at timestamptz not null default now()
);
create index if not exists league_groups_week_tier on public.league_groups(week_start, tier, id);

create table if not exists public.league_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  nickname text not null check (char_length(nickname) between 2 and 20 and nickname !~ '[[:cntrl:]]' and nickname = btrim(nickname)),
  coat text not null default 'nau-cam' check (coat ~ '^[a-z0-9-]{2,24}$'),
  -- 1 Đồng, 2 Bạc, 3 Vàng, 4 Kim cương.
  tier smallint not null default 1 check (tier between 1 and 4),
  -- This week's group; null when not placed or opted out.
  group_id bigint references public.league_groups(id) on delete set null,
  joined_at timestamptz not null default now(),
  opted_out_at timestamptz,
  updated_at timestamptz not null default now()
);
create index if not exists league_members_group on public.league_members(group_id) where group_id is not null;

create table if not exists public.league_standings (
  week_start date not null references public.league_weeks(week_start) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  group_id bigint not null references public.league_groups(id) on delete cascade,
  nickname text not null check (char_length(nickname) between 2 and 20),
  coat text not null check (coat ~ '^[a-z0-9-]{2,24}$'),
  stars integer not null default 0 check (stars between 0 and 420),
  -- When the current star count was first reached: earlier wins a tie.
  reached_at timestamptz not null default now(),
  final_rank smallint check (final_rank between 1 and 20),
  outcome text check (outcome in ('up','stay','down')),
  primary key (week_start, user_id)
);
create index if not exists league_standings_group on public.league_standings(group_id, stars desc);
create index if not exists league_standings_user on public.league_standings(user_id, week_start);
create index if not exists league_standings_unranked on public.league_standings(group_id) where final_rank is null;
comment on table public.league_standings is 'Weekly league rows. Stars come from the backend star table over synced rows; 12 weeks are kept.';

-- ---------------------------------------------------------------------------
-- Sync: wire projection and storage
-- ---------------------------------------------------------------------------

-- Identity/version of every record (live and deleted) without building payloads.
create or replace view private.sync_keys as
  select user_id, 'profile'::text as entity_type, 'profile'::text as record_id, updated_at, null::timestamptz as deleted_at, server_version from public.user_profiles
  union all select user_id, 'sessions', id, updated_at, null, server_version from public.study_sessions
  union all select user_id, 'mistakes', id, updated_at, null, server_version from public.mistakes
  union all select user_id, 'vocabLog', id, updated_at, null, server_version from public.vocabulary_logs
  union all select user_id, 'pacingRuns', id, updated_at, null, server_version from public.pacing_runs
  union all select user_id, 'shieldDays', id, updated_at, null, server_version from public.streak_shields
  union all select user_id, entity_type, record_id, updated_at, deleted_at, server_version from public.sync_tombstones;

-- The JSON shape browsers have always received from POST /api/v1/sync.
create or replace view private.sync_rows as
select r.user_id, 'profile'::text as entity_type, 'profile'::text as record_id,
  r.extra || jsonb_strip_nulls(jsonb_build_object('name',r.name,'targetScore',r.target_score,'examDate',coalesce(r.exam_date::text,''),
    'selectedSkill',r.selected_skill,'dailyMinGoalMinutes',r.daily_goal_minutes,'streakFreezes',r.streak_freezes,
    'shieldAllowance',r.shield_allowance,'currentStreak',r.current_streak,'longestStreak',r.longest_streak,
    'lastStudyDate',coalesce(r.last_study_date::text,''),'motto',r.motto)) as payload,
  r.updated_at, null::timestamptz as deleted_at, r.server_version
from public.user_profiles r
union all
select r.user_id, 'sessions', r.id,
  r.extra || jsonb_strip_nulls(jsonb_build_object('id',r.id,'skillType',r.skill_type,'sessionType',r.session_type,'testName',r.test_name,
    'date',r.study_date,'durationMinutes',r.duration_minutes,'createdAt',r.created_at,'rawListening',r.raw_listening,
    'rawReading',r.raw_reading,'scaledListening',r.scaled_listening,'scaledReading',r.scaled_reading,'totalScore',r.total_score,
    'attemptNumber',r.attempt_number,'notes',r.notes,
    'partScores',case when r.part1_correct is not null then jsonb_build_object('part1',r.part1_correct,'part2',r.part2_correct,
      'part3',r.part3_correct,'part4',r.part4_correct,'part5',r.part5_correct,'part6',r.part6_correct,'part7',r.part7_correct) end,
    'practiceParts',case when r.has_practice_parts then coalesce((select jsonb_agg(p.extra || jsonb_build_object('part',p.part,'correct',p.correct,'total',p.total) order by p.position)
      from public.study_session_parts p where p.user_id = r.user_id and p.session_id = r.id), '[]'::jsonb) end)),
  r.updated_at, null, r.server_version
from public.study_sessions r
union all
select r.user_id, 'mistakes', r.id,
  r.extra || jsonb_strip_nulls(jsonb_build_object('id',r.id,'part',r.part,'category',r.category,'status',r.status,
    'questionContext',r.question_context,'userMistake',r.user_mistake,'correctAnswer',r.correct_answer,'trapTip',r.trap_tip,
    'options',r.options,'tags',r.tags,'createdAt',r.created_at,'nextReviewDate',r.next_review_date,'reviewStage',r.review_stage,
    'reviewCount',r.review_count,'lastReviewedAt',r.last_reviewed_at,'sessionId',r.session_id)),
  r.updated_at, null, r.server_version
from public.mistakes r
union all
select r.user_id, 'vocabLog', r.id,
  r.extra || jsonb_strip_nulls(jsonb_build_object('id',r.id,'date',r.study_date,'count',r.word_count)),
  r.updated_at, null, r.server_version
from public.vocabulary_logs r
union all
select r.user_id, 'pacingRuns', r.id,
  r.extra || jsonb_strip_nulls(jsonb_build_object('id',r.id,'presetId',r.preset_id,'presetName',r.preset_name,'date',r.study_date,
    'plannedMinutes',r.planned_minutes,'actualMinutes',r.actual_minutes,'finishedNaturally',r.finished_naturally,'createdAt',r.created_at,
    'phases',coalesce((select jsonb_agg(p.extra || jsonb_build_object('name',p.name,'plannedMinutes',p.planned_minutes,
      'actualMinutes',p.actual_minutes,'overrunMinutes',p.overrun_minutes) order by p.position)
      from public.pacing_run_phases p where p.user_id = r.user_id and p.run_id = r.id), '[]'::jsonb))),
  r.updated_at, null, r.server_version
from public.pacing_runs r
union all
select r.user_id, 'shieldDays', r.id,
  r.extra || jsonb_strip_nulls(jsonb_build_object('id',r.id,'date',r.study_date)),
  r.updated_at, null, r.server_version
from public.streak_shields r
union all
select t.user_id, t.entity_type, t.record_id, jsonb_build_object('id',t.record_id), t.updated_at, t.deleted_at, t.server_version
from public.sync_tombstones t;

create or replace function private.entity_table(p_entity text) returns text
language sql immutable set search_path = '' as $$
  select case p_entity when 'profile' then 'user_profiles' when 'sessions' then 'study_sessions' when 'mistakes' then 'mistakes'
    when 'vocabLog' then 'vocabulary_logs' when 'pacingRuns' then 'pacing_runs' when 'shieldDays' then 'streak_shields' end
$$;

create or replace function private.table_entity(p_table text) returns text
language sql immutable set search_path = '' as $$
  select case p_table when 'user_profiles' then 'profile' when 'study_sessions' then 'sessions' when 'mistakes' then 'mistakes'
    when 'vocabulary_logs' then 'vocabLog' when 'pacing_runs' then 'pacingRuns' when 'streak_shields' then 'shieldDays' end
$$;

-- Serialises every write and cursor read of one account. A later-committing
-- transaction can never publish a version below a cursor already handed out.
create or replace function private.lock_account(p_user_id uuid) returns void
language sql set search_path = '' as $$
  select pg_advisory_xact_lock(hashtextextended(p_user_id::text, 20261005));
$$;

-- Marks the current transaction as the sync writer: triggers then leave
-- versions, timestamps and tombstones to the caller.
create or replace function private.set_writer(p_on boolean) returns void
language sql set search_path = '' as $$
  select set_config('toeic.sync_writer', case when p_on then 'on' else 'off' end, true);
$$;

create or replace function private.is_writer() returns boolean
language sql stable set search_path = '' as $$
  select coalesce(current_setting('toeic.sync_writer', true), '') = 'on';
$$;

-- Last-writer-wins store of one wire record. Returns true when it changed.
-- Equal timestamps: a deletion beats a live record, otherwise the server wins.
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

create or replace function private.sync_snapshot(p_user_id uuid, p_cursor bigint, p_submitted jsonb, p_extra jsonb default '{}'::jsonb)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare latest bigint; rows_json jsonb; epoch text;
begin
  select coalesce(max(server_version), 0) into latest from private.sync_keys where user_id = p_user_id;
  select value into epoch from private.settings where key = 'sync_epoch';
  -- A cursor from another database generation (p_cursor > latest) gets everything.
  select coalesce(jsonb_agg(jsonb_build_object('entity_type',v.entity_type,'record_id',v.record_id,'payload',v.payload,
      'updated_at',v.updated_at,'deleted_at',v.deleted_at) order by v.entity_type, v.record_id), '[]'::jsonb)
    into rows_json from private.sync_rows v
    where v.user_id = p_user_id and (p_cursor > latest or v.server_version > p_cursor
      or (v.entity_type, v.record_id) in (select s->>'entity_type', s->>'record_id' from jsonb_array_elements(p_submitted) s));
  return jsonb_build_object('cursor', latest, 'records', rows_json, 'hasRecords', latest > 0, 'epoch', epoch) || p_extra;
end;
$$;

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
  existing record;
  result jsonb;
begin
  if p_user_id is null or p_cursor is null or p_cursor < 0 or jsonb_typeof(p_records) is distinct from 'array'
     or jsonb_array_length(p_records) > 10000 or octet_length(p_records::text) > 4194304 then
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
    perform private.store_record(p_user_id, item->>'entity_type', item->>'record_id', item->'payload', stamp, removed);
  end loop;
  if (select count(*) from private.sync_keys where user_id = p_user_id) > 10000 then
    raise exception 'Account record limit reached';
  end if;
  if p_replace then
    -- Records only the server had are deleted, so other devices drop them too.
    for existing in select k.entity_type, k.record_id from private.sync_keys k
        where k.user_id = p_user_id and k.deleted_at is null and k.entity_type <> 'profile'
          and (k.entity_type, k.record_id) not in (select s->>'entity_type', s->>'record_id' from jsonb_array_elements(records) s) loop
      perform private.store_record(p_user_id, existing.entity_type, existing.record_id, jsonb_build_object('id', existing.record_id), override_at, override_at);
    end loop;
  end if;
  result := private.sync_snapshot(p_user_id, p_cursor, records);
  perform private.set_writer(false);
  return result;
end;
$$;

-- Erases the account's learning data (not the account) and raises a barrier.
create or replace function public.reset_learning_data(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare existing record; reset_time timestamptz; latest bigint; result jsonb;
begin
  if p_user_id is null or not exists (select 1 from auth.users where id = p_user_id and not is_anonymous) then
    raise exception 'Permanent account required';
  end if;
  perform private.lock_account(p_user_id);
  perform private.set_writer(true);
  select greatest(clock_timestamp(), coalesce(max(updated_at) + interval '1 millisecond', clock_timestamp()))
    into reset_time from private.sync_keys where user_id = p_user_id;
  for existing in select entity_type, record_id from private.sync_keys
      where user_id = p_user_id and entity_type <> 'profile' and deleted_at is null loop
    perform private.store_record(p_user_id, existing.entity_type, existing.record_id, jsonb_build_object('id', existing.record_id), reset_time, reset_time);
  end loop;
  perform private.store_record(p_user_id, 'profile', 'profile', jsonb_build_object(
    'name','Học viên','targetScore',990,'examDate','','currentStreak',0,'longestStreak',0,'streakFreezes',2,
    'shieldAllowance',2,'lastStudyDate','','dailyMinGoalMinutes',30,'motto','','selectedSkill','LR'), reset_time, null);
  select coalesce(max(server_version), 0) into latest from private.sync_keys where user_id = p_user_id;
  insert into public.learning_data_resets(user_id, reset_at, server_version) values (p_user_id, reset_time, latest)
    on conflict (user_id) do update set reset_at = excluded.reset_at, server_version = excluded.server_version;
  -- Cached AI explanations are learning content too; fence in-flight writers.
  update public.ai_explanation_questions set result = null, lease_id = null, lease_until = null, invalidated = true where user_id = p_user_id;
  update public.ai_explanation_requests set status = 'unknown' where user_id = p_user_id and status = 'running';
  result := private.sync_snapshot(p_user_id, 9223372036854775807, '[]'::jsonb, '{"resetBarrier": true, "hasRecords": true}'::jsonb);
  perform private.set_writer(false);
  return result;
end;
$$;

-- Operator edits in the Table Editor still reach every device: they get a
-- new version, and hard deletes leave a tombstone. Auth account deletion
-- (cascade) leaves nothing behind.
create or replace function private.stamp_record() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if private.is_writer() then return new; end if;
  perform private.lock_account(new.user_id);
  if tg_op = 'UPDATE' then
    if new.user_id is distinct from old.user_id or (tg_table_name <> 'user_profiles' and to_jsonb(new)->>'id' is distinct from to_jsonb(old)->>'id') then
      raise exception 'Record identity is immutable';
    end if;
    new.updated_at := greatest(clock_timestamp(), old.updated_at + interval '1 millisecond');
  else
    new.updated_at := coalesce(new.updated_at, clock_timestamp());
    delete from public.sync_tombstones where user_id = new.user_id and entity_type = private.table_entity(tg_table_name)
      and record_id = coalesce(to_jsonb(new)->>'id', 'profile');
  end if;
  new.server_version := nextval('private.sync_version');
  return new;
end;
$$;

create or replace function private.tombstone_deleted() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if private.is_writer() or tg_table_name = 'user_profiles' or not exists (select 1 from auth.users where id = old.user_id) then
    return null;
  end if;
  perform private.lock_account(old.user_id);
  insert into public.sync_tombstones(user_id, entity_type, record_id, updated_at, deleted_at, server_version)
    values (old.user_id, private.table_entity(tg_table_name), to_jsonb(old)->>'id', clock_timestamp(), clock_timestamp(), nextval('private.sync_version'))
    on conflict (user_id, entity_type, record_id) do update
      set updated_at = excluded.updated_at, deleted_at = excluded.deleted_at, server_version = excluded.server_version;
  return null;
end;
$$;

create or replace function private.touch_parent() returns trigger
language plpgsql security definer set search_path = '' as $$
declare row_value jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
begin
  if private.is_writer() or not exists (select 1 from auth.users where id = (row_value->>'user_id')::uuid) then return null; end if;
  if tg_op = 'UPDATE' and (to_jsonb(old)->>'user_id' is distinct from row_value->>'user_id'
      or to_jsonb(old)->>tg_argv[1] is distinct from row_value->>tg_argv[1]) then
    raise exception 'Child ownership is immutable';
  end if;
  if tg_argv[0] = 'study_sessions' then
    update public.study_sessions set has_practice_parts = true where user_id = (row_value->>'user_id')::uuid and id = row_value->>tg_argv[1];
  else
    update public.pacing_runs set updated_at = updated_at where user_id = (row_value->>'user_id')::uuid and id = row_value->>tg_argv[1];
  end if;
  return null;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['user_profiles','study_sessions','mistakes','vocabulary_logs','pacing_runs','streak_shields'] loop
    execute format('drop trigger if exists stamp_record on public.%I', t);
    execute format('create trigger stamp_record before insert or update on public.%I for each row execute function private.stamp_record()', t);
    execute format('drop trigger if exists tombstone_deleted on public.%I', t);
    execute format('create trigger tombstone_deleted after delete on public.%I for each row execute function private.tombstone_deleted()', t);
  end loop;
end;
$$;
drop trigger if exists touch_parent on public.study_session_parts;
create trigger touch_parent after insert or update or delete on public.study_session_parts
  for each row execute function private.touch_parent('study_sessions', 'session_id');
drop trigger if exists touch_parent on public.pacing_run_phases;
create trigger touch_parent after insert or update or delete on public.pacing_run_phases
  for each row execute function private.touch_parent('pacing_runs', 'run_id');

-- ---------------------------------------------------------------------------
-- AI access and plans
-- ---------------------------------------------------------------------------

create or replace function private.normalize_ai_access_grant() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- A copied email can never grant another account: display fields follow Auth.
  select coalesce(lower(u.email), ''), left(coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', ''), 160)
    into new.email, new.display_name from auth.users u where u.id = new.user_id;
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists normalize_ai_access_grant on public.ai_access_grants;
create trigger normalize_ai_access_grant before insert or update on public.ai_access_grants
  for each row execute function private.normalize_ai_access_grant();

-- New permanent accounts get a row (status active) so admins can find and block them.
create or replace function private.register_ai_access_grant() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.is_anonymous is false and coalesce(new.email, '') <> '' then
    insert into public.ai_access_grants(user_id) values (new.id)
      on conflict (user_id) do update set email = excluded.email, display_name = excluded.display_name;
  end if;
  return new;
end;
$$;
drop trigger if exists register_ai_access_grant on auth.users;
create trigger register_ai_access_grant after insert or update of email, is_anonymous, raw_user_meta_data on auth.users
  for each row execute function private.register_ai_access_grant();

create or replace function private.active_plan(p_user_id uuid, p_now timestamptz default now())
returns table(plan text, expires_at timestamptz, ai_monthly_limit integer)
language sql stable security definer set search_path = '' as $$
  select coalesce(p.plan, 'free'), p.expires_at, p.ai_monthly_limit
  from (select 1) one
  left join public.user_plans p on p.user_id = p_user_id and (p.expires_at is null or p.expires_at > p_now)
$$;

-- What the backend needs to allow AI: status from ai_access_grants (no row =
-- active), plan and cap from user_plans. monthlyLimit null = backend default
-- for the plan; unlimited = admin plan.
create or replace function public.get_ai_access(p_user_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare grant_status text; current_plan record;
begin
  if p_user_id is null then raise exception 'Invalid AI access request'; end if;
  select status into grant_status from public.ai_access_grants where user_id = p_user_id;
  select * into current_plan from private.active_plan(p_user_id);
  return jsonb_build_object('status', coalesce(grant_status, 'active'), 'plan', current_plan.plan,
    'planExpiresAt', current_plan.expires_at, 'unlimited', current_plan.plan = 'admin',
    'monthlyLimit', case when current_plan.plan = 'admin' then null else current_plan.ai_monthly_limit end);
end;
$$;

-- Redeem a plan code. p_code_hash is the backend's HMAC of the typed code.
-- Wrong attempts (invalid/expired/exhausted/already_used) count against the
-- 'redeem' bucket: 5 per hour per account.
create or replace function public.redeem_code(p_user uuid, p_code_hash text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  stamp timestamptz := clock_timestamp();
  hour_start timestamptz := date_trunc('hour', clock_timestamp());
  failures integer;
  code public.redeem_codes;
  current_plan record;
  failure text;
  rank_now integer;
  rank_code integer;
  new_expiry timestamptz;
begin
  if p_user is null or p_code_hash is null or p_code_hash !~ '^[a-f0-9]{64}$' then raise exception 'Invalid redeem request'; end if;
  if not exists (select 1 from auth.users where id = p_user and not is_anonymous) then raise exception 'Permanent account required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user::text, 20261006));
  select used into failures from public.api_rate_limits where user_id = p_user and bucket = 'redeem' and window_start = hour_start;
  if coalesce(failures, 0) >= 5 then
    return jsonb_build_object('ok', false, 'code', 'rate_limited',
      'retryAfter', greatest(1, ceil(extract(epoch from hour_start + interval '1 hour' - stamp))::integer));
  end if;
  select * into code from public.redeem_codes where code_hash = p_code_hash for update;
  if not found then failure := 'invalid';
  elsif code.expires_at is not null and code.expires_at <= stamp then failure := 'expired';
  elsif exists (select 1 from public.redeem_code_uses where code_id = code.id and user_id = p_user) then failure := 'already_used';
  elsif code.redeemed_count >= code.max_redemptions then failure := 'exhausted';
  end if;
  if failure is not null then
    insert into public.api_rate_limits as r(user_id, bucket, window_start, used) values (p_user, 'redeem', hour_start, 1)
      on conflict (user_id, bucket, window_start) do update set used = r.used + 1;
    return jsonb_build_object('ok', false, 'code', failure);
  end if;

  perform 1 from public.user_plans where user_id = p_user for update;
  select * into current_plan from private.active_plan(p_user, stamp);
  rank_now := array_position(array['free','plus','admin'], current_plan.plan);
  rank_code := array_position(array['free','plus','admin'], code.plan);
  if rank_now > rank_code or (rank_now = rank_code and current_plan.expires_at is null) then
    -- The account already has this or more, for good: keep the code unused.
    return jsonb_build_object('ok', false, 'code', 'not_needed', 'plan', current_plan.plan);
  end if;
  new_expiry := case when rank_now = rank_code then current_plan.expires_at else stamp end + make_interval(days => code.duration_days);
  insert into public.user_plans as p(user_id, plan, expires_at, ai_monthly_limit, updated_at)
    values (p_user, code.plan, new_expiry, null, stamp)
    on conflict (user_id) do update set plan = excluded.plan, expires_at = excluded.expires_at, updated_at = excluded.updated_at,
      ai_monthly_limit = case when rank_now = rank_code then p.ai_monthly_limit else null end;
  insert into public.redeem_code_uses(code_id, user_id, redeemed_at) values (code.id, p_user, stamp);
  update public.redeem_codes set redeemed_count = redeemed_count + 1 where id = code.id;
  return jsonb_build_object('ok', true, 'plan', code.plan, 'expiresAt', new_expiry);
end;
$$;

-- ---------------------------------------------------------------------------
-- AI quotas. private.ai_quota_buckets is the only definition of bucket keys;
-- the backend reads them through public.ai_quota_status.
-- ---------------------------------------------------------------------------

create or replace function private.ai_quota_buckets(p_user_id uuid, p_guest boolean, p_ip_hash text, p_now timestamptz)
returns table(pos integer, kind text, bucket text, expires_at timestamptz)
language sql stable set search_path = '' as $$
  with t as (select p_now at time zone 'UTC' as utc)
  select 1, case when p_guest then 'guest' else 'month' end,
      'user:' || p_user_id::text || case when p_guest then ':guest' else ':' || to_char(utc, 'YYYY-MM') end,
      case when p_guest then null else (date_trunc('month', utc) + interval '1 month') at time zone 'UTC' end from t
  union all select 2, 'day', 'day:' || to_char(utc, 'YYYY-MM-DD'), (date_trunc('day', utc) + interval '1 day') at time zone 'UTC' from t
  union all select 3, 'minute', 'minute:' || to_char(utc, 'YYYY-MM-DD-HH24-MI'), (date_trunc('minute', utc) + interval '1 minute') at time zone 'UTC' from t
  union all select 4, 'ip', 'ip:' || p_ip_hash || ':' || to_char(utc, 'YYYY-MM-DD'), (date_trunc('day', utc) + interval '1 day') at time zone 'UTC' from t
$$;

create or replace function public.ai_quota_status(p_user_id uuid, p_guest boolean, p_ip_hash text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('kind', b.kind, 'bucket', b.bucket, 'used', coalesce(c.used, 0), 'resetsAt', b.expires_at) order by b.pos), '[]'::jsonb)
  from private.ai_quota_buckets(p_user_id, p_guest, p_ip_hash, now()) b
  left join public.ai_usage_counters c on c.bucket = b.bucket
$$;

create or replace function public.get_ai_usage(p_user_id uuid, p_guest boolean, p_limit integer)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('remaining', greatest(0, p_limit - coalesce(max(c.used), 0)), 'limit', p_limit, 'guest', p_guest)
  from private.ai_quota_buckets(p_user_id, p_guest, repeat('0', 64), now()) b
  left join public.ai_usage_counters c on c.bucket = b.bucket
  where b.pos = 1
$$;

-- Counts one AI request against every cap before generation. A per-account
-- lock covers idempotency, the account bucket and batches; the shared
-- day/minute/IP rows are locked in key order, so accounts never wait on a
-- global lock and can never deadlock. A NULL cap is unset (still counted).
create or replace function private.reserve_ai(p_user_id uuid, p_guest boolean, p_request_id uuid, p_batch_id uuid,
  p_input_hash text, p_ip_hash text, p_user_limit integer, p_day_limit integer, p_minute_limit integer, p_ip_limit integer,
  p_max_chunks integer, p_ttl_seconds integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  quota_now timestamptz := now();
  limits integer[] := array[p_user_limit, p_day_limit, p_minute_limit, p_ip_limit];
  first_pos integer := 1;
  batch_chunks integer;
  batch_started timestamptz;
  counter record;
  blocked boolean := false;
  user_used integer;
begin
  if p_user_id is null or p_request_id is null or p_input_hash !~ '^[a-f0-9]{64}$' or p_ip_hash !~ '^[a-f0-9]{64}$'
     or least(p_user_limit, p_day_limit, p_minute_limit, p_ip_limit) < 0
     or (p_batch_id is not null and (p_max_chunks is null or p_max_chunks not between 1 and 20 or p_ttl_seconds is null or p_ttl_seconds < 1)) then
    raise exception 'Invalid reservation';
  end if;
  if not exists (select 1 from auth.users where id = p_user_id and is_anonymous = p_guest) then raise exception 'Invalid identity'; end if;
  perform pg_advisory_xact_lock(hashtextextended('ai:' || p_user_id::text, 20261120));
  if exists (select 1 from public.ai_requests where user_id = p_user_id and request_id = p_request_id) then
    return jsonb_build_object('allowed', false, 'code', 'duplicate');
  end if;
  if p_batch_id is not null then
    select chunks, created_at into batch_chunks, batch_started from public.ai_batches where user_id = p_user_id and batch_id = p_batch_id;
    if found and batch_started < quota_now - make_interval(secs => p_ttl_seconds) then
      delete from public.ai_batches where user_id = p_user_id and batch_id = p_batch_id;
      batch_chunks := null;
    end if;
    if batch_chunks is not null then
      if batch_chunks >= p_max_chunks then return jsonb_build_object('allowed', false, 'code', 'batch_full'); end if;
      -- Only the first request of a batch is charged to the account.
      first_pos := 2;
    end if;
  end if;
  insert into public.ai_usage_counters(bucket, user_id, used, expires_at)
    select b.bucket, case when b.pos = 1 then p_user_id end, 0, b.expires_at
    from private.ai_quota_buckets(p_user_id, p_guest, p_ip_hash, quota_now) b where b.pos >= first_pos order by b.bucket
    on conflict (bucket) do nothing;
  for counter in select b.pos, c.used from private.ai_quota_buckets(p_user_id, p_guest, p_ip_hash, quota_now) b
      join public.ai_usage_counters c on c.bucket = b.bucket where b.pos >= first_pos order by b.bucket for update of c loop
    if counter.used >= limits[counter.pos] then blocked := true; end if;
  end loop;
  if blocked then return jsonb_build_object('allowed', false, 'code', 'quota'); end if;
  insert into public.ai_requests(user_id, request_id, input_hash) values (p_user_id, p_request_id, p_input_hash);
  update public.ai_usage_counters c set used = c.used + 1
    from private.ai_quota_buckets(p_user_id, p_guest, p_ip_hash, quota_now) b where c.bucket = b.bucket and b.pos >= first_pos;
  if p_batch_id is not null then
    insert into public.ai_batches as a(user_id, batch_id) values (p_user_id, p_batch_id)
      on conflict (user_id, batch_id) do update set chunks = a.chunks + 1;
  end if;
  select c.used into user_used from private.ai_quota_buckets(p_user_id, p_guest, p_ip_hash, quota_now) b
    join public.ai_usage_counters c on c.bucket = b.bucket where b.pos = 1;
  return jsonb_build_object('allowed', true, 'remaining', p_user_limit - coalesce(user_used, 0), 'limit', p_user_limit);
end;
$$;

create or replace function public.reserve_ai_request(p_user_id uuid, p_guest boolean, p_request_id uuid, p_input_hash text, p_ip_hash text,
  p_user_limit integer, p_day_limit integer, p_minute_limit integer, p_ip_limit integer)
returns jsonb language sql security definer set search_path = '' as $$
  select private.reserve_ai(p_user_id, p_guest, p_request_id, null, p_input_hash, p_ip_hash, p_user_limit, p_day_limit, p_minute_limit, p_ip_limit, null, null)
$$;

-- One screenshot capture (up to ~10 pages, several requests sharing a batch
-- id) is one AI use; later requests only count against the shared caps.
create or replace function public.reserve_ai_batch_request(p_user_id uuid, p_guest boolean, p_request_id uuid, p_batch_id uuid,
  p_input_hash text, p_ip_hash text, p_user_limit integer, p_day_limit integer, p_minute_limit integer, p_ip_limit integer,
  p_max_chunks integer default 4, p_ttl_seconds integer default 3600)
returns jsonb language sql security definer set search_path = '' as $$
  select private.reserve_ai(p_user_id, p_guest, p_request_id, p_batch_id, p_input_hash, p_ip_hash,
    p_user_limit, p_day_limit, p_minute_limit, p_ip_limit, p_max_chunks, p_ttl_seconds)
$$;

create or replace function public.reserve_api_request(p_user_id uuid, p_scope text, p_account_limit integer, p_scope_limit integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare stamp timestamptz; current_window timestamptz; retry_seconds integer; account_used integer; scope_used integer;
begin
  if p_user_id is null or p_scope is null or p_scope not in ('sync','usage','ai','destructive')
     or p_account_limit is null or p_scope_limit is null
     or p_account_limit not between 1 and 10000 or p_scope_limit not between 1 and 1000 then
    raise exception 'Invalid API reservation';
  end if;
  if not exists (select 1 from auth.users where id = p_user_id) then raise exception 'Invalid identity'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 20261006));
  stamp := clock_timestamp();
  current_window := date_trunc('minute', stamp);
  retry_seconds := greatest(1, ceil(extract(epoch from current_window + interval '1 minute' - stamp))::integer);
  -- Per-account cleanup keeps the table small between maintenance runs.
  delete from public.api_rate_limits where user_id = p_user_id and bucket <> 'redeem' and window_start < current_window;
  select used into account_used from public.api_rate_limits where user_id = p_user_id and bucket = 'account' and window_start = current_window;
  select used into scope_used from public.api_rate_limits where user_id = p_user_id and bucket = p_scope and window_start = current_window;
  if coalesce(account_used, 0) >= p_account_limit or coalesce(scope_used, 0) >= p_scope_limit then
    return jsonb_build_object('allowed', false, 'retry_after', retry_seconds);
  end if;
  insert into public.api_rate_limits as r(user_id, bucket, window_start, used)
    values (p_user_id, 'account', current_window, 1), (p_user_id, p_scope, current_window, 1)
    on conflict (user_id, bucket, window_start) do update set used = r.used + 1;
  return jsonb_build_object('allowed', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- Explanation ledger: one paid screenshot reading may explain its questions
-- (first attempt + two retries each), with leases fencing late writers.
-- ---------------------------------------------------------------------------

create or replace function public.claim_explanation_question(p_user_id uuid, p_ticket_id uuid, p_question_number integer, p_binding text,
  p_expires_at timestamptz, p_request_id uuid, p_lease_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  stamp timestamptz := clock_timestamp();
  q public.ai_explanation_questions%rowtype;
  prior public.ai_explanation_requests%rowtype;
begin
  if p_user_id is null or p_ticket_id is null or p_question_number is null or p_question_number not between 1 and 200
     or p_binding is null or p_binding !~ '^[a-f0-9]{64}$' or p_request_id is null or p_lease_id is null or p_expires_at is null
     or p_expires_at <= stamp or p_expires_at > stamp + interval '24 hours 1 minute' then
    raise exception 'Invalid explanation claim';
  end if;
  -- Same lock as sync/reset: a reset either commits first or scrubs this row.
  perform private.lock_account(p_user_id);
  if exists (select 1 from public.learning_data_resets where user_id = p_user_id and reset_at >= p_expires_at - interval '24 hours') then
    return jsonb_build_object('action', 'invalidated');
  end if;
  insert into public.ai_explanation_questions(user_id, ticket_id, question_number, binding, expires_at)
    values (p_user_id, p_ticket_id, p_question_number, p_binding, p_expires_at) on conflict do nothing;
  select * into q from public.ai_explanation_questions
    where user_id = p_user_id and ticket_id = p_ticket_id and question_number = p_question_number for update;
  if q.binding <> p_binding or q.expires_at <> p_expires_at then return jsonb_build_object('action', 'content_changed'); end if;
  if q.invalidated then return jsonb_build_object('action', 'invalidated'); end if;
  if q.result is not null then
    return jsonb_build_object('action', 'completed', 'draft', q.result, 'remainingAttempts', 3 - q.attempts);
  end if;
  -- A vanished worker's attempt may have been billed: never replay it silently.
  if q.lease_id is not null and q.lease_until <= stamp then
    update public.ai_explanation_requests set status = 'unknown'
      where user_id = p_user_id and ticket_id = p_ticket_id and question_number = p_question_number and status = 'running';
    update public.ai_explanation_questions set lease_id = null, lease_until = null
      where user_id = p_user_id and ticket_id = p_ticket_id and question_number = p_question_number;
    q.lease_id := null;
    q.lease_until := null;
  end if;
  select * into prior from public.ai_explanation_requests
    where user_id = p_user_id and ticket_id = p_ticket_id and question_number = p_question_number and request_id = p_request_id;
  if found then
    return jsonb_build_object('action', case when prior.status = 'running' then 'pending' else 'replayed' end, 'remainingAttempts', 3 - q.attempts);
  end if;
  if (select count(*) from public.ai_explanation_requests
      where user_id = p_user_id and ticket_id = p_ticket_id and question_number = p_question_number) >= 256 then
    return jsonb_build_object('action', 'pending', 'remainingAttempts', 3 - q.attempts);
  end if;
  if q.lease_id is not null then
    insert into public.ai_explanation_requests values (p_user_id, p_ticket_id, p_question_number, p_request_id, greatest(q.attempts, 1), 'running');
    return jsonb_build_object('action', 'pending', 'remainingAttempts', 3 - q.attempts);
  end if;
  if q.attempts >= 3 then return jsonb_build_object('action', 'exhausted', 'remainingAttempts', 0); end if;
  update public.ai_explanation_questions set attempts = attempts + 1, lease_id = p_lease_id, lease_until = stamp + interval '120 seconds'
    where user_id = p_user_id and ticket_id = p_ticket_id and question_number = p_question_number returning * into q;
  insert into public.ai_explanation_requests values (p_user_id, p_ticket_id, p_question_number, p_request_id, q.attempts, 'running');
  return jsonb_build_object('action', 'claimed', 'remainingAttempts', 3 - q.attempts);
end;
$$;

create or replace function public.finish_explanation_question(p_user_id uuid, p_ticket_id uuid, p_question_number integer,
  p_lease_id uuid, p_result jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare q public.ai_explanation_questions%rowtype;
begin
  if p_result is not null and (jsonb_typeof(p_result) <> 'object' or octet_length(p_result::text) > 131072) then
    raise exception 'Invalid explanation result';
  end if;
  select * into q from public.ai_explanation_questions
    where user_id = p_user_id and ticket_id = p_ticket_id and question_number = p_question_number for update;
  if not found or p_lease_id is null or q.lease_id is null or q.lease_until is null or q.invalidated
     or q.lease_id is distinct from p_lease_id or q.lease_until <= clock_timestamp() then
    return jsonb_build_object('accepted', false);
  end if;
  update public.ai_explanation_questions set result = p_result, lease_id = null, lease_until = null
    where user_id = p_user_id and ticket_id = p_ticket_id and question_number = p_question_number;
  update public.ai_explanation_requests set status = case when p_result is null then 'failed' else 'completed' end
    where user_id = p_user_id and ticket_id = p_ticket_id and question_number = p_question_number and attempt = q.attempts and status = 'running';
  return jsonb_build_object('accepted', true, 'remainingAttempts', 3 - q.attempts);
end;
$$;

-- ---------------------------------------------------------------------------
-- Weekly league
-- ---------------------------------------------------------------------------

-- Zone size for a group of n: none below 6, then n/3, at most 5.
create or replace function private.league_zone(p_size integer) returns integer
language sql immutable set search_path = '' as $$
  select case when p_size < 6 then 0 else least(5, p_size / 3) end
$$;

create or replace function private.league_finalize_before(p_week date) returns void
language plpgsql security definer set search_path = '' as $$
declare grp record;
begin
  for grp in select g.id, g.tier from public.league_groups g where g.week_start < p_week
      and exists (select 1 from public.league_standings s where s.group_id = g.id and s.final_rank is null)
      order by g.week_start, g.id loop
    with ranked as (
      select s.user_id, s.stars, row_number() over (order by s.stars desc, s.reached_at, s.user_id) as rnk, count(*) over () as n
      from public.league_standings s where s.group_id = grp.id
    ), zoned as (select r.*, private.league_zone(r.n::integer) as z from ranked r)
    update public.league_standings s set final_rank = z.rnk,
      outcome = case when z.rnk <= z.z and grp.tier < 4 and z.stars > 0 then 'up'
                     when z.rnk > z.n - z.z and grp.tier > 1 then 'down' else 'stay' end
    from zoned z where s.group_id = grp.id and s.user_id = z.user_id;
    update public.league_members m set tier = grp.tier + case s.outcome when 'up' then 1 else -1 end, updated_at = now()
      from public.league_standings s where s.group_id = grp.id and s.user_id = m.user_id and s.outcome <> 'stay';
  end loop;
end;
$$;

-- Lazy, idempotent rollover: the first request of a week finalises the last.
create or replace function private.league_rollover(p_week date) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.league_weeks where week_start = p_week) then return false; end if;
  perform pg_advisory_xact_lock(hashtextextended('league:rollover', 20261118));
  if exists (select 1 from public.league_weeks where week_start > p_week) then raise exception 'Stale league week'; end if;
  insert into public.league_weeks(week_start) values (p_week) on conflict do nothing;
  if not found then return false; end if;
  perform private.league_finalize_before(p_week);
  update public.league_members set group_id = null where group_id is not null;
  return true;
end;
$$;

-- Seat an active member for p_week: oldest group of their tier with a free seat (max 20), else a new group.
create or replace function private.league_place(p_user_id uuid, p_week date) returns bigint
language plpgsql security definer set search_path = '' as $$
declare mem public.league_members; gid bigint;
begin
  select * into mem from public.league_members where user_id = p_user_id and opted_out_at is null for update;
  if not found then return null; end if;
  select group_id into gid from public.league_standings where week_start = p_week and user_id = p_user_id;
  if gid is not null then
    update public.league_members set group_id = gid where user_id = p_user_id and group_id is distinct from gid;
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
  update public.league_members set group_id = gid where user_id = p_user_id;
  return gid;
end;
$$;

create or replace function private.league_check(p_user_id uuid, p_week date) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_user_id is null or p_week is null or extract(isodow from p_week) <> 1 then raise exception 'Invalid league request'; end if;
  if not exists (select 1 from auth.users where id = p_user_id and not is_anonymous) then raise exception 'Permanent account required'; end if;
end;
$$;

-- Stores the backend-computed stars (members only) and returns the public
-- view of the member's group: nickname, coat, stars, rank and "me" only.
create or replace function public.league_refresh(p_user_id uuid, p_week date, p_stars integer default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare mem public.league_members; gid bigint; gtier smallint; rows_json jsonb; last_json jsonb; n integer;
begin
  perform private.league_check(p_user_id, p_week);
  if p_stars is not null and p_stars not between 0 and 420 then raise exception 'Invalid league stars'; end if;
  perform private.league_rollover(p_week);
  if exists (select 1 from public.league_weeks where week_start > p_week) then raise exception 'Stale league week'; end if;
  select jsonb_build_object('rank', s.final_rank, 'outcome', s.outcome, 'stars', s.stars, 'tier', g.tier, 'weekStart', s.week_start)
    into last_json from public.league_standings s join public.league_groups g on g.id = s.group_id
    where s.user_id = p_user_id and s.week_start < p_week and s.final_rank is not null order by s.week_start desc limit 1;
  select * into mem from public.league_members where user_id = p_user_id;
  if not found or mem.opted_out_at is not null then
    return jsonb_build_object('member', null, 'lastWeek', coalesce(last_json, 'null'::jsonb));
  end if;
  gid := private.league_place(p_user_id, p_week);
  if p_stars is not null then
    update public.league_standings set stars = p_stars, reached_at = case when p_stars > stars then clock_timestamp() else reached_at end
      where week_start = p_week and user_id = p_user_id;
  end if;
  select tier into gtier from public.league_groups where id = gid;
  select count(*)::integer, coalesce(jsonb_agg(jsonb_build_object('rank', t.rnk, 'nickname', t.nickname, 'coat', t.coat, 'stars', t.stars,
      'me', t.user_id = p_user_id) order by t.rnk), '[]'::jsonb)
    into n, rows_json from (
      select s.*, row_number() over (order by s.stars desc, s.reached_at, s.user_id) as rnk
      from public.league_standings s where s.group_id = gid) t;
  return jsonb_build_object(
    'member', jsonb_build_object('nickname', mem.nickname, 'coat', mem.coat, 'tier', mem.tier, 'joinedAt', mem.joined_at),
    'group', jsonb_build_object('tier', gtier, 'size', n, 'zone', private.league_zone(n), 'rows', rows_json),
    'lastWeek', coalesce(last_json, 'null'::jsonb));
end;
$$;

create or replace function public.league_join(p_user_id uuid, p_week date, p_nickname text, p_coat text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.league_check(p_user_id, p_week);
  perform private.league_rollover(p_week);
  insert into public.league_members(user_id, nickname, coat) values (p_user_id, p_nickname, coalesce(p_coat, 'nau-cam'))
    on conflict (user_id) do update set nickname = excluded.nickname, coat = excluded.coat, opted_out_at = null, updated_at = now();
  update public.league_standings set nickname = p_nickname, coat = coalesce(p_coat, 'nau-cam') where week_start = p_week and user_id = p_user_id;
  perform private.league_place(p_user_id, p_week);
end;
$$;

-- Leaving from the demotion zone of a ranked table still demotes.
create or replace function public.league_leave(p_user_id uuid, p_week date)
returns void language plpgsql security definer set search_path = '' as $$
declare mine record;
begin
  perform private.league_check(p_user_id, p_week);
  perform private.league_rollover(p_week);
  select t.rnk, t.n, g.tier into mine from (
      select s.user_id, s.group_id, row_number() over (order by s.stars desc, s.reached_at, s.user_id) as rnk, count(*) over () as n
      from public.league_standings s
      where s.group_id = (select group_id from public.league_standings where week_start = p_week and user_id = p_user_id)) t
    join public.league_groups g on g.id = t.group_id where t.user_id = p_user_id;
  update public.league_members set opted_out_at = now(), group_id = null, updated_at = now(),
    tier = case when mine.rnk is not null and mine.tier > 1 and mine.rnk > mine.n - private.league_zone(mine.n::integer) then mine.tier - 1 else tier end
    where user_id = p_user_id and opted_out_at is null;
  delete from public.league_standings where week_start = p_week and user_id = p_user_id;
end;
$$;

create or replace function public.league_update(p_user_id uuid, p_week date, p_nickname text, p_coat text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.league_check(p_user_id, p_week);
  update public.league_members set nickname = coalesce(p_nickname, nickname), coat = coalesce(p_coat, coat), updated_at = now()
    where user_id = p_user_id and opted_out_at is null;
  if not found then raise exception 'Not a league member'; end if;
  update public.league_standings s set nickname = m.nickname, coat = m.coat from public.league_members m
    where s.week_start = p_week and s.user_id = p_user_id and m.user_id = p_user_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Maintenance and readiness
-- ---------------------------------------------------------------------------

-- Daily cleanup (python -m app.commands.maintenance). Each step deletes at
-- most p_limit rows; the command repeats while a step is still full.
create or replace function public.run_maintenance(p_limit integer default 5000, p_league_weeks integer default 12)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  stamp timestamptz := clock_timestamp();
  this_monday date := (date_trunc('week', (stamp at time zone 'UTC') + interval '7 hours'))::date;
  counters integer; requests integer; batches integer; limits integer; ledger integer; weeks integer;
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
  -- Never remove a live ticket or an active lease.
  delete from public.ai_explanation_questions where (user_id, ticket_id, question_number) in (
    select user_id, ticket_id, question_number from public.ai_explanation_questions
    where expires_at < stamp and (lease_until is null or lease_until < stamp) order by expires_at limit p_limit for update skip locked);
  get diagnostics ledger = row_count;
  -- League history: groups and standings go with their week.
  delete from public.league_weeks where week_start < this_monday - 7 * p_league_weeks;
  get diagnostics weeks = row_count;
  return jsonb_build_object('aiUsageCounters', counters, 'aiRequests', requests, 'aiBatches', batches,
    'apiRateLimits', limits, 'explanationQuestions', ledger, 'leagueWeeks', weeks, 'limit', p_limit);
end;
$$;

create or replace function public.schema_ready()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('baseline', 2, 'ready',
    to_regclass('public.user_profiles') is not null and to_regclass('public.ai_explanation_questions') is not null
    and to_regclass('public.league_standings') is not null and to_regclass('public.user_plans') is not null
    and to_regclass('private.sync_rows') is not null)
$$;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array['user_profiles','study_sessions','study_session_parts','mistakes','vocabulary_logs','pacing_runs',
      'pacing_run_phases','streak_shields','sync_tombstones','learning_data_resets','ai_access_grants','user_plans','redeem_codes',
      'redeem_code_uses','ai_usage_counters','ai_requests','ai_batches','ai_explanation_questions','ai_explanation_requests',
      'api_rate_limits','league_weeks','league_groups','league_members','league_standings'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated, service_role', t);
  end loop;
end;
$$;
revoke all on all sequences in schema public from public, anon, authenticated, service_role;
revoke all on all sequences in schema private from public, anon, authenticated, service_role;
revoke all on all tables in schema private from public, anon, authenticated, service_role;
revoke all on all functions in schema public from public, anon, authenticated, service_role;
revoke all on all functions in schema private from public, anon, authenticated, service_role;

-- The backend reads these through PostgREST (stars, attempt analysis, image cleanup, league membership).
grant select on public.study_sessions, public.mistakes, public.vocabulary_logs, public.pacing_runs, public.league_members to service_role;

grant execute on function
  public.sync_account_records(uuid, jsonb, bigint, boolean),
  public.reset_learning_data(uuid),
  public.get_ai_access(uuid),
  public.redeem_code(uuid, text),
  public.ai_quota_status(uuid, boolean, text),
  public.get_ai_usage(uuid, boolean, integer),
  public.reserve_ai_request(uuid, boolean, uuid, text, text, integer, integer, integer, integer),
  public.reserve_ai_batch_request(uuid, boolean, uuid, uuid, text, text, integer, integer, integer, integer, integer, integer),
  public.reserve_api_request(uuid, text, integer, integer),
  public.claim_explanation_question(uuid, uuid, integer, text, timestamptz, uuid, uuid),
  public.finish_explanation_question(uuid, uuid, integer, uuid, jsonb),
  public.league_refresh(uuid, date, integer),
  public.league_join(uuid, date, text, text),
  public.league_leave(uuid, date),
  public.league_update(uuid, date, text, text),
  public.run_maintenance(integer, integer),
  public.schema_ready()
to service_role;

notify pgrst, 'reload schema';
commit;
