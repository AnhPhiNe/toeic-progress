-- Step (e) of docs/DB_REBUILD_2026-11.md: restore the v1 export into the v2
-- baseline. Run through load_export.psql, which fills temp table
-- rebuild_import(doc) with the JSON from export_v1.sql:
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/rebuild/load_export.psql
--
-- Old -> new mapping:
--   learning records  replayed through public.sync_account_records, the same
--                     code path as a device sync (wire payload -> typed columns,
--                     tombstones -> sync_tombstones). Accounts no longer in
--                     auth.users, or anonymous, are skipped.
--   learning_data_resets  copied (barrier versions stay valid, see below).
--   ai_access_grants  status copied; email/name refilled from Auth.
--     monthly_limit NULL (unlimited) -> user_plans plan 'admin'
--     monthly_limit other than the old default 10 -> user_plans 'free' + ai_monthly_limit
--   sync versions     private.sync_version moves above v1's highest version, so
--                     every device cursor issued by v1 is below every restored row.
-- Idempotent: re-running changes nothing (same timestamps lose to the stored
-- rows; inserts are "on conflict do nothing").
do $$
declare
  doc jsonb;
  account jsonb;
  item jsonb;
  restored integer := 0;
  skipped integer := 0;
begin
  if to_regprocedure('public.schema_ready()') is null then raise exception 'Apply the v2 baseline before restoring'; end if;
  select r.doc::jsonb into doc from pg_temp.rebuild_import r;
  if doc is null or doc->>'format' is distinct from 'toeic-progress-v1-export' then raise exception 'rebuild_import does not hold a v1 export'; end if;

  perform setval('private.sync_version', greatest((select last_value from private.sync_version), coalesce((doc->>'maxServerVersion')::bigint, 0) + 1));

  for account in select value from jsonb_array_elements(doc->'records') loop
    if exists (select 1 from auth.users where id = (account->>'user_id')::uuid and not is_anonymous) then
      -- The highest cursor skips any reset barrier (restored before its barrier) and returns nothing new.
      perform public.sync_account_records((account->>'user_id')::uuid, account->'records', 9223372036854775807, false);
      restored := restored + 1;
    else
      skipped := skipped + 1;
    end if;
  end loop;

  insert into public.learning_data_resets(user_id, reset_at, server_version)
    select (r->>'user_id')::uuid, (r->>'reset_at')::timestamptz, (r->>'server_version')::bigint
    from jsonb_array_elements(doc->'resets') r
    where exists (select 1 from auth.users where id = (r->>'user_id')::uuid)
    on conflict (user_id) do nothing;

  for item in select value from jsonb_array_elements(doc->'aiAccessGrants') loop
    continue when not exists (select 1 from auth.users where id = (item->>'user_id')::uuid and not is_anonymous);
    insert into public.ai_access_grants(user_id, status) values ((item->>'user_id')::uuid, coalesce(item->>'status', 'active'))
      on conflict (user_id) do nothing;
    if item->'monthly_limit' = 'null'::jsonb and coalesce(item->>'status', 'active') = 'active' then
      insert into public.user_plans(user_id, plan) values ((item->>'user_id')::uuid, 'admin') on conflict (user_id) do nothing;
    elsif (item->>'monthly_limit')::integer is distinct from 10 and item->'monthly_limit' <> 'null'::jsonb then
      insert into public.user_plans(user_id, plan, ai_monthly_limit) values ((item->>'user_id')::uuid, 'free', (item->>'monthly_limit')::integer)
        on conflict (user_id) do nothing;
    end if;
  end loop;
  raise notice 'Restored % account(s); skipped % no longer in auth.users.', restored, skipped;
end;
$$;
