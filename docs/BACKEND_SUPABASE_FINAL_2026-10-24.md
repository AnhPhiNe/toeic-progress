# Backend and Supabase final integration check — 2026-10-24

## Implemented locally

- The existing result-image AI request now returns elapsed durations in seconds: total, Listening, Reading and Parts 1–7. Missing scopes remain null; no extra provider request is made.
- Extraction instructions distinguish elapsed time from remaining time, limits, goals and ambiguous clock units. No inferred totals, scope splitting or rounding to minutes.
- Fixed the existing strict OpenAI schema: every object property is required, including nullable fields. The previous Part-minute properties were not listed in `required`, which could reject the whole request. Historical minute fields remain parse-compatible but are not requested or emitted as source scores.
- Confirmed timing has the explicit `IMAGE_CONFIRMED` source, strict integer bounds of 0–86400 seconds and at least one observed value. Only Full Test sessions accept it. Sync preserves the canonical null shape rather than stripping unknown scopes.
- Existing native session `extra` JSON persists timing without a schema migration. The server does not silently rewrite `durationMinutes`; explicit application is a frontend action. Existing manual `partDurations` remain untouched.
- Attempt analysis reads only the authenticated owner's selected session and linked notes, verifies versions before spending AI quota and includes validated confirmed timing. Its prompt states that timing alone does not establish slow reading, time pressure or another cause.

## Verification

- Entire backend suite: **375 passed** (mock transports, no paid model calls).
- AI frontend client suite: **55 passed**.
- All seven local database scripts passed: domain round trips, RLS, private RPC grants, quota reservations, reset barriers, content purge, provider retirement, AI grants and explanation ledger. The native session fixture includes exact timing/null round trip.
- Existing warnings: Starlette/httpx testclient deprecation and pytest cache write permission. No failed assertions.

## Live Supabase metadata-only inspection

Project: `nztodqxtteqromszwwfg`. No learner rows, tokens, source image contents or secrets were read. No live schema/data/config changes were made.

- All **22 public tables** have RLS enabled.
- `study_sessions` and `mistakes` have permanent-owner SELECT policies: owner UID plus non-anonymous session. No browser write policies were found for these tables; mutation passes through the authenticated backend.
- `sync_account_records`, `reset_learning_data` and `reserve_ai_request` deny EXECUTE to anon/authenticated and allow the service role.
- `mistake-sources` is private, JPEG-only, 1 MiB/object; no direct `storage.objects` policies were returned. Backend constructs paths using authenticated owner IDs and generates short-lived signed URLs.
- AI access is keyed by verified user ID, not editable user metadata. Pending/blocked users are denied provider calls. Existing account and AI reservation tests passed.

Security advisor findings:

- Nine INFO `RLS enabled/no policy` entries concern intentionally server-only access/quota/ledger/reset tables; do not add broad browser policies to silence these.
- One WARN: leaked-password protection disabled. The current app uses Google login. Revisit before enabling password authentication. [Supabase guidance](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

Performance advisor findings:

- Two INFO missing covering FK indexes (`ai_usage_counters.owner_id`, `mistakes(user_id, linked_session_id)`). Not a correctness blocker for the small beta; measure before introducing a deployment migration. [Advisor guidance](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys).
- Thirteen WARN RLS initialization-plan entries. Current inspected policies already use scalar SELECTs around `auth.uid()` and `auth.jwt()`; review actual query plans before changing security predicates solely to silence the linter. [Guidance](https://supabase.com/docs/guides/database/database-linter?lint=0003_auth_rls_initplan).
- Three unused-index INFO entries are observations from a small dataset, not sufficient reason to drop indexes.

This metadata check is not an adversarial live two-account token test. Local database tests cover owner isolation and denied RPC roles.

## Rollout boundary

Backend must deploy before the frontend timing review. Old backend responses without `timing` remain accepted by the frontend; new backend output is additive. No database migration is needed for this feature. A real result screenshot with visible elapsed time should be checked end to end after local integration, before claiming live timing extraction quality. No deployment was performed.

After the metadata audit, root performed one paid provider request with a synthetic result image, without reading or writing learner data. HTTP 200 returned exact score/wrong/skipped values and elapsed scopes: total 6763, Reading 4500, Part 5 795 and Part 6 500 seconds; absent scopes remained null. The visible limit and remaining time were ignored. This verifies the strict schema and a controlled provider example, not the authenticated production save/reload flow or all real screenshot formats.
