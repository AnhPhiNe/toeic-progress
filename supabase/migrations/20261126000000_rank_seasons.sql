-- Xếp hạng: rank points, divisions, seasons and season rewards on top of the
-- weekly league (applies on top of 20261125000000_security_wave2).
--
-- Tiers 1 Đồng, 2 Bạc, 3 Vàng, 4 Bạch kim, 5 Kim cương (divisions IV → I) and
-- 6 Cao thủ (points only). A rank is a level 0..20 (level = (tier-1)*4 + step,
-- step 0 = IV … 3 = I; 20 = Cao thủ) plus 0..99 points (unbounded at Cao thủ).
-- Rank points come ONLY from the weekly league stars (counted in the database
-- from synced study rows); never from self-entered TOEIC scores.
--
-- Weekly, when a group is finalised (Monday 12:00 Vietnam, as before):
--   +min(25, floor(stars / 10)); top min(6, n/3) of the group with stars +20;
--   bottom min(5, n/4) −20; a 0-star week −20 (bottom and 0-star do not stack).
--   Groups under 6 seats have no zones. A loss falls at most one division a
--   week (landing at 75 points). One "Khiên giữ hạng" per season turns the first
--   losing week into 0 (separate from the streak shield).
-- Seasons are 8 weeks from the epoch Monday 2026-11-23 (season 1). A season is
-- closed per learner once its last week is final: the highest rank reached that
-- season earns a reward row (badge for everyone who played; cosmetics from Bạc;
-- AI bonus from Vàng for the next calendar month), then the learner drops one
-- tier in the same division (Cao thủ → Kim cương I), points 0, shield back.
--
-- Deploy order: this migration, then the backend (GET /api/v1/rank, AI bonus),
-- then the frontend. The old backend keeps working: league_state, join, leave
-- and update keep their shapes; group tiers may now be 5 or 6.
-- Idempotent: safe to run more than once.
begin;

-- ---------------------------------------------------------------------------
-- Tiers 1..6 (were 1..4). On the first run, old Kim cương (4) becomes the new
-- Kim cương (5) and every member gets a rank from their old tier.
-- ---------------------------------------------------------------------------

do $$
declare first_run boolean := to_regclass('private.rank_players') is null;
begin
  alter table public.league_groups drop constraint if exists league_groups_tier_check;
  alter table public.league_groups add constraint league_groups_tier_check check (tier between 1 and 6);
  alter table public.league_members drop constraint if exists league_members_tier_check;
  alter table public.league_members add constraint league_members_tier_check check (tier between 1 and 6);
  if first_run then
    update public.league_groups g set tier = 5 where g.tier = 4
      and exists (select 1 from public.league_standings s where s.group_id = g.id and s.final_rank is null);
    update public.league_members set tier = 5 where tier = 4;
  end if;
end;
$$;
comment on column public.league_members.tier is 'Rank tier 1 Đồng … 5 Kim cương, 6 Cao thủ: follows private.rank_players.level; groups are seated by it.';

create table if not exists private.rank_players (
  user_id uuid primary key references auth.users(id) on delete cascade,
  season integer not null check (season >= 1),
  level smallint not null default 0 check (level between 0 and 20),
  points integer not null default 0 check (points >= 0 and (level = 20 or points < 100)),
  -- Highest level held this season after a finalised week; null = not played this season.
  best_level smallint check (best_level between 0 and 20),
  -- The week this season's Khiên giữ hạng was used; null = still available.
  shield_used_week date,
  updated_at timestamptz not null default now()
);
comment on table private.rank_players is 'Xếp hạng: current rank per learner. Written only by the finalise / season functions.';

