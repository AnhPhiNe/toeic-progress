# Frontend readiness fixes — 22/10/2026

Branch: `codex/frontend-readiness-fixes`  
Base: `853993e97e5b46a0b77c555f0832050476dd77ea`

## Scope

Implement the frontend fixes accepted after the UI/UX audit, preserving the current visual style. Three agents owned batch capture, review scheduling/accessibility, and dashboard metrics. The integration owner reviewed the boundaries and ran the combined checks.

This batch does not change backend code, Supabase schema/policies, deployed configuration, or production data. AI/browser tests use local fixtures and mocked provider responses; they do not consume paid OpenAI requests. No deployment, commit or push has been performed.

## Completed changes

| Area | Result | Main regression evidence |
| --- | --- | --- |
| Batch capture lifecycle | Closing/unmounting, changing mode or changing account invalidates pending responses and prevents the next screenshot chunk. Expected owner is checked through CAPTCHA and the final session lookup. | `batch-capture-regressions.spec.ts`, AI client/API tests |
| Batch persistence | Validate every card, field limits, question/Part, choice consistency, duplicate IDs and UTF-8 size before one bundle write. A failure preserves the previous bundle and draft IDs, allowing a retry without partial cards. Explanation queuing occurs after persistence. | `batchCapture.test.ts`, `persistMistakeBatch.test.ts`, storage-failure E2E |
| Batch completeness | Show requested/read/missing question counts and the six-question limit per request. Automatic discovery asks the learner to check the returned list. No automatic paid retry is added. | Missing-question/oversized-card E2E |
| Legacy practice | Metadata and numerator edits preserve the saved denominator, including Part 7 drills such as 4/5. Explicitly choosing another Part still starts a whole-Part row. | `legacy-practice-edit.spec.ts` at 1280px and 375px |
| Review schedule | Quên, Khó, Tốt and Dễ now have distinct bounded scheduling rules. Quiz booleans remain compatible. Early positive reviews preserve their schedule. Invalid historical stages are clamped. | Review unit tests and `review-rating-regressions.spec.ts`; SPEC §4.6 |
| Keyboard accessibility | Inactive flashcard faces are inert; flipping moves focus to the visible face. The modal trap excludes hidden/inert elements. | Keyboard E2E plus existing sheet/focus tests |
| Unknown metrics | Missing raw scores remain unknown; derive a skill total only from all valid Part counts. Actual zero is preserved. CEFR uses both skill thresholds; score milestones no longer claim CEFR from total alone. | `skillSummary.test.ts`, `metrics-readiness.spec.ts` |
| Metrics and copy | Loss bars encode wrong-question counts, with accuracy labelled separately. Fractional minutes display at most one decimal without changing stored precision. Due-review copy is neutral. | Metrics E2E and plan display tests |
| No-source analytics | No unlinked notes are assigned to a selected test. An explicit “Mở toàn bộ Sổ tay” action opens all notes without altering source/session fields. | `analytics-scope.spec.ts` |
| Runtime and motion | Fix conditional phone hook and recursive UUID fallback. Scroll cues stop after two cycles and disable their animation under reduced motion. | UUID tests, first-phone-result E2E, picker/motion E2E |
| Test maintenance | Update navigation and active-face selectors while preserving business checks; provider mock accepts Vite query timestamps. | Existing E2E suite |

## Validation

- TypeScript check: passed.
- ESLint: passed.
- Production build: passed.
- Frontend unit tests: **347 passed / 50 files**, using `npm test -- --maxWorkers=1 --no-isolate` outside the Windows sandbox. The initial sandbox run failed on missing Vitest temporary cache files, not application assertions.
- Backend local suite: **319 passed**.
- Database local suite: **all seven scripts passed**, including migrations, RLS/grants, sync, purge, limits, AI access and explanation ledger. These use the local test database, not the live Supabase project.
- Browser regression suite: **203 passed in one complete final run** (`npm run test:e2e -- --max-failures=5`, 3.5 minutes). It covers desktop/phone layouts, dark mode, reduced motion, account/sync boundaries and persistence failures. Earlier failures were corrected before this run; the picker test now explicitly opens suggestions after a layout change instead of assuming the popup stays open while its container scrolls.
- Working-tree whitespace check: passed (`git diff --check`).

## Practical limits and next step

The local checks verify the application's logic and mocked API contracts. They are not a new live-production sign-in, paid AI or real-device acceptance run. Before deploying this branch, confirm its final diff and run a small production smoke test against the existing backend/Supabase setup.

Build still reports the existing large JavaScript bundle (about 450 KiB gzip), plus third-party Zod annotation warnings. Route-level code splitting can be handled separately; neither warning failed this build. The backend test run also reports a Starlette TestClient deprecation and an unwritable pytest cache warning, with all assertions passing.
