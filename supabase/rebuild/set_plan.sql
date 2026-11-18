-- Operator step (replaces v1's hard-coded owner backfill): give one account a
-- plan by email. Nothing personal is stored in the repository.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -v email='owner@example.com' -v plan=admin -f supabase/rebuild/set_plan.sql
--
-- plan: admin (unlimited AI) | plus | free. Re-running sets the same values.
\set ON_ERROR_STOP on
select set_config('toeic.plan_email', lower(:'email'), false), set_config('toeic.plan_name', :'plan', false);
do $$
declare target uuid;
begin
  select id into target from auth.users where lower(email) = current_setting('toeic.plan_email') and not is_anonymous;
  if target is null then raise exception 'No permanent account with that email (sign in once first).'; end if;
  insert into public.user_plans(user_id, plan, expires_at, updated_at) values (target, current_setting('toeic.plan_name'), null, now())
    on conflict (user_id) do update set plan = excluded.plan, expires_at = null, updated_at = now();
  raise notice 'Plan % set for %', current_setting('toeic.plan_name'), current_setting('toeic.plan_email');
end;
$$;