create table if not exists private.rank_weeks (
  user_id uuid not null references auth.users(id) on delete cascade,
  week_start date not null check (extract(isodow from week_start) = 1),
  season integer not null,
  stars integer not null,
  group_rank smallint not null,
  group_size smallint not null,
  -- Parts of the change: star points, top-zone bonus, penalty (bottom zone or 0 stars), what was applied.
  base integer not null,
  bonus integer not null,
  penalty integer not null,
  delta integer not null,
  shield boolean not null default false,
  level_before smallint not null,
  points_before integer not null,
  level_after smallint not null,
  points_after integer not null,
  created_at timestamptz not null default now(),
  primary key (user_id, week_start)
);
comment on table private.rank_weeks is 'Xếp hạng history: one row per finalised league week per learner (kept).';

create table if not exists private.rank_season_rewards (
  user_id uuid not null references auth.users(id) on delete cascade,
  season integer not null,
  best_level smallint not null check (best_level between 0 and 20),
  cosmetics text[] not null default '{}',
  ai_bonus integer not null default 0 check (ai_bonus between 0 and 100),
  -- First day of the (UTC) month the AI bonus applies to.
  ai_month date not null,
  created_at timestamptz not null default now(),
  primary key (user_id, season)
);
comment on table private.rank_season_rewards is 'Season rewards, granted once per learner per season (idempotent by primary key).';

do $$
declare t text;
begin
  foreach t in array array['rank_players','rank_weeks','rank_season_rewards'] loop
    execute format('alter table private.%I enable row level security', t);
    execute format('revoke all on private.%I from public, anon, authenticated, service_role', t);
  end loop;
end;
$$;
create index if not exists rank_players_season on private.rank_players(season);
create index if not exists rank_season_rewards_month on private.rank_season_rewards(user_id, ai_month);

-- ---------------------------------------------------------------------------
-- Rank math
-- ---------------------------------------------------------------------------

create or replace function private.rank_epoch() returns date
language sql immutable set search_path = '' as $$ select date '2026-11-23' $$;

-- Season number of a league week (8 weeks each; weeks before the epoch are season 1).
create or replace function private.rank_season(p_week date) returns integer
language sql immutable set search_path = '' as $$
  select greatest(1, floor((p_week - private.rank_epoch()) / 56.0)::integer + 1)
$$;

create or replace function private.rank_season_start(p_season integer) returns date
language sql immutable set search_path = '' as $$ select private.rank_epoch() + (p_season - 1) * 56 $$;

-- The season whose end may be closed at p_now: its last week must be final
-- (Monday 12:00 in Vietnam), so look at the week 12 hours ago.
create or replace function private.rank_due_season(p_now timestamptz) returns integer
language sql immutable set search_path = '' as $$
  select private.rank_season(private.league_week(p_now - interval '12 hours'))
$$;

create or replace function private.rank_tier(p_level integer) returns integer
language sql immutable set search_path = '' as $$ select case when p_level >= 20 then 6 else p_level / 4 + 1 end $$;

-- Level, points after a week's change: carry-over upwards, at most one division down (75 points).
create or replace function private.rank_apply(p_level integer, p_points integer, p_delta integer) returns integer[]
language plpgsql immutable set search_path = '' as $$
declare total integer;
begin
  if p_delta >= 0 then
    if p_level >= 20 then return array[20, p_points + p_delta]; end if;
    total := p_level * 100 + p_points + p_delta;
    if total >= 2000 then return array[20, total - 2000]; end if;
    return array[total / 100, total % 100];
  end if;
  if p_points + p_delta >= 0 then return array[p_level, p_points + p_delta]; end if;
  if p_level = 0 then return array[0, 0]; end if;
  return array[p_level - 1, 75];
end;
$$;

-- Zone sizes for a group of n seats: [top bonus, bottom penalty].
create or replace function private.rank_zones(p_size integer) returns integer[]
language sql immutable set search_path = '' as $$
  select case when p_size < 6 then array[0, 0] else array[least(6, p_size / 3), least(5, p_size / 4)] end
$$;

