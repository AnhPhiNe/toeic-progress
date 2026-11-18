-- Step (b) of docs/DB_REBUILD_2026-11.md: export the v1 app data as ONE line of JSON.
-- Read-only (it creates only a session-temporary function). Safe to re-run.
--
--   psql "$DATABASE_URL" -qAt -v ON_ERROR_STOP=1 -f supabase/rebuild/export_v1.sql -o v1_export.json
--
-- Contents:
--   records        per account, every synced record in the wire format the
--                  sync RPC accepts (from v1's public.sync_records), retired
--                  checklist/weeklyPlans excluded; tombstones included.
--   resets         learning_data_resets barriers.
--   aiAccessGrants status + monthly_limit per account.
--   maxServerVersion  highest v1 sync version (restored rows get higher ones,
--                  so every device cursor still sees them).
--   tables         raw rows of the listed v1 tables, for the archive only.
create or replace function pg_temp.toeic_export_v1() returns jsonb language plpgsql as $$
declare
  result jsonb := jsonb_build_object('format', 'toeic-progress-v1-export', 'version', 1, 'exportedAt', clock_timestamp());
  raw jsonb := '{}'::jsonb;
  rows_json jsonb;
  max_version bigint := 0;
  name text;
begin
  if to_regclass('public.sync_records') is null then
    raise exception 'public.sync_records not found: this does not look like a v1 database';
  end if;
  execute $q$select coalesce(jsonb_agg(jsonb_build_object('user_id', user_id, 'records', records) order by user_id), '[]'::jsonb) from (
      select user_id, jsonb_agg(jsonb_build_object('entity_type', entity_type, 'record_id', record_id, 'payload', payload,
        'updated_at', updated_at, 'deleted_at', deleted_at) order by entity_type, record_id) as records
      from public.sync_records where entity_type not in ('checklist', 'weeklyPlans') group by user_id) per_user$q$
    into rows_json;
  result := result || jsonb_build_object('records', rows_json);
  execute 'select coalesce(max(server_version), 0) from public.sync_records' into max_version;
  if to_regclass('public.sync_record_version') is not null then
    execute 'select greatest($1, last_value) from public.sync_record_version' into max_version using max_version;
  end if;
  result := result || jsonb_build_object('maxServerVersion', max_version);

  rows_json := '[]'::jsonb;
  if to_regclass('public.learning_data_resets') is not null then
    execute 'select coalesce(jsonb_agg(jsonb_build_object(''user_id'', user_id, ''reset_at'', reset_at, ''server_version'', server_version)), ''[]'') from public.learning_data_resets'
      into rows_json;
  end if;
  result := result || jsonb_build_object('resets', rows_json);

  rows_json := '[]'::jsonb;
  if to_regclass('public.ai_access_grants') is not null then
    execute 'select coalesce(jsonb_agg(jsonb_build_object(''user_id'', user_id, ''status'', status, ''monthly_limit'', monthly_limit)), ''[]'') from public.ai_access_grants'
      into rows_json;
  end if;
  result := result || jsonb_build_object('aiAccessGrants', rows_json);

  foreach name in array array['user_profiles', 'study_sessions', 'study_session_parts', 'mistakes', 'vocabulary_logs', 'pacing_runs',
      'pacing_run_phases', 'streak_shields', 'sync_tombstones', 'learning_data_resets', 'ai_access_grants'] loop
    if to_regclass('public.' || name) is not null then
      execute format('select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) from public.%I t', name) into rows_json;
      raw := raw || jsonb_build_object(name, rows_json);
    end if;
  end loop;
  return result || jsonb_build_object('tables', raw);
end;
$$;

select pg_temp.toeic_export_v1()::text;
