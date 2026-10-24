# Backend handoff (Person 1 — platform and integration)

## Foundation commit

Foundation commit: see `git log --oneline` for the commit titled **"Foundation: workspace, contracts, platform
backend, stubs"** on `main`. Branch from that exact commit:

| Branch | Owner | Owns |
|---|---|---|
| `platform` | Person 1 | root config, lockfile, Docker, `packages/contracts`, `packages/data`, `apps/api`, `apps/worker`, platform docs |
| `engine` | Person 2 | `packages/engine` (+ its package.json/tests), `fixtures/**`, engine docs |
| `experience` | Person 3 | `apps/web` (+ package.json, next.config), `packages/delivery`, `tests/e2e/**`, UX/demo/notification docs |

Do not edit another owner's paths, migrations, API routes, shared types, root dependencies, or the lockfile without
coordinating. Contract changes go through `docs/contract-change-requests.md`.

**Stubs ready for replacement now:**
- `packages/engine/src/index.ts` — throws `EngineError("ENGINE_NOT_IMPLEMENTED")`. Person 2 replaces; keep exports.
- `packages/delivery/src/index.ts` — outbox returns `simulated`, WhatsApp returns `blocked`. Person 3 replaces.
- `apps/web/app/*` — labeled foundation screen. Person 3 replaces. Keep the `/api` rewrite in `next.config.mjs`.
- `fixtures/**` — minimal valid placeholders (text marked FOUNDATION PLACEHOLDER). Person 2 replaces content;
  keep paths, the `DemoFixture` shape, and sender addresses under a `.example` domain. Each attachment's
  `sizeBytes` in the envelope must equal the real file size (the loader verifies it).

## Toolchain (verified on the dev machine)

- Node 20.20.2, pnpm 10.33.4 (`packageManager` pinned). `engines.node >= 20.19`. Docker image: Node 22.
- TypeScript ~5.9.3, Vitest 4, ESLint 10 + typescript-eslint, Zod 4, Fastify 5, Next 16.4.3, React 19.3.1,
  better-sqlite3 12.11.1 (v13 needs Node 22+, so it is pinned to 12).
- **macOS 27 / Xcode note:** if `better-sqlite3` cannot download a prebuilt binary it compiles from source, and the
  Command Line Tools linker fails on the macOS 27 SDK (`tapi error: malformed file ... unknown architecture`).
  Fix by building with full Xcode:
  ```bash
  export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
  export SDKROOT=$DEVELOPER_DIR/Platforms/MacOSX.platform/Developer/SDKs/MacOSX26.4.sdk
  pnpm install
  ```

## Scripts (all exercised locally unless noted)

| Command | Result in this environment |
|---|---|
| `pnpm install` | OK (with the Xcode env above). |
| `pnpm setup:local` | OK; second run is a no-op ("No missing secrets to generate"). |
| `pnpm db:migrate`, `pnpm db:seed` | OK. |
| `pnpm check:ready` | OK (config, migrations, ports, engine/delivery exports). |
| `pnpm typecheck` | OK, all 7 packages. |
| `pnpm lint` | OK, 0 problems. |
| `pnpm test` | OK, 61 tests in 6 files (data, API, worker). |
| `pnpm build` | OK (`next build` + package type checks). |
| `pnpm dev` | OK: web :3000, API, worker started; graceful worker stop logged on SIGTERM. |
| `pnpm demo:proposal` | OK: real HTTP POST with the CLI token; task queued; worker ran it; with the stub engine it fails honestly with `ENGINE_NOT_IMPLEMENTED`. |
| `pnpm test:e2e` | Prints SKIPPED until Person 3 adds `tests/e2e`. |
| `docker compose up` | **Not exercised** (no Docker run in this environment). |

## Routes (backend paths; browser uses `/api/...`)

Implemented exactly as in `docs/CONTRACT.md` §10: `GET /health`, `POST|GET|DELETE /v1/session`,
`GET /v1/tasks`, `GET /v1/tasks/:id`, `POST /v1/tasks/:id/answers|retry|review`, `GET /v1/artifacts/:id/download`,
`GET|PATCH /v1/settings`, `GET /v1/integrations`, `GET /v1/integrations/gmail/start`,
`GET /v1/integrations/gmail/callback`, `DELETE /v1/integrations/gmail`, `POST /v1/demo/inject`,
`GET /v1/notifications`.