-- Cosmetics for the highest tier reached in a season (higher includes lower), seasonal ids.
create or replace function private.rank_cosmetics(p_tier integer, p_season integer) returns text[]
language sql immutable set search_path = '' as $$
  select array_remove(array[
    case when p_tier >= 2 then 'frame-bac.m' || p_season end,
    case when p_tier >= 3 then 'frame-vang.m' || p_season end,
    case when p_tier >= 3 then 'name-tag.m' || p_season end,
    case when p_tier >= 4 then 'khan-ngoc.m' || p_season end,
    case when p_tier >= 5 then 'ao-choang.m' || p_season end,
    case when p_tier >= 6 then 'vuong-mien.m' || p_season end]::text[], null)
$$;

create or replace function private.rank_ai_bonus(p_tier integer) returns integer
language sql immutable set search_path = '' as $$
  select case when p_tier >= 5 then 30 when p_tier = 4 then 20 when p_tier = 3 then 10 else 0 end
$$;

-- A member's rank row, created from their league tier the first time.
create or replace function private.rank_ensure(p_user_id uuid, p_season integer) returns void
language sql security definer set search_path = '' as $$
  insert into private.rank_players(user_id, season, level)
    select m.user_id, p_season, case when m.tier >= 6 then 20 else (m.tier - 1) * 4 end
    from public.league_members m where m.user_id = p_user_id
  on conflict (user_id) do nothing
$$;

-- Close every season of one learner before p_season: reward (once), then drop one tier.
create or replace function private.rank_roll(p_user_id uuid, p_season integer) returns integer
language plpgsql security definer set search_path = '' as $$
declare p private.rank_players; closed integer := 0; tier integer; last_day date;
begin
  select * into p from private.rank_players where user_id = p_user_id for update;
  if not found then return 0; end if;
  while p.season < p_season loop
    if p.best_level is not null then
      tier := private.rank_tier(p.best_level);
      last_day := private.rank_season_start(p.season) + 55;
      insert into private.rank_season_rewards(user_id, season, best_level, cosmetics, ai_bonus, ai_month)
        values (p_user_id, p.season, p.best_level, private.rank_cosmetics(tier, p.season), private.rank_ai_bonus(tier),
                (date_trunc('month', last_day) + interval '1 month')::date)
        on conflict (user_id, season) do nothing;
    end if;
    p.level := case when p.level >= 20 then 19 when p.level >= 4 then p.level - 4 else p.level end;
    p.points := 0; p.best_level := null; p.shield_used_week := null; p.season := p.season + 1;
    closed := closed + 1;
  end loop;
  if closed > 0 then
    update private.rank_players set season = p.season, level = p.level, points = 0, best_level = null,
      shield_used_week = null, updated_at = now() where user_id = p_user_id;
    update public.league_members set tier = private.rank_tier(p.level), updated_at = now() where user_id = p_user_id;
  end if;
  return closed;
end;
$$;

-- Close due seasons for one learner once nothing of those seasons is still open.
create or replace function private.rank_catch_up(p_user_id uuid, p_now timestamptz) returns integer
language plpgsql security definer set search_path = '' as $$
declare due integer := private.rank_due_season(p_now);
begin
  if exists (select 1 from public.league_standings s where s.user_id = p_user_id and s.final_rank is null
             and s.week_start < private.rank_season_start(due)) then
    return 0;
  end if;
  return private.rank_roll(p_user_id, due);
end;
$$;

-- Bounded season close for maintenance.
create or replace function private.rank_close_seasons(p_now timestamptz, p_limit integer) returns integer
language plpgsql security definer set search_path = '' as $$
declare due integer := private.rank_due_season(p_now); u uuid; done integer := 0;
begin
  for u in select r.user_id from private.rank_players r where r.season < due
      and not exists (select 1 from public.league_standings s where s.user_id = r.user_id and s.final_rank is null
                      and s.week_start < private.rank_season_start(due))
      order by r.user_id limit p_limit loop
    done := done + least(1, private.rank_roll(u, due));
  end loop;
  return done;
end;
$$;

-- Apply one finalised week to one learner (once per week).
create or replace function private.rank_week(p_user_id uuid, p_week date, p_stars integer, p_rank integer, p_size integer) returns text
language plpgsql security definer set search_path = '' as $$
declare
  season integer := private.rank_season(p_week); p private.rank_players; zones integer[] := private.rank_zones(p_size);
  base integer; bonus integer; penalty integer; delta integer; shield boolean := false; res integer[];
