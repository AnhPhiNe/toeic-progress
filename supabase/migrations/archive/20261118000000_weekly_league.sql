-- Giải đấu tuần (weekly league). Opt-in, ranked by stars earned this week.
-- Stars are computed by the backend from the learner's own synced rows and
-- written here only through service-role RPCs; browsers never send a number.
-- Weeks start on Monday in Asia/Ho_Chi_Minh; the backend passes that Monday.
-- Rollover is lazy: the first league request of a new week finalises the
-- previous week (ranks, promotion/demotion) under a lock, exactly once.
begin;

create table public.league_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  nickname text not null check(char_length(nickname) between 2 and 20 and nickname !~ '[[:cntrl:]]' and nickname=btrim(nickname)),
  coat text not null default 'nau-cam' check(coat ~ '^[a-z0-9-]{2,24}$'),
  -- 1 Đồng, 2 Bạc, 3 Vàng, 4 Kim cương.
  tier smallint not null default 1 check(tier between 1 and 4),
  -- Current week's group (null when not placed or opted out); RLS reads it.
  group_id bigint,
  joined_at timestamptz not null default now(),
  opted_out_at timestamptz,
  updated_at timestamptz not null default now()
);

create table public.league_weeks (
  week_start date primary key check(extract(isodow from week_start)=1),
  rolled_at timestamptz not null default now()
);

create table public.league_groups (
  id bigint generated always as identity primary key,
  week_start date not null references public.league_weeks(week_start) on delete cascade,
  tier smallint not null check(tier between 1 and 4),
  created_at timestamptz not null default now()
);
create index league_groups_week_tier on public.league_groups(week_start,tier,id);
alter table public.league_members add constraint league_members_group_fk
  foreign key(group_id) references public.league_groups(id) on delete set null;

-- One row per member per week. nickname/coat are a snapshot so a group can be
-- shown without reading anyone's membership row. No real name, email or score.
create table public.league_standings (
  week_start date not null references public.league_weeks(week_start) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  group_id bigint not null references public.league_groups(id) on delete cascade,
  nickname text not null check(char_length(nickname) between 2 and 20),
  coat text not null check(coat ~ '^[a-z0-9-]{2,24}$'),
  -- 60 a day for 7 days.
  stars integer not null default 0 check(stars between 0 and 420),
  -- When the current star count was first reached: earlier wins a tie.
  reached_at timestamptz not null default now(),
  final_rank smallint check(final_rank between 1 and 20),
  outcome text check(outcome in ('up','stay','down')),
  primary key(week_start,user_id)
);
create index league_standings_group on public.league_standings(group_id,stars desc);
create index league_standings_owner on public.league_standings(user_id,week_start);

-- Direct reads (defence in depth; the app goes through the backend):
-- a permanent learner reads their own membership and their current group's
-- public columns. No direct writes at all.
alter table public.league_members enable row level security;
alter table public.league_weeks enable row level security;
alter table public.league_groups enable row level security;
alter table public.league_standings enable row level security;
revoke all on public.league_members,public.league_weeks,public.league_groups,public.league_standings from public,anon,authenticated;
grant all on public.league_members,public.league_weeks,public.league_groups,public.league_standings to service_role;
grant select on public.league_members to authenticated;
grant select(week_start,group_id,nickname,coat,stars,final_rank,outcome) on public.league_standings to authenticated;
create policy "Permanent member reads own membership" on public.league_members for select to authenticated
  using (user_id=(select auth.uid()) and coalesce((select auth.jwt()->>'is_anonymous')::boolean,false)=false);
create policy "Member reads own group's public standings" on public.league_standings for select to authenticated
  using (coalesce((select auth.jwt()->>'is_anonymous')::boolean,false)=false
    and group_id=(select m.group_id from public.league_members m where m.user_id=(select auth.uid()) and m.opted_out_at is null));

-- Zone size for a group of n players: none while the group is too small to
-- show a table (fewer than 5 others), then n/3, at most 5 (top 5 / bottom 5).
create function private.league_zone(p_size integer) returns integer language sql immutable set search_path='' as $$
  select case when p_size<6 then 0 else least(5,p_size/3) end
$$;