- Envelopes: `{ data }`, lists `{ data: { items, nextCursor } }` (default 30, max 100, `createdAt DESC, id DESC`),
  errors `{ error: { code, message, details?, requestId } }`. No stacks or secrets.
- Auth: session cookie `ah_session` (HttpOnly, SameSite=Lax, Path=/, no Domain, Secure when `PUBLIC_APP_URL` is
  https, 7 days). Mutations require `Origin` = `PUBLIC_APP_URL` origin (403 `BAD_ORIGIN`).
- `DEMO_CLI_TOKEN` bearer works **only** on `POST /v1/demo/inject` (verified: 401 on tasks/settings/etc.).
- Verified live through the Next rewrite: login cookie set and sent back, Origin enforced, OAuth callback 302
  `Location` passes through to the browser.
- Error codes the UI should handle: `UNAUTHENTICATED` 401, `BAD_ORIGIN` 403, `VALIDATION_ERROR` 400,
  `NOT_FOUND` 404, `STALE_REVISION` 409 (`details.currentRevision`), `INVALID_TRANSITION` 409,
  `RATE_LIMITED` 429, `GMAIL_NOT_CONFIGURED` 503, `DEMO_REJECTED` 403.
- Gmail callback redirect markers: `/settings?gmail=connected`, or `/settings?gmail=error&reason=` one of
  `invalid_state | expired | session | denied | no_refresh_token | exchange_failed`.

## Engine and delivery integration

```ts
import { runWork, EngineError } from "@afterhours/engine";          // worker only
import { sendNotification, composeNotification, DeliveryError } from "@afterhours/delivery"; // worker only
import type { EngineInput, EngineResult, DeliveryInput } from "@afterhours/contracts";
import { EngineResultSchema, DeliveryResultSchema } from "@afterhours/contracts";
```

What the worker guarantees / checks:
- Builds `EngineInput` from the task's immutable snapshot: stored envelope, stored attachment bytes, settings
  organization, cumulative answers, injected `now`, `mode` snapshotted at ingestion, `fixtureScenario` for demo tasks
  (`null` for Gmail).
- Live mode without model credentials fails before calling the engine (`MODEL_NOT_CONFIGURED`, non-retryable).
- `signal` aborts at 240 s. `onProgress` stages `generate|verify|export` move the task planning → running; a
  `plan` in progress is stored and shown early.
- Result validation (`validateEngineResult`): schema; every evidence `sourceId` must exist in `sources`; unique
  product IDs; exactly one file per product (`proposal|report` → docx, `presentation` → pptx); file `mimeType` must be
  the exact Office MIME; bytes must be a real ZIP with `[Content_Types].xml` and `word/document.xml` /
  `ppt/presentation.xml`. File IDs must match `[A-Za-z0-9._-]{1,200}`. Failures → `ENGINE_INVALID_RESULT` /
  `ARTIFACT_INVALID`, non-retryable, no files published.
- Errors: throw an object with `code: string` and `retryable: boolean` (`EngineError`). Retryable → one automatic
  retry after ~30 s in the same revision. Anything else becomes `ENGINE_UNEXPECTED_ERROR`.
- Delivery: throw `DeliveryError` with `code/retryable`. Retryable → up to 3 attempts with backoff.
  `DELIVERY_UNCERTAIN` is never retried. `blocked` is final, its `reason` is stored and shown.

## Data model summary (`packages/data/migrations/001_init.sql`)

`workspace_settings` (one row, validated JSON) · `sessions` (token hash only) · `oauth_states` (hashed, session-bound,
10 min, single use) · `integrations` (Gmail; AES-256-GCM encrypted tokens; checkpoint JSON) · `intake_messages`
(unique `source_key`) · `intake_audit` (bounded to 500 rows) · `tasks` · `task_attachments` (input snapshot bytes) ·
`answer_history` (old answers stay traceable) · `task_sources` · `task_events` · `jobs` (unique task/revision, lease,
attempts) · `artifacts` (unique task/revision/product/format, relative path only) · `notifications` (unique dedupe key,
lease, schedule) · `worker_status`.