begin
  if exists (select 1 from private.rank_weeks where user_id = p_user_id and week_start = p_week) then
    return (select case when level_after > level_before then 'up' when level_after < level_before then 'down' else 'stay' end
              from private.rank_weeks where user_id = p_user_id and week_start = p_week);
  end if;
  perform private.rank_ensure(p_user_id, season);
  perform private.rank_roll(p_user_id, season);
  select * into p from private.rank_players where user_id = p_user_id for update;
  if not found then return 'stay'; end if;
  base := least(25, greatest(0, p_stars) / 10);
  bonus := case when p_stars > 0 and p_rank <= zones[1] then 20 else 0 end;
  penalty := case when p_stars = 0 or p_rank > p_size - zones[2] then -20 else 0 end;
  delta := base + bonus + penalty;
  if delta < 0 and p.shield_used_week is null then shield := true; delta := 0; end if;
  res := private.rank_apply(p.level, p.points, delta);
  update private.rank_players set level = res[1], points = res[2],
    best_level = greatest(p.best_level, p.level, res[1]),
    shield_used_week = case when shield then p_week else shield_used_week end, updated_at = now()
    where user_id = p_user_id;
  insert into private.rank_weeks(user_id, week_start, season, stars, group_rank, group_size, base, bonus, penalty, delta, shield,
      level_before, points_before, level_after, points_after)
    values (p_user_id, p_week, greatest(season, p.season), p_stars, p_rank, p_size, base, bonus, penalty, delta, shield,
      p.level, p.points, res[1], res[2]);
  update public.league_members set tier = private.rank_tier(res[1]), updated_at = now()
    where user_id = p_user_id and tier <> private.rank_tier(res[1]);
  return case when res[1] > p.level then 'up' when res[1] < p.level then 'down' else 'stay' end;
end;
$$;

-- ---------------------------------------------------------------------------
-- Finalise: as in wave 2 (recount at the deadline, rank), then rank points.
-- ---------------------------------------------------------------------------

create or replace function private.league_finalize_due(p_now timestamptz, p_limit integer) returns integer
language plpgsql security definer set search_path = '' as $$
declare grp record; st record; done integer := 0; deadline timestamptz;
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
    for st in select r.user_id, r.stars, r.rnk, r.n from (
        select s.user_id, s.stars, row_number() over (order by s.stars desc, s.reached_at, s.user_id) as rnk, count(*) over () as n
        from public.league_standings s where s.group_id = grp.id) r order by r.rnk loop
      update public.league_standings set final_rank = st.rnk,
        outcome = private.rank_week(st.user_id, grp.week_start, st.stars, st.rnk::integer, st.n::integer)
        where group_id = grp.id and user_id = st.user_id;
    end loop;
    -- A seat already taken in an open later week at another tier is given up,
    -- so the next visit seats the learner with their new tier.
    delete from public.league_standings s using public.league_groups g, public.league_members m
      where m.user_id = s.user_id and g.id = s.group_id and s.week_start > grp.week_start and s.final_rank is null
        and g.tier <> m.tier and private.league_grace_end(s.week_start) > p_now
        and s.user_id in (select user_id from public.league_standings where group_id = grp.id);
    done := done + 1;
  end loop;
  return done;
end;
$$;

-- ---------------------------------------------------------------------------
-- Boards (fun tabs) inside one group: never TOEIC scores, only gains.
-- ---------------------------------------------------------------------------

