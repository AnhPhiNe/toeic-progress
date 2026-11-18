-- Step (c) of docs/DB_REBUILD_2026-11.md: remove the v1 app objects from
-- public/private. Never touches auth.* tables or storage (the only auth object
-- removed is v1's own trigger on auth.users). Safe to re-run: nothing left = no-op.
--
-- Refuses to run unless the session confirms it, and refuses on a database
-- that already has the v2 baseline (whose table names overlap):
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "set toeic.rebuild_confirm = 'drop-v1'" -f supabase/rebuild/drop_v1.sql
--
-- (SQL editor: run "set toeic.rebuild_confirm = 'drop-v1';" and this file together.)
do $$
declare
  item record;
  name text;
begin
  if coalesce(current_setting('toeic.rebuild_confirm', true), '') <> 'drop-v1' then
    raise exception 'Not confirmed. Export first (export_v1.sql), then run: set toeic.rebuild_confirm = ''drop-v1'';';
  end if;
  if to_regclass('private.sync_rows') is not null or to_regprocedure('public.schema_ready()') is not null then
    raise notice 'v2 baseline found: nothing to drop.';
    return;
  end if;

  drop trigger if exists register_ai_access_grant on auth.users;

  for item in select c.oid::regclass as rel, c.relkind from pg_class c
      where c.relnamespace = 'public'::regnamespace and c.relname in ('sync_records', 'exam_history') loop
    if item.relkind = 'v' then execute format('drop view if exists %s cascade', item.rel);
    else execute format('drop table if exists %s cascade', item.rel); end if;
  end loop;

  foreach name in array array['league_standings', 'league_members', 'league_groups', 'league_weeks', 'ai_batches',
      'ai_explanation_requests', 'ai_explanation_questions', 'ai_access_grants', 'ai_provider_attempts', 'ai_provider_state',
      'api_rate_limits', 'ai_requests', 'ai_usage_counters', 'learning_data_resets', 'sync_tombstones', 'study_session_parts',
      'weekly_plan_tasks', 'pacing_run_phases', 'mistakes', 'study_sessions', 'user_profiles', 'vocabulary_logs', 'weekly_plans',
      'pacing_runs', 'exam_checklist', 'streak_shields', 'sync_records_legacy'] loop
    execute format('drop table if exists public.%I cascade', name);
  end loop;

  for item in select p.oid::regprocedure as fn from pg_proc p
      where (p.pronamespace = 'public'::regnamespace and p.proname in ('apply_sync_records', 'claim_explanation_question',
          'cleanup_ai_usage', 'cleanup_explanation_ledger', 'clear_explanation_cache_on_reset', 'explanation_ledger_ready',
          'finish_explanation_question', 'finish_gemini_attempt', 'get_ai_usage', 'league_join', 'league_leave', 'league_refresh',
          'league_update', 'normalize_ai_access_grant', 'register_ai_access_grant', 'reserve_ai_batch_request', 'reserve_ai_request',
          'reserve_api_request', 'reserve_gemini_attempt', 'reset_learning_data', 'sync_account_records'))
        or (p.pronamespace = to_regnamespace('private') and p.proname in ('compact_deleted_domain_record', 'league_check',
          'league_finalize_before', 'league_place', 'league_rollover', 'league_zone', 'purge_domain_content', 'reject_legacy_write',
          'soft_delete_domain_record', 'stamp_domain_record', 'store_domain_record', 'store_live_domain_record', 'touch_domain_parent')) loop
    execute format('drop function if exists %s cascade', item.fn);
  end loop;

  drop sequence if exists public.sync_record_version;
  -- v1's private schema held only the helpers above; keep it if anything else is in it.
  if to_regnamespace('private') is not null
     and not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'private')
     and not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'private') then
    drop schema private;
  end if;
  raise notice 'v1 app objects dropped.';
end;
$$;
notify pgrst, 'reload schema';