-- Final ranks and tier moves for every unfinished group before p_week.
create function private.league_finalize_before(p_week date) returns void language plpgsql security definer set search_path='' as $$
declare grp record;
begin
  for grp in select g.id,g.tier from public.league_groups g where g.week_start<p_week
      and exists(select 1 from public.league_standings s where s.group_id=g.id and s.final_rank is null)
      order by g.week_start,g.id loop
    with ranked as (
      select s.user_id,s.stars,
        row_number() over (order by s.stars desc,s.reached_at,s.user_id) as rnk,
        count(*) over () as n
      from public.league_standings s where s.group_id=grp.id
    ), zoned as (select r.*,private.league_zone(r.n::integer) as z from ranked r)
    update public.league_standings s set final_rank=z.rnk,
      outcome=case when z.rnk<=z.z and grp.tier<4 and z.stars>0 then 'up'
                   when z.rnk>z.n-z.z and grp.tier>1 then 'down' else 'stay' end
    from zoned z where s.group_id=grp.id and s.user_id=z.user_id;
    update public.league_members m set tier=grp.tier+case s.outcome when 'up' then 1 else -1 end,updated_at=now()
      from public.league_standings s where s.group_id=grp.id and s.user_id=m.user_id and s.outcome<>'stay';
  end loop;
end;
$$;

-- Lazy, idempotent rollover: the week row is the guard; the lock serialises
-- concurrent first requests. Returns true only for the call that rolled.
create function private.league_rollover(p_week date) returns boolean language plpgsql security definer set search_path='' as $$
begin
  if exists(select 1 from public.league_weeks where week_start=p_week) then return false; end if;
  perform pg_advisory_xact_lock(hashtextextended('league:rollover',20261118));
  if exists(select 1 from public.league_weeks where week_start>p_week) then raise exception 'Stale league week'; end if;
  insert into public.league_weeks(week_start) values(p_week) on conflict do nothing;
  if not found then return false; end if;
  perform private.league_finalize_before(p_week);
  update public.league_members set group_id=null where group_id is not null;
  return true;
end;
$$;

-- Seat an active member for p_week: the oldest group of their tier with a free
-- seat, else a new group. Groups never exceed 20.
create function private.league_place(p_owner_id uuid,p_week date) returns bigint language plpgsql security definer set search_path='' as $$
declare mem public.league_members; gid bigint;
begin
  select * into mem from public.league_members where user_id=p_owner_id and opted_out_at is null for update;
  if not found then return null; end if;
  select group_id into gid from public.league_standings where week_start=p_week and user_id=p_owner_id;
  if gid is not null then
    update public.league_members set group_id=gid where user_id=p_owner_id and group_id is distinct from gid;
    return gid;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('league:place:'||p_week::text||':'||mem.tier::text,20261118));
  select g.id into gid from public.league_groups g where g.week_start=p_week and g.tier=mem.tier
    and (select count(*) from public.league_standings s where s.group_id=g.id)<20 order by g.id limit 1;
  if gid is null then
    insert into public.league_groups(week_start,tier) values(p_week,mem.tier) returning id into gid;
  end if;
  insert into public.league_standings(week_start,user_id,group_id,nickname,coat,stars,reached_at)
    values(p_week,p_owner_id,gid,mem.nickname,mem.coat,0,clock_timestamp());
  update public.league_members set group_id=gid where user_id=p_owner_id;
  return gid;
end;
$$;

create function private.league_check(p_owner_id uuid,p_week date) returns void language plpgsql security definer set search_path='' as $$
begin
  if p_owner_id is null or p_week is null or extract(isodow from p_week)<>1 then raise exception 'Invalid league request'; end if;
  if not exists(select 1 from auth.users where id=p_owner_id and not is_anonymous) then raise exception 'Permanent account required'; end if;
end;
$$;