create or replace function private.rank_board_values(p_user_id uuid, p_week date, p_now timestamptz) returns jsonb
language sql stable security definer set search_path = '' as $$
  with b as (select private.vn_date(p_now) as today, private.vn_midnight(p_week) as week_at),
  tests as (
    select s.scaled_listening, s.scaled_reading, s.study_date, s.created_at from public.study_sessions s
     where s.user_id = p_user_id and s.session_type = 'FULL_TEST'
  ),
  days as (
    select distinct d from (
      select s.study_date as d from public.study_sessions s, b where s.user_id = p_user_id and s.study_date between b.today - 400 and b.today
      union all select r.study_date from public.pacing_runs r, b where r.user_id = p_user_id and r.study_date between b.today - 400 and b.today
      union all select v.study_date from public.vocabulary_logs v, b where v.user_id = p_user_id and v.study_date between b.today - 400 and b.today
      union all select private.vn_date(m.last_reviewed_at) from public.mistakes m, b
        where m.user_id = p_user_id and m.last_reviewed_at between private.vn_midnight(b.today - 400) and p_now
      union all select private.vn_date(m.created_at) from public.mistakes m, b
        where m.user_id = p_user_id and m.created_at between private.vn_midnight(b.today - 400) and p_now
    ) x
  ),
  islands as (select d, d + (row_number() over (order by d desc))::integer as k from days)
  select jsonb_build_object(
    'listening', (select max(t.scaled_listening) - (select t2.scaled_listening from tests t2 where t2.scaled_listening is not null
                   order by t2.study_date, t2.created_at limit 1) from tests t where t.scaled_listening is not null),
    'reading', (select max(t.scaled_reading) - (select t2.scaled_reading from tests t2 where t2.scaled_reading is not null
                 order by t2.study_date, t2.created_at limit 1) from tests t where t.scaled_reading is not null),
    'minutes', round(coalesce((select sum(least(s.duration_minutes, 300)) from public.study_sessions s, b
                 where s.user_id = p_user_id and s.study_date between p_week and b.today), 0)
             + coalesce((select sum(least(r.actual_minutes, 300)) from public.pacing_runs r, b
                 where r.user_id = p_user_id and r.study_date between p_week and b.today), 0))::integer,
    'streak', coalesce((select count(*) from islands i where i.k = (select i2.k from islands i2 order by i2.d desc limit 1)
                 and (select max(d) from days) >= (select today - 1 from b)), 0)::integer,
    'reviews', (select count(*) from public.mistakes m, b where m.user_id = p_user_id and m.last_reviewed_at between b.week_at and p_now
                 and (m.status = 'MASTERED' or coalesce(m.review_stage, 0) > 0))::integer)
$$;

