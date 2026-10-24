# Batch 2 report — Darren (Person 1, platform)

Batch and owner: Batch 2, Darren / Person 1.
Branch: `platform`.
Base/foundation commit: `5d8f342` ("Foundation: workspace, contracts, platform backend, stubs"); `origin/main` and `origin/platform` were both at this commit at the start and after `git fetch` at the end of this session.
Implementation commit or working-tree status: see the commit named in the final message of this batch (filled in `integration.md`). Before that commit the tree was uncommitted.
Teammates: Person 2 = Joanne (engine, fixtures), Person 3 = Maricella (web, delivery). Neither has pushed an `engine` or `experience` branch; `git ls-remote`/`git branch -r` show only `main` and `platform`.

## 1. Exists versus stubbed (inspected, not assumed)

| Piece | State | Evidence |
|---|---|---|
| Login, session, logout | Implemented, DB-backed | `apps/api/test/api.test.ts` "logs in, keeps the session…"; live curl against separate API process |
| Auth on private routes | Implemented | "rejects unauthenticated access to every private route…" (13 routes) |
| Origin check on mutations | Implemented | "checks Origin on browser mutations" |
| CLI bearer scope | Implemented | "restricts the CLI bearer token to demo injection only" |
| Demo ingest (`POST /v1/demo/inject`) | Implemented; same `ingestMessage` as Gmail | `packages/data/src/demo.ts`, `ingest.ts` |
| Task list/detail, answers, retry, review | Implemented | `queries.ts`, `review.ts`, routes in `apps/api/src/routes/tasks.ts` |
| Queue (lease, heartbeat, recovery, attempts) | Implemented | `queue.ts`, `packages/data/test/queue.test.ts` |
| Worker process | Implemented, separate process | `apps/worker`; live run below |
| Engine | **STUB** (`packages/engine/src/index.ts` throws `ENGINE_NOT_IMPLEMENTED`) | live run below |
| Delivery | **STUB** (outbox → `simulated`, whatsapp → `blocked`) | `packages/delivery/src/index.ts` |
| Artifact store + downloads | Implemented | `artifacts.ts`, `routes/artifacts.ts` |
| Notification outbox | Implemented; intent committed with ready | `notifications.ts` |
| Web UI | **STUB** (labeled foundation page) | `apps/web/app/page.tsx` |
| Fixtures | **PLACEHOLDERS** from foundation; Joanne owns content | `fixtures/**` |

## 2. Scope implemented in this session

Batch 2 platform work was already built in the foundation commit. This session verified it against the Batch 2 prompt line by line, closed evidence gaps, and made two small production changes requested by the human:

1. **Demo injection preserves the fixture's `receivedAt`** (`packages/data/src/demo.ts`). Previously it was replaced with injection time, which made relative-date interpretation depend on when the demo ran. Ingestion time is now recorded only in the existing `created_at` columns (`TaskSummary.createdAt`, `intake_messages.created_at`). `providerMessageId` is still rewritten to `demo:<scenario>:<replayKey|uuid>` so dedupe works. Regression tests: `packages/data/test/demo.test.ts` ("stores the fixture receivedAt…") and `apps/worker/test/worker.test.ts` ("hands the engine the fixture's original receivedAt…"). Both fail if the old override is restored (checked by temporarily restoring it).
2. **API port consistency** (`apiPortMismatch` in `packages/data/src/config.ts`, used by `pnpm check:ready` and a startup warning in `apps/api/src/main.ts`). Documented in `docs/runbook.md` ("Using a different API port locally"). No machine-specific file is committed; `.env` stays git-ignored and only a comment was added to `.env.example`.

New files:
- `apps/api/test/batch2.test.ts` — 7 tests.
- `apps/api/test/support/inject-child.ts` — child-process helper for the multi-process race test.
- `packages/data/test/demo.test.ts` — 5 tests (receivedAt, provider id, port check, proxy rewrite).
- `docs/batches/batch-2/darren.md`, `docs/batches/batch-2/integration.md`.

