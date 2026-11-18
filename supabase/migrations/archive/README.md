# v1 migrations (history only)

These twelve files built the v1 schema (2026-09 to 2026-11). They are kept for
history and for `tests/database/test-rebuild.mjs`, which replays them to test
the rebuild scripts. **Do not apply them.**

The Supabase CLI only reads `*.sql` files directly inside `supabase/migrations/`,
so this subfolder is never applied by `supabase db push` / `supabase db reset`.
The current schema is `../20261120000000_baseline_v2.sql`; see
`docs/DB_REBUILD_2026-11.md`.