Files: `ARTIFACTS_DIR/<taskId>/r<revision>/<fileId>.<docx|pptx>`, written to `.staging/` then renamed; the DB
manifest is committed only after the full set is on disk, in the same transaction as status, events and the
notification intent.

## Tested flows (automated, `pnpm test`)

Ingest dedupe across connections · unknown sender audited, no task · demo namespace cannot authorize a real sender ·
two-worker atomic claim · lease expiry recovery + stale owner rejection + attempt limit · transient retry vs
terminal failure · ready commit (manifest + one notification) · incomplete/invalid artifact set publishes nothing ·
no duplicate manifests · skipped/needs_input create no files · review only from ready, stale 409, terminal states ·
answers validation/revision bump/history · retry only from failed · planning→running on generation · quiet hours
across midnight, 23:30 → next-morning digest, spring-forward DST, nonexistent local time, digest grouping +
restart persistence · outbox immediate send, blocked final, retry backoff, `DELIVERY_UNCERTAIN` not retried, crashed
live send not resent · token encryption/tamper/refresh-token retention · session hash/expiry/revocation · OAuth state
mismatch/replay/expiry · settings validation · artifact path traversal/symlink rejection · Gmail MIME nested parts,
HTML sanitizing without fetching, overlap idempotency, no checkpoint advance past a failed fetch, revoked-token
guidance · API auth on every private route, Origin check, CLI scope, demo disable, pagination, download headers,
OAuth route flow with an injected Google port · worker end-to-end with a fake engine, stub engine fails honestly,
deadline abort, crash/restart recovery without duplicate results, graceful shutdown release, needs_input → answers →
revision 2 ready.

## Environment the humans must provide (no values here)

- Always: nothing beyond `pnpm setup:local` (generates `SESSION_SECRET`, `TOKEN_ENCRYPTION_KEY`, `DEMO_CLI_TOKEN`,
  `APP_PASSWORD`).
