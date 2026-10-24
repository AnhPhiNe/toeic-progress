# Final UI and integration review — 2026-10-24

Branch: `codex/frontend-readiness-fixes`. These changes are local; this review does not publish or deploy them.

## User-facing changes

- Nested score, timing, vocabulary and settings dialogs isolate background controls, keep keyboard focus in the top dialog and dismiss only the active layer. Result-score review fits short screens and retains unapplied corrections after dismissal.
- Test-name suggestions follow the opening form animation, keeping the list attached to its field and Save reachable.
- Raw wrong-question text is part of the account-scoped device draft, including unapplied text. Reload and phone/desktop layout changes preserve it. Saving requests Apply or Cancel instead of silently saving stale selections.
- Phone Full Test entry can switch from marking wrong answers to entering official scores. Official scores remain separate from reference conversions based on correct-answer counts.
- Result-image analysis reads visible elapsed times in its existing request. Review accepts explicit minutes:seconds or hours:minutes:seconds; unknown scopes remain empty. Applying is explicit, exact seconds persist, and supplemental images retain previously confirmed scopes.
- Manual timing edits clear conflicting image provenance. Session-mode changes preserve explicitly entered durations. Backup, draft and backend validation accept the same timing bounds and preserve unknown scopes as null.
- Attempt advice reports observations and evidence from the selected attempt. Score differences and elapsed time alone do not establish an error cause. Cached AI reports can be refreshed with visible consent; zero samples remain explicit.
- Long headings, score badges and the narrow-screen notebook footer wrap correctly. Selected pacing modes retain readable contrast during interaction. Plan deletion requires confirmation; 320px goal titles wrap on their own line rather than being squeezed by metadata. Batch capture allows inspecting full questions and options before saving.

## Backend and Supabase

The additive `resultTiming` field uses existing session `extra` JSON. No SQL migration is required. Validation restricts confirmed source timing to Full Test sessions, integer seconds from 0 to 86400 and at least one known scope. The AI capability endpoint advertises `result_image_timing`.

The strict result-image output schema now lists every property as required, using nullable values for unknown observations. The prompt distinguishes elapsed time from time remaining, test limits and ambiguous clocks without inferring missing totals or splitting scopes.

See [the backend audit](BACKEND_SUPABASE_FINAL_2026-10-24.md) for live read-only policy/grant/storage metadata and advisor findings. No learner rows or production settings were changed. Metadata inspection is not an adversarial live two-account isolation test.

## Verification boundaries

- Frontend unit tests: 406 passed.
- Backend tests: 375 passed. Seven local database scripts passed.
- One direct OpenAI request with a synthetic result image succeeded: exact displayed score, wrong/skipped questions, total/Reading/Part 5/Part 6 elapsed seconds and null for absent scopes. Displayed time limit and remaining time were excluded. No learner data or Supabase writes were involved.
- Integrated Chromium run: **319 passed** (271 regression cases plus 48 page captures across eight routes, widths 320/390/768/1440, phone dark mode and empty states). The 48 captured pages had no runtime errors or document horizontal overflow. A subsequently added supplemental-image pending-edit case was included in a focused timing/draft run: **8 passed**.
- Typecheck, ESLint and production build passed. Visual inspection covered representative phone/desktop/dark/empty captures in addition to component bounds, focus, Back/Escape and selected-mode contrast assertions.
- After the final visual adjustment, all **14 plan browser cases passed**, including the complete goal title, progress, details and horizontal bounds at 320px. These focused test counts overlap the integrated run; they are not additional independent cases to sum into its total.
- Browser tests use isolated mock/local data in Chromium. They do not establish physical iOS/Safari behavior, screen-reader quality or extraction accuracy across all exam-center screenshot formats.

## Release order

Deploy the backend before the frontend to expose source-timing extraction. Older backend responses without timing remain accepted. After deployment, verify one authenticated result-image → explicit review → save → reload flow using an actual result screenshot with visible elapsed time. Do not infer production verification from local mocks.

The build still reports the existing large JavaScript chunk warning. This is a performance follow-up, not a failed build or a reason to weaken data validation or account isolation.