-- The latest season reward from Bạc up, shown next to a nickname (frame / name tag).
create or replace function private.rank_award(p_user_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce((select jsonb_build_object('tier', private.rank_tier(r.best_level), 'season', r.season)
    from private.rank_season_rewards r where r.user_id = p_user_id and r.best_level >= 4 order by r.season desc limit 1), 'null'::jsonb)
$$;

create or replace function private.rank_boards(p_group_id bigint, p_week date, p_now timestamptz, p_user_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  with m as (
    select s.user_id, s.nickname, s.coat, s.stars, s.reached_at, private.rank_board_values(s.user_id, p_week, p_now) as v,
           private.rank_award(s.user_id) as award
    from public.league_standings s where s.group_id = p_group_id
  ), metric(key) as (values ('listening'), ('reading'), ('minutes'), ('streak'), ('reviews'))
  select jsonb_build_object(
    'stars', (select coalesce(jsonb_agg(jsonb_build_object('rank', t.rnk, 'nickname', t.nickname, 'coat', t.coat, 'value', t.stars,
              'me', t.user_id = p_user_id, 'award', t.award) order by t.rnk), '[]'::jsonb)
              from (select m.*, row_number() over (order by m.stars desc, m.reached_at, m.user_id) as rnk from m) t))
    || coalesce((select jsonb_object_agg(x.key, x.rows) from (
      select metric.key, coalesce(jsonb_agg(jsonb_build_object('rank', t.rnk, 'nickname', t.nickname, 'coat', t.coat,
               'value', t.val, 'me', t.user_id = p_user_id, 'award', t.award) order by t.rnk), '[]'::jsonb) as rows
      from metric cross join lateral (
        select m.user_id, m.nickname, m.coat, m.award, (m.v->>metric.key)::integer as val,
               row_number() over (order by (m.v->>metric.key)::integer desc nulls last, m.nickname, m.user_id) as rnk
        from m) t
      group by metric.key) x), '{}'::jsonb)
$$;

-- ---------------------------------------------------------------------------
-- The Xếp hạng screen in one call: league_state plus rank, season, rewards and boards.
-- ---------------------------------------------------------------------------

create or replace function public.rank_state(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  base jsonb := public.league_state(p_user_id);
  now_at timestamptz := private.app_now();
  cw date := (base->>'weekStart')::date;
  season integer := private.rank_season(cw);
  p private.rank_players; gid bigint; last_json jsonb; rewards jsonb; boards jsonb := null;
begin
  if base->'member' is not null and base->'member' <> 'null'::jsonb then
    perform private.rank_ensure(p_user_id, season);
  end if;
  perform private.rank_catch_up(p_user_id, now_at);
  select * into p from private.rank_players where user_id = p_user_id;
  select s.group_id into gid from public.league_standings s where s.user_id = p_user_id and s.week_start = cw;
  if gid is not null and base->'member' <> 'null'::jsonb then
    boards := private.rank_boards(gid, cw, now_at, p_user_id);
  end if;
  select jsonb_build_object('weekStart', w.week_start, 'stars', w.stars, 'rank', w.group_rank, 'size', w.group_size, 'base', w.base,
      'bonus', w.bonus, 'penalty', w.penalty, 'delta', w.delta, 'shield', w.shield, 'levelBefore', w.level_before,
      'pointsBefore', w.points_before, 'levelAfter', w.level_after, 'pointsAfter', w.points_after)
    into last_json from private.rank_weeks w where w.user_id = p_user_id order by w.week_start desc limit 1;
  select coalesce(jsonb_agg(jsonb_build_object('season', r.season, 'bestLevel', r.best_level, 'cosmetics', to_jsonb(r.cosmetics),
      'aiBonus', r.ai_bonus, 'aiMonth', r.ai_month) order by r.season desc), '[]'::jsonb)
    into rewards from private.rank_season_rewards r where r.user_id = p_user_id;
  return base || jsonb_build_object(
    'season', jsonb_build_object('number', season, 'start', private.rank_season_start(season),
                                 'end', private.rank_season_start(season) + 55),
    'rank', case when p.user_id is null then 'null'::jsonb else jsonb_build_object('season', p.season, 'level', p.level,
              'points', p.points, 'bestLevel', p.best_level, 'shieldUsedWeek', p.shield_used_week) end,
    'rankWeek', coalesce(last_json, 'null'::jsonb),
    'rewards', rewards,
    'boards', coalesce(boards, 'null'::jsonb));
end;
$$;

-- ---------------------------------------------------------------------------
-- AI access: the season AI bonus for this (UTC) month is added by the backend
-- to the monthly cap; provider budget caps still apply on every request.
-- ---------------------------------------------------------------------------

create or replace function public.get_ai_access(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare grant_status text; current_plan record; bonus integer;
begin
  if p_user_id is null then raise exception 'Invalid AI access request'; end if;
  select status into grant_status from public.ai_access_grants where user_id = p_user_id;
  select * into current_plan from private.active_plan(p_user_id);
  select least(100, coalesce(sum(r.ai_bonus), 0))::integer into bonus from private.rank_season_rewards r
    where r.user_id = p_user_id and r.ai_month = (date_trunc('month', private.app_now() at time zone 'UTC'))::date;
  return jsonb_build_object('status', coalesce(grant_status, 'active'), 'plan', current_plan.plan,
    'planExpiresAt', current_plan.expires_at, 'unlimited', current_plan.plan = 'admin',
    'monthlyLimit', case when current_plan.plan = 'admin' then null else current_plan.ai_monthly_limit end,
    'rankBonus', bonus);
end;
$$;

-- ---------------------------------------------------------------------------
-- Maintenance: also close due seasons (bounded).
-- ---------------------------------------------------------------------------

create or replace function public.run_maintenance(p_limit integer default 5000, p_league_weeks integer default 12)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  stamp timestamptz := clock_timestamp();
  this_monday date := (date_trunc('week', (stamp at time zone 'UTC') + interval '7 hours'))::date;
  league_now timestamptz := private.app_now();
  counters integer; requests integer; batches integer; limits integer; ledger integer; weeks integer;
  provider_counters integer; cost_ledger integer; carryover integer; tombstones integer; groups integer; group_limit integer;
  seasons integer;
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
  group_limit := least(p_limit, 200);
  groups := private.league_finalize_due(league_now, group_limit);
  -- Season end: once every group of the season's last week is final.
  seasons := case when groups >= group_limit then 0 else private.rank_close_seasons(league_now, least(p_limit, 2000)) end;
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
    'rankSeasons', seasons,
    'limit', p_limit
  );
end;
$$;

-- First run: a rank for every member from their (already remapped) tier.
insert into private.rank_players(user_id, season, level)
  select m.user_id, private.rank_season(private.league_week(private.app_now())),
         case when m.tier >= 6 then 20 else (m.tier - 1) * 4 end
  from public.league_members m
on conflict (user_id) do nothing;

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
    and to_regclass('private.rank_players') is not null
    and to_regclass('private.rank_weeks') is not null
    and to_regclass('private.rank_season_rewards') is not null
    and to_regprocedure('public.prepare_account_deletion(uuid,text)') is not null
    and to_regprocedure('public.apply_identity_carryover(uuid,text)') is not null
    and to_regprocedure('public.reserve_batch_explain_quota(uuid,uuid,integer,integer)') is not null
    and to_regprocedure('private.carry_identity_counter(uuid,text,integer,timestamp with time zone,timestamp with time zone)') is not null
    and to_regprocedure('public.mark_account_deletion_pending(uuid)') is not null
    and to_regprocedure('public.clear_account_deletion_pending(uuid)') is not null
    and to_regprocedure('public.list_pending_account_deletions(integer,integer)') is not null
    and to_regprocedure('public.note_account_deletion_attempt(uuid,text)') is not null
    and to_regprocedure('public.league_state(uuid)') is not null
    and to_regprocedure('public.rank_state(uuid)') is not null
    and to_regprocedure('public.sync_page(uuid,bigint)') is not null
    and to_regprocedure('private.league_stars(uuid,date,timestamp with time zone)') is not null
    and to_regprocedure('private.rank_week(uuid,date,integer,integer,integer)') is not null
    and exists (select 1 from pg_catalog.pg_attribute
                 where attrelid = to_regclass('public.ai_batches') and attname = 'explain_questions' and not attisdropped)
    and exists (select 1 from pg_catalog.pg_attribute
                 where attrelid = to_regclass('public.study_sessions') and attname = 'first_synced_at' and not attisdropped)
    and exists (select 1 from pg_catalog.pg_attribute
                 where attrelid = to_regclass('public.league_standings') and attname = 'opted_out' and not attisdropped))
$$;

-- ---------------------------------------------------------------------------
-- Privileges: private helpers for nobody; rank_state for the backend only.
-- ---------------------------------------------------------------------------

revoke all on all functions in schema private from public, anon, authenticated, service_role;
revoke all on all tables in schema private from public, anon, authenticated, service_role;
revoke all on function public.rank_state(uuid) from public, anon, authenticated;
grant execute on function public.rank_state(uuid) to service_role;
revoke all on function public.get_ai_access(uuid) from public, anon, authenticated;
grant execute on function public.get_ai_access(uuid) to service_role;
revoke all on function public.run_maintenance(integer, integer) from public, anon, authenticated;
grant execute on function public.run_maintenance(integer, integer) to service_role;
revoke all on function public.schema_ready() from public, anon, authenticated;
grant execute on function public.schema_ready() to service_role;

notify pgrst, 'reload schema';
commit;