-- Records the backend-computed stars (if a member) and returns the public view
-- of the member's group: nickname, coat, stars, rank and a "me" flag only.
create function public.league_refresh(p_owner_id uuid,p_week date,p_stars integer default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare mem public.league_members; gid bigint; gtier smallint; rows_json jsonb; last_json jsonb; n integer;
begin
  perform private.league_check(p_owner_id,p_week);
  if p_stars is not null and p_stars not between 0 and 420 then raise exception 'Invalid league stars'; end if;
  perform private.league_rollover(p_week);
  if exists(select 1 from public.league_weeks where week_start>p_week) then raise exception 'Stale league week'; end if;
  select coalesce(jsonb_build_object('rank',s.final_rank,'outcome',s.outcome,'stars',s.stars,'tier',g.tier,'weekStart',s.week_start),'null'::jsonb)
    into last_json from public.league_standings s join public.league_groups g on g.id=s.group_id
    where s.user_id=p_owner_id and s.week_start<p_week and s.final_rank is not null order by s.week_start desc limit 1;
  select * into mem from public.league_members where user_id=p_owner_id;
  if not found or mem.opted_out_at is not null then
    return jsonb_build_object('member',null,'lastWeek',coalesce(last_json,'null'::jsonb));
  end if;
  gid := private.league_place(p_owner_id,p_week);
  if p_stars is not null then
    update public.league_standings set stars=p_stars,
      reached_at=case when p_stars>stars then clock_timestamp() else reached_at end
      where week_start=p_week and user_id=p_owner_id;
  end if;
  select tier into gtier from public.league_groups where id=gid;
  select count(*)::integer,coalesce(jsonb_agg(jsonb_build_object('rank',t.rnk,'nickname',t.nickname,'coat',t.coat,'stars',t.stars,'me',t.user_id=p_owner_id) order by t.rnk),'[]'::jsonb)
    into n,rows_json from (
      select s.*,row_number() over (order by s.stars desc,s.reached_at,s.user_id) as rnk
      from public.league_standings s where s.group_id=gid) t;
  return jsonb_build_object(
    'member',jsonb_build_object('nickname',mem.nickname,'coat',mem.coat,'tier',mem.tier,'joinedAt',mem.joined_at),
    'group',jsonb_build_object('tier',gtier,'size',n,'zone',private.league_zone(n),'rows',rows_json),
    'lastWeek',coalesce(last_json,'null'::jsonb));
end;
$$;

create function public.league_join(p_owner_id uuid,p_week date,p_nickname text,p_coat text)
returns void language plpgsql security definer set search_path='' as $$
begin
  perform private.league_check(p_owner_id,p_week);
  perform private.league_rollover(p_week);
  insert into public.league_members(user_id,nickname,coat) values(p_owner_id,p_nickname,coalesce(p_coat,'nau-cam'))
    on conflict(user_id) do update set nickname=excluded.nickname,coat=excluded.coat,opted_out_at=null,updated_at=now();
  update public.league_standings set nickname=p_nickname,coat=coalesce(p_coat,'nau-cam') where week_start=p_week and user_id=p_owner_id;
  perform private.league_place(p_owner_id,p_week);
end;
$$;

-- Leaving removes the learner from this week's table. Leaving from the
-- demotion zone of a ranked table still applies the demotion, so leaving on
-- Sunday is not a way to dodge it.
create function public.league_leave(p_owner_id uuid,p_week date)
returns void language plpgsql security definer set search_path='' as $$
declare mine record;
begin
  perform private.league_check(p_owner_id,p_week);
  perform private.league_rollover(p_week);
  select t.rnk,t.n,g.tier into mine from (
      select s.user_id,s.group_id,row_number() over (partition by s.group_id order by s.stars desc,s.reached_at,s.user_id) as rnk,
        count(*) over (partition by s.group_id) as n
      from public.league_standings s where s.week_start=p_week
        and s.group_id=(select group_id from public.league_standings where week_start=p_week and user_id=p_owner_id)) t
    join public.league_groups g on g.id=t.group_id where t.user_id=p_owner_id;
  update public.league_members set opted_out_at=now(),group_id=null,updated_at=now(),
    tier=case when mine.rnk is not null and mine.tier>1 and mine.rnk>mine.n-private.league_zone(mine.n::integer) then mine.tier-1 else tier end
    where user_id=p_owner_id and opted_out_at is null;
  delete from public.league_standings where week_start=p_week and user_id=p_owner_id;
end;
$$;

create function public.league_update(p_owner_id uuid,p_week date,p_nickname text,p_coat text)
returns void language plpgsql security definer set search_path='' as $$
begin
  perform private.league_check(p_owner_id,p_week);
  update public.league_members set nickname=coalesce(p_nickname,nickname),coat=coalesce(p_coat,coat),updated_at=now()
    where user_id=p_owner_id and opted_out_at is null;
  if not found then raise exception 'Not a league member'; end if;
  update public.league_standings s set nickname=m.nickname,coat=m.coat from public.league_members m
    where s.week_start=p_week and s.user_id=p_owner_id and m.user_id=p_owner_id;
end;
$$;

revoke all on function private.league_zone(integer),private.league_finalize_before(date),private.league_rollover(date),
  private.league_place(uuid,date),private.league_check(uuid,date) from public,anon,authenticated;
revoke all on function public.league_refresh(uuid,date,integer),public.league_join(uuid,date,text,text),
  public.league_leave(uuid,date),public.league_update(uuid,date,text,text) from public,anon,authenticated;
grant execute on function public.league_refresh(uuid,date,integer),public.league_join(uuid,date,text,text),
  public.league_leave(uuid,date),public.league_update(uuid,date,text,text) to service_role;

comment on table public.league_standings is 'Weekly league rows. Stars come from the backend star table over synced rows, capped 60/day.';
notify pgrst,'reload schema';
commit;
