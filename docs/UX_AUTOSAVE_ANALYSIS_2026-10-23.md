# Local UX improvements and attempt analysis — 23 October 2026

## Delivered scope

- Result entry, single/batch notebook entry and the wrong-question detail list keep validated local drafts per account and editing scope. Reopen or reload restores typed facts without another AI request. Successful save and explicit discard clear the corresponding draft. Explicit data reset clears only that account's drafts and cached advice on this browser.
- Drafts remain browser-local. They do not sync between devices and are not included in the learning-data backup. They never serialize File/Blob, base64 images, signed URLs, credentials or explanation tickets. Existing private source-image IDs can be retained; an image that had not been uploaded must be selected again, with a visible reminder and validation guard.
- Dashboard resumes the newest unfinished Full Test attempt with the remaining Reading-card count. Navigation uses session identity, not only the source name.
- AI feedback distinguishes reading, checking extracted content and writing explanations where these are actual separate phases. Single extraction truthfully describes its combined analysis. Missing questions are listed so only missing input needs to be added.
- Delete Undo is offered for fifteen seconds in a notification above mobile navigation. Grade Undo remains available until the next grade or closing review, including the results screen. Persistence restores the previous schedule only when the latest card still matches the operation; it rejects account changes and concurrent grades/deletions rather than overwriting newer work.

## DeepInfra analysis

The optional backend-only `DEEPINFRA_API_KEY` enables `deepseek-ai/DeepSeek-V4.1-Flash-1017` through `/api/v1/ai/analyze-attempt`.

The route authenticates the account and applies existing managed AI access and quota reservation. Before reservation, it fetches the selected Full Test and linked notes using explicit owner/deleted/session filters. It compares the session and all note versions with the current UI snapshot. Unsynced data, missing evidence, guests, pending/blocked access and missing configuration do not call the provider.

Only linked notes with meaningful detail are evidence. Source-only notes, other attempts and notes explicitly moved to another test are not attributed to the selected attempt. Structured statistics come from server facts; the model supplies at most three priorities with known Part/evidence references and actionable practice. JSON shape and references are validated, but these checks do not establish semantic correctness of every recommendation.

The frontend requests generation explicitly after recipient disclosure; it sends no source images or email to DeepInfra. Reports are cached locally per account/attempt and fingerprint. Opening cached reports makes no generation request; changed data requires an explicit update. Late responses after selection/account changes are discarded. Cached advice is a convenience, not a cloud-synced study record.

Buttons open the existing source notebook, Reading timer/focus timer and weekly plan. They do not silently create plan goals or change study records. The public privacy page describes the additional recipient and local drafts.

## Rollout and remaining live check

No database migration is required. Deployment needs the backend update and optional DeepInfra secret on Render, then the frontend update on Vercel. Existing OpenAI screenshot/explanation behavior remains configured separately.

The full frontend unit suite passed 392 tests; the full backend suite passed 359 tests. TypeScript, ESLint, production build and diff whitespace checks passed. The broad browser run passed 242/243 scenarios and exposed a draft-scope collision between standalone entry and passage reuse. After fixing the collision, all 26 related browser scenarios passed, including two new draft regressions. These runs cover 245 distinct browser scenarios; the final patch was checked with the related subset rather than repeating the full suite.

Local frontend and backend were started on 127.0.0.1:3000 and :8000; frontend HTTP 200 and backend health/configuration were checked.

## Bounded live provider verification

After the local key was configured, a synthetic probe sent no Supabase requests and no personal study records. Two initial provider requests were rejected before a completion was returned. Diagnosis exposed an endpoint contract difference: the OpenAI-compatible API requires string `reasoning_effort` values, so the numeric 40 was replaced with `medium`. Mock request assertions now pin this contract; feedback separately identifies upstream configuration, access, billing, throttling and service errors without logging raw provider bodies.

The following single generation succeeded with HTTP 200 and passed the backend JSON/evidence validation: 19.66 seconds, 1,063 prompt tokens, 1,877 completion tokens, 2,940 total tokens. DeepInfra reported `estimated_cost=0.000656012` USD for this request. This is one observed request, not a general latency or cost guarantee. The report grounded passive-voice advice in the learner's synthetic explanation and table-reading advice in the wrong rate column, cited the correct two evidence IDs, and explicitly avoided generalizing from one question per Part.

The live probe exercised provider generation/validation only. Authenticated owner-scoped Supabase loading, quota behavior and frontend transitions were tested with mocks; the new complete route has not yet been exercised against a real learner attempt. No learning data was written, no production deployment was changed and no background retries were enabled. Probe code and result are in ignored `scratch/check_deepinfra_advice.py` and `scratch/deepinfra-live-synthetic-result.json`; neither contains API credentials.

All changes remain local until an explicit commit/push/deployment step.