Files changed otherwise: `packages/data/src/demo.ts`, `packages/data/src/config.ts`, `scripts/ready.ts`, `apps/api/src/main.ts`, `apps/worker/test/worker.test.ts` (1 test), `.env.example` (comment), `docs/runbook.md`. `apps/web/next.config.mjs` (Maricella's) is untouched; a test only reads its rewrite.

## 3. Interface inventory for teammates (no secrets)

### For Joanne — engine
Worker calls `runWork(input, { onProgress, signal })` imported from `@afterhours/engine`. Keep the existing exports (`runWork`, `EngineError`).

`EngineInput` is validated with `EngineInputSchema` before the call. Shape of a real proposal task (values abbreviated):

```json
{
  "taskId": "<uuid>", "revision": 1, "mode": "fixture",
  "email": { "providerMessageId": "demo:proposal:<replayKey|uuid>", "providerThreadId": null,
             "from": { "name": "Jordan Lee", "email": "jordan@client.example" }, "to": ["team@harbor.example"],
             "subject": "…", "receivedAt": "<fixture value, ISO UTC>", "bodyText": "…",
             "attachments": [{ "id": "att-brief", "filename": "maple-and-moss-brief.md", "mimeType": "text/markdown", "sizeBytes": 233 }] },
  "attachments": [{ "id": "att-brief", "filename": "maple-and-moss-brief.md", "mimeType": "text/markdown", "bytes": "<Uint8Array>" }],
  "organization": { "id": "…", "name": "…", "timezone": "America/Los_Angeles", "currency": "USD", "…": "from fixtures/organization/harbor-creative.json via settings" },
  "answers": [], "now": "<ISO UTC>", "fixtureScenario": "proposal"
}
```

Things Joanne must know:
- **`email.receivedAt` is the fixture's own value** (changed in Batch 2: it is no longer replaced by injection time). Relative dates resolve deterministically from it and `organization.timezone`. Only `providerMessageId` is rewritten, to `demo:<scenario>:<key>`. `now` in `EngineInput` is the worker's run time; do not use it to interpret the email's relative dates. Ingestion time is `task.createdAt`.
- Fixture attachment `sizeBytes` must equal the file's real byte length or injection fails with `FIXTURE_INVALID`.
- Sender addresses must be under `.example`.
- Result validation (`validateEngineResult`): `EngineResultSchema`; every evidence `sourceId` exists in `sources`; unique product ids; exactly one file per product (`proposal|report` → docx, `presentation` → pptx); exact Office MIME types; bytes must be a real ZIP with `[Content_Types].xml` and `word/document.xml` or `ppt/presentation.xml`. Violations → `ENGINE_INVALID_RESULT` / `ARTIFACT_INVALID`, nothing published.
- Throw `EngineError` (`code`, `retryable`). Retryable gets one automatic retry after about 30 s. Anything else becomes `ENGINE_UNEXPECTED_ERROR`.
- Hard deadline: `signal` aborts at 240 s. Progress stages `generate|verify|export` move the task `planning → running`; a `plan` in progress is stored.
- `GeneratedFile.id` becomes the artifact id verbatim (it is the global primary key of `artifacts`) and the on-disk file stem. It must match `[A-Za-z0-9._-]{1,200}` and be unique across tasks, so derive it from taskId + revision + product + format as the spec says.

### For Maricella — web and delivery
Browser calls `/api/...` (Next rewrites to `/v1/...`). Envelope `{ data }`; lists `{ data: { items, nextCursor } }`; errors `{ error: { code, message, details?, requestId } }`.

Routes: `GET|POST|DELETE /session`, `GET /tasks`, `GET /tasks/:id`, `POST /tasks/:id/answers|retry|review`, `GET /artifacts/:id/download`, `GET|PATCH /settings`, `GET /integrations`, `POST /demo/inject`, `GET /notifications`, Gmail OAuth routes (Batch 4).

Error codes to handle: `UNAUTHENTICATED` 401, `BAD_ORIGIN` 403, `VALIDATION_ERROR` 400, `NOT_FOUND` 404, `STALE_REVISION` 409 (`details.currentRevision`), `INVALID_TRANSITION` 409, `RATE_LIMITED` 429.

Download: `artifact.downloadPath` is exactly `/api/artifacts/<id>/download`. Response is the binary file with the exact Office `Content-Type`, `Content-Disposition: attachment; filename="<sanitized>"`, `Cache-Control: private, no-store`. 401 without a session; 404 for unknown ids.

Review: `POST /tasks/:id/review` with `{ revision, action: "approve" | "dismiss" }`. Stale revision → 409 `STALE_REVISION`. Non-ready → 409 `INVALID_TRANSITION`. Approving sends nothing.

Delivery: worker imports `sendNotification` from `@afterhours/delivery` and persists the returned state. Keep the existing signature and `DeliveryError`.

Sample ready task response (produced by the **test harness fake engine**, not Joanne's engine; synthetic, 372/379-byte placeholder Office ZIPs):

```json
{ "task": { "id": "c1e01e08-82f9-40ad-9c16-18ce14060e20", "status": "ready", "revision": 1, "ingestionMode": "demo",
            "generationMode": "fixture", "artifactCount": 2, "error": null },
  "artifacts": [
    { "id": "…-r1-proposal-docx", "format": "docx", "filename": "Proposal.docx", "sizeBytes": 379,
      "mimeType": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "sha256": "a049bdc253b4b5abab77088d844e31b16ca62a3622ea00225c318296005ae3c1",
      "downloadPath": "/api/artifacts/…-r1-proposal-docx/download" },
    { "id": "…-r1-presentation-pptx", "format": "pptx", "filename": "Kickoff Deck.pptx", "sizeBytes": 372,
      "sha256": "5b27d5754042c81ee2d87c5b8beb4302cea272d4d611ea3e3217c56954993760",
      "downloadPath": "/api/artifacts/…-r1-presentation-pptx/download" } ],
  "notifications": [{ "channel": "outbox", "state": "queued", "message": "Queued: results ready for review.", "providerMessageId": null }],
  "events": ["status/intake", "status/plan", "status/export", "progress/notify"] }
```

Sample failed task from the real two-process run with the stub engine: `status: "failed"`, `error: { code: "ENGINE_NOT_IMPLEMENTED", retryable: false }`, events `status/intake`, `status/plan` ("Started planning (attempt 1 of 2)"), `error/plan`. The UI should render `failed` with the error message and no files.

## 4. Commands executed

All run from the repo root on `platform` at `5d8f342` plus the uncommitted new files. Node 20.20.2, pnpm 10.33.4.

| Command | Exit | Result |
|---|---|---|
| `git fetch origin` | 0 | only `origin/main`, `origin/platform` |
| `pnpm install --frozen-lockfile` | 0 | already up to date |
| `pnpm check:ready` | 0 | config, migrations, ports, engine/delivery exports load |
| `pnpm vitest run apps/api/test/batch2.test.ts` | 0 | 7/7 |
| `pnpm test` after `receivedAt` + port changes | 0 | 8 files, 74 tests |
| `pnpm check:ready` with `API_PORT=4177` and default origin | 1 (expected) | `FAIL API_PORT matches API_ORIGIN … 4177 … 4000` |
| `pnpm check:ready` with `API_PORT=4177 API_ORIGIN=http://127.0.0.1:4177` | 0 | matches |
| `pnpm typecheck` | 0 | 7 packages |
| `pnpm lint` | 0 | 0 problems |
| `pnpm build` | 0 | `next build` + package checks |
| Two-process live run (below) | 0 | API :4177 + worker, temp DB/artifact dir |
| Three-service live run on 4177 (shell env only) | 0 | web :3000 `GET /api/session` → `{"data":{"authenticated":false}}` via the proxy; `pnpm demo:proposal` queued task `1737dbaa-9fc3-4dfb-9876-7dd67c155894`; login through the proxy OK; task detail `email.receivedAt` = `2026-01-12T17:00:00.000Z` (fixture), `task.createdAt` = `2026-10-24T01:31:11.252Z` (ingestion); task `failed` (stub engine) |
| `docker compose up` | NOT RUN | not exercised |

Live run: API and worker started as separate processes (`pnpm --filter @afterhours/api dev`, `@afterhours/worker dev`) with `DATABASE_PATH`/`ARTIFACTS_DIR` pointing at a scratch directory and `API_PORT=4177` (port 4000 is held by an unrelated project on this machine). `pnpm db:migrate`, `pnpm db:seed`, then `pnpm demo:proposal` (real HTTP POST with the CLI token).

## 5. Quality questions (Batch 2 list)

1. **Base and integrated commits; shared contracts** — Base `5d8f342`. No integrated commit exists. **BLOCKED**: no `engine` or `experience` branch on origin. All three roles can only consume the same `@afterhours/contracts` once their branches exist; Joanne and Maricella have not yet been observed consuming it.
2. **HTTP request, taskId, worker pickup** — **PASS**. `POST /v1/demo/inject` via `pnpm demo:proposal` returned taskId `a6a7547c-f612-4305-91e5-3f7ac5bc9faf`, revision 1. The separate worker process logged `job.start` for that task/revision, attempt 1, about 1 s later.
3. **API returns before generation; browser not responsible** — **PASS**. Test "inject only enqueues": response < 2 s with no worker running; task `queued`, one `queued` job with 0 attempts, only an `intake` event, 0 artifacts. The CLI inject round trip in the live run was 497 ms including `tsx` start-up.
4. **Concurrent duplicate replay keys** — **PASS**. `batch2.test.ts`: 25 simultaneous HTTP injections → one taskId, exactly one `deduplicated:false`, 1 task / 1 job / 1 intake row. Also 6 separate OS processes on one SQLite file → same result. Mechanism: unique `intake_messages.source_key` inside an immediate transaction, with a UNIQUE-violation fallback that returns the existing task (`packages/data/src/ingest.ts`).
5. **Persisted events** — **PASS for the stub run, PASS for the harness run, NOT RUN for the real engine.** Real events from the live run: `status/intake`, `status/plan` (planning), `error/plan`. Ready path events `intake → plan → export ("Ready for review: 2 files generated.") → notify` come from the worker test (`worker.test.ts` "runs a demo task end to end") with a fake engine. `generate`/`verify` progress and a `running` status need an engine that emits them; the fake in `worker.test.ts` does (test "moves planning->running only when generation starts").
6. **Actual engine export used** — **FAIL / BLOCKED**: only the foundation stub `@afterhours/engine` exists. Fake engines appear **only inside tests**: `apps/worker/test/worker.test.ts` (`happy`, etc.) and `packages/data/src/testing.ts` (`readyResult`, `runToReady`). The integrated gate stays blocked until Joanne's engine is merged.
7. **Real artifact filenames/sizes/hashes** — **BLOCKED for real files** (no engine). Harness values (synthetic ZIPs, not real documents): `Proposal.docx` 379 B sha256 `a049bdc2…ae3c1`, `Kickoff Deck.pptx` 372 B sha256 `5b27d575…93760`, MIME and `downloadPath` as in section 3. Header/byte/size equality is tested in `api.test.ts` "serves the real file with correct headers…".
8. **No ready with missing/invalid files; stale owner cannot overwrite** — **PASS**. `queue.test.ts` "does not publish a manifest when the artifact set is incomplete or invalid", "rejects a second commit for the same job", "recovers an expired lease once, rejects the stale owner…"; `worker.test.ts` "rejects malformed engine output and invalid files…".
9. **Review persistence, stale revisions, nothing sent** — **PASS**. `batch2.test.ts` "approve persists across a full API restart": API closed, DB closed, new connection and new Fastify app, same cookie still authenticates, task `approved`, review event present, still exactly 1 notification (the ready-commit outbox intent), none `accepted`/`delivered`. Stale → 409 in `api.test.ts`. Browser-level refresh is Maricella's to verify.
10. **Unauthenticated requests; CLI bearer** — **PASS**. 13 private routes return 401 `UNAUTHENTICATED` without a cookie; the CLI bearer gets 401 on tasks, task detail, settings, notifications, integrations (`api.test.ts`). Downloads require a session; the CLI bearer is rejected there too (download is in the 13-route list and the bearer is only accepted on `/v1/demo/inject`).
11. **Notification state; not claimed as WhatsApp** — **PASS** at unit level. State at commit is `queued`, channel `outbox`; delivery stub returns `simulated`; `whatsapp` returns `blocked`; `accepted`/`delivered` are never produced in outbox mode (`notifications.test.ts`, `worker.test.ts`, `batch2.test.ts`). Message text is "Queued: results ready for review." No live WhatsApp exists.
12. **Commands and exit codes** — section 4. NOT RUN: Docker, live Gmail, live model, Maricella's browser smoke test, integrated gate.
13. **Secrets/private data/absolute paths** — **PASS** for API responses: `batch2.test.ts` "task, list, notification… responses contain no storage paths or secrets" scans task detail, list, notifications, integrations and settings for repo root, artifacts dir, DB path, `rel_path`, app password, CLI token, session secret and `credentials`. Worker/API logs in the live run contain task ids, stage and error codes only (`worker.start`, `job.start`, `job.failed`); I read the tail of the worker log, not the full API log. `.env`, `var/`, SQLite files are git-ignored (`git status` shows none).
14. **What Maricella needs / what Joanne must supply** — section 3. Joanne: merged `engine` with real `runWork` and real fixtures at the agreed paths. Maricella: merged `experience` that calls the routes above.
15. **Team Batch 2 gate on a merged commit** — **BLOCKED / not passed.** Nothing was merged. Failing behavior: with the stub engine every task ends `failed` / `ENGINE_NOT_IMPLEMENTED`; there is no `ready` task, no real file, no UI preview. Owners: Joanne (engine + fixtures), Maricella (UI).

## 6. Universal quality questions

1. **Usable behavior and proof** — Platform path: authenticated demo inject → persisted task/job → separate worker claims it → honest failure with the stub engine. Proof: live run above. Ready/review path is proven with a test fake only.
2. **Checks executed** — section 4.
3. **Fixtures/mocks/stubs** — Engine and delivery are stubs; fixtures are placeholders marked `FOUNDATION PLACEHOLDER`; tests use fake engines. A task's `generationMode: "fixture"` and `ingestionMode: "demo"` are in every DTO for the UI to label. Nothing in live mode silently falls back: live without credentials fails `MODEL_NOT_CONFIGURED`.
4. **Exact contract** — Yes, `@afterhours/contracts` unchanged; no contract amendment requested. `receivedAt` is now the fixture value (section 3); tell Joanne.
5. **Dependency unavailable** — With the engine missing the task is `failed` with a visible actionable message, other tasks and the API stay up, worker heartbeat continues (`worker.healthy: true` in the live run).
6. **Persistence** — Tasks, jobs, events, sessions, review state, notification intents are in SQLite. Evidence: restart test (approve + session cookie) and replay-after-restart dedupe test. Real API restart under a running worker is NOT RUN beyond these in-process close/reopen tests.
7. **Boundary crossings** — None observed. Test scan of API responses is clean; no outbound network calls were made (no Gmail/model/Twilio credentials configured). The CLI token is used only against the local API.
8. **Blocked** — Engine merge (Joanne), UI merge (Maricella): blocks the integrated gate. Docker, live Gmail/model/WhatsApp are later batches.

## 7. Known limitations

- No real DOCX/PPTX has passed through the platform yet (HIGH for the gate, none for platform code).
- Rate limiting is per client IP behind one trusted proxy hop; disabled in tests (`rateLimit: false`).
- Multi-process race test spawns `node --import tsx` and needs `tsx` installed (it is a root devDependency).
- Docker/Compose written, not run.

## 8. Required teammate handoff

- Joanne: push `engine` (or tell Darren the commit). Darren will merge it into an integration branch, run `pnpm demo:proposal`, and download both files.
- Maricella: push `experience`; first merge target is the task list/detail against the sample responses above.
- Both: branch from `5d8f342` if not already done.

Suggested integrated gate status: **BLOCKED** (engine and web branches not available).
