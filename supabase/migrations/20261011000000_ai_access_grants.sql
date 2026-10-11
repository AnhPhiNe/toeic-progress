-- Admin-managed AI approvals. Browser roles cannot read or write this table.
-- Quotas continue using ai_usage_counters; changing a grant never resets usage.
begin;

create table if not exists public.ai_access_grants (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null default '',
  display_name text not null default '',
  status text not null default 'pending' check (status in ('pending','active','blocked')),
  monthly_limit integer default 10 check (monthly_limit is null or monthly_limit between 1 and 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.ai_access_grants is 'AI approval only. Edit status/monthly_limit in the Supabase Table Editor as project admin.';
comment on column public.ai_access_grants.monthly_limit is 'Active: positive monthly cap; NULL means unlimited app AI usage. Pending/blocked always deny AI.';
comment on column public.ai_access_grants.email is 'Search/display only, filled from Auth. Authorization always uses user_id.';
alter table public.ai_access_grants enable row level security;
revoke all on public.ai_access_grants from public, anon, authenticated;
grant all on public.ai_access_grants to service_role;

-- Normalize display fields on admin edits; a copied email cannot grant another user access.
create or replace function public.normalize_ai_access_grant()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  select coalesce(lower(u.email),''), left(coalesce(u.raw_user_meta_data->>'full_name',u.raw_user_meta_data->>'name',''),160)
    into new.email,new.display_name from auth.users u where u.id=new.user_id;
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function public.normalize_ai_access_grant() from public,anon,authenticated;
drop trigger if exists normalize_ai_access_grant on public.ai_access_grants;
create trigger normalize_ai_access_grant before insert or update on public.ai_access_grants
  for each row execute function public.normalize_ai_access_grant();

-- New permanent accounts enter pending; user metadata can never approve or raise a cap.
create or replace function public.register_ai_access_grant()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.is_anonymous is false and coalesce(new.email,'')<>'' then
    insert into public.ai_access_grants(user_id) values(new.id)
      on conflict(user_id) do update set email=excluded.email,display_name=excluded.display_name;
  end if;
  return new;
end;
$$;
revoke all on function public.register_ai_access_grant() from public,anon,authenticated;
drop trigger if exists register_ai_access_grant on auth.users;
create trigger register_ai_access_grant after insert or update of email,is_anonymous,raw_user_meta_data on auth.users
  for each row execute function public.register_ai_access_grant();

-- One-time bootstrap of the owner's already-verified Google account. Do not
-- overwrite an existing grant when reapplying this migration.
with existing_accounts as (
  select u.id, lower(u.email)='anhphine1011@gmail.com' and u.email_confirmed_at is not null and exists (
    select 1 from auth.identities i where i.user_id=u.id and i.provider='google'
      and i.identity_data->'email_verified'='true'::jsonb and lower(i.identity_data->>'email')=lower(u.email)
  ) as owner_verified
  from auth.users u where u.is_anonymous is false and coalesce(u.email,'')<>''
)
insert into public.ai_access_grants(user_id,status,monthly_limit)
  select id,case when owner_verified then 'active' else 'pending' end,case when owner_verified then null else 10 end
  from existing_accounts on conflict(user_id) do nothing;

commit;