- Live model: `GENERATION_MODE=live`, `MODEL_PROVIDER`, `MODEL_NAME`, and `OPENAI_API_KEY` or `ANTHROPIC_API_KEY`.
- Gmail: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` (see runbook).
- WhatsApp (only if eligible): `NOTIFICATION_CHANNEL=whatsapp`, `WHATSAPP_USE_CASE_ELIGIBLE`,
  `WHATSAPP_CUSTOMER_SERVICE_WINDOW_UNTIL`, `TWILIO_*`.

## Not done / not verified — be explicit in the demo

- **Engine, real files, previews:** depend on Person 2. With the stub, no task can reach `ready` outside tests.
- **Live Gmail:** OAuth and polling code is implemented and unit-tested against a fake Gmail API, but **not tested
  against Google** (no OAuth client configured). P1 is not complete until a real new email reaches `ready`.
- **Live model:** not tested (no key; engine not merged).
- **Live WhatsApp:** not implemented (delivery stub). Outbox `simulated` is the working fallback.
- **Docker/Compose:** written, not run.
- **Shared acceptance suite / browser e2e:** waits on engine + experience merges.
- Rate limiting is per client IP as seen by the web proxy (one trusted hop).
- Gmail polling lists at most 5 pages × 50 messages and processes 10 per 15 s cycle; a backlog beyond the listing
  cap is reported as `truncated` in the poll result only.
- MIME text is decoded as UTF-8; other charsets may render imperfectly.

## Next integration step

1. Persons 2 and 3 branch from the foundation commit and replace their stubs.
2. Person 1 merges `engine` first, then runs `pnpm demo:proposal` / `demo:report` to a `ready` task and checks
   downloads open in Word/PowerPoint.
3. Then Gmail with a configured Google test client, then quiet-hours rehearsal with a controlled clock.


## Batch 3 platform semantics (clarification, revisions, state integrity)

Everything below is covered by tests that use a **fake engine** where an engine is needed. None of it proves real
document generation.

### Route and validation semantics

| Request | Success | Failure codes |
|---|---|---|
| `POST /v1/tasks/:id/answers` `{revision, answers[1..50]}` | 200 `TaskSummary`, `status: "queued"`, `revision + 1` | 400 `VALIDATION_ERROR` (empty list, non-integer revision, unknown question id, duplicate id, required question missing or blank, answer > 5000 chars); 409 `STALE_REVISION` (`details.currentRevision`); 409 `INVALID_TRANSITION` (task not `needs_input`); 404 `NOT_FOUND`; 403 `BAD_ORIGIN`; 401 |
| `POST /v1/tasks/:id/retry` `{revision}` | 200, `queued`, `revision + 1` | 409 `INVALID_TRANSITION` unless `failed`; 409 `STALE_REVISION` |
| `POST /v1/tasks/:id/review` `{revision, action}` | 200, `approved` or `dismissed`, same revision | `approve` only from `ready`; `dismiss` from `ready`, `needs_input`, `failed`, `skipped`; otherwise 409 `INVALID_TRANSITION`; stale 409 `STALE_REVISION` |
| Bad body / JSON / query / cursor | 400 `VALIDATION_ERROR` or `BAD_REQUEST` | oversized body 413 `PAYLOAD_TOO_LARGE` (limit 256 KiB); a malformed `cursor` is now 400 (it used to silently return page 1) |

Order of checks: revision first (stale wins), then state, then answer content. A failed validation writes nothing.
All checks and writes happen in one `BEGIN IMMEDIATE` transaction, so concurrent submits serialize across processes.

### Revision behaviour
- Answers and manual retry create revision N+1 and exactly one job (`UNIQUE(task_id, revision)`), in the same transaction as the status change and event.
- Retained answers merge by question id into `TaskDetail.answers`; every submitted answer is also archived with its question text in `answer_history` (not exposed; see CCR-1).
- `TaskDetail.artifacts` = current revision only. `events` = all revisions, each keeping its `revision`. `sources` = latest revision that has stored sources. `questions` is empty once answered.
- A worker or review action carrying an old revision is rejected: `LeaseLostError` for workers (writes nothing), `STALE_REVISION` for reviews.
- Notification dedupe keys are `<taskId>/<revision>/<channel>`; a task that is ready in two revisions gets two intents.

### Intake boundaries (single enforcement point: `ingestMessage`)
Max 5 files, 10 MB per file, 20 MB total, no repeated attachment ids, body cut at 60,000 chars. A file that is not stored
gets a visible `warning` event on the task ("Attachment X was not read: <reason>"). If the envelope still lists it, the worker
fails the task with `ATTACHMENT_UNAVAILABLE` (non-retryable) before calling the engine. Demo attachments come only from
`fixtures/` via `resolveFixturePath` (rejects traversal, absolute paths, NUL, symlink escapes).
Extracted-text caps for model input are the engine's job.

### State machine
`packages/data/src/state.ts` is the only transition table; `setStatus` is the only code that writes `tasks.status`.
`packages/data/test/batch3.test.ts` checks all 81 (from, to) pairs against the spec table, plus the recovery exception.

### Tests added in Batch 3 (fake engine where noted)
- `packages/data/test/batch3.test.ts` — state table, answers (valid/invalid/stale/duplicate/retained), 6-process answer race, approve/dismiss process race, stale worker after retry, notification dedupe across revisions, intake limits, fixture path safety.
- `apps/api/test/batch3.test.ts` — status × action matrix over HTTP, answer error codes, 10 simultaneous HTTP submits, resumed-clarification task detail, malformed/oversized requests.
- `apps/worker/test/batch3.test.ts` — **fake engine**: four scenarios through `injectDemo` and the worker, real fixture bytes reach the engine, resumed clarification, dropped attachment, notification failure does not rerun generation.

### Still blocked (needs teammates' branches)
Real engine outputs for report, ambiguous and no_action; real browser clarification flow; Eden's independent run; the merged
Batch 2/3 gate. See `docs/batches/batch-3/darren.md` and `docs/batches/batch-2/integration.md`.
