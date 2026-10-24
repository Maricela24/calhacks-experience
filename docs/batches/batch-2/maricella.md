# Batch 2 report — Maricella (Person 3, experience)

Batch and owner: Batch 2, Maricella / Person 3.
Branch: `experience`.
Base/foundation commit: `5d8f342`. Merged `origin/platform` at `b442c71` (includes Darren's `e5b8510`) with a clean merge commit `691c3cd`; no conflicts, my files untouched by the merge.
Implementation commit or working-tree status: code and report at `84a372e` on `experience` (parent `691c3cd`, the merge of `platform` `b442c71`). Committed locally; **NOT PUSHED** (GitHub returned 403: Claude lacks access to the org repo).
Scope implemented: the Batch 2 user flow in `apps/web` (login with safe `returnTo`, queue, demo injection, task detail with persisted progress, structured previews, verified downloads, "Mark reviewed", notifications history, settings status), `packages/delivery` outbox/composition (also the Twilio adapter, blocked unless configured and eligible), and `tests/e2e`. Batch 3 prompt was read and **not started**: the Batch 2 gate is not recorded.

## Gate status: web side PASSES against the real engine locally (see Update 2); official gate still waits for Darren's merge

_The sections below were written when the engine was missing. Update 2 at the end supersedes the BLOCKED answers._

## Original status (before the engine arrived): BLOCKED on Joanne's engine

`git ls-remote origin` lists only `main`, `platform`, and my pushed `experience` (when push is possible). There is no `engine`
branch, so `@afterhours/engine` is still the foundation stub and every task ends `failed / ENGINE_NOT_IMPLEMENTED`. No real
DOCX/PPTX has passed through the system. I did not count a fake engine as passing.

## Files changed this session (owned paths only)

`apps/web/components/task-detail.tsx`, `apps/web/components/task-card.tsx` (timestamp labels, worker badge), `tests/e2e/experience.spec.ts`,
`tests/e2e/helpers.ts`, `tests/e2e/playwright.config.ts`, `scripts/e2e.mjs` (runner reports BLOCKED, exit 3), `docs/ux-handoff.md`,
this report. Earlier commit `31af518` holds the rest of the web app, delivery package, and suite.

## Contract differences and resolution

None. The web app parses every response with `@afterhours/contracts` schemas. Darren's one change that touches the UI path
(demo `receivedAt` is now the fixture value) is displayed truthfully: see timestamp labels below.

## Commands executed (exit codes) — merged baseline, stub engine

| Command | Exit | Result |
|---|---|---|
| `git fetch origin`; `git fetch --depth=100 origin platform`; `git merge FETCH_HEAD` | 0 | merged `b442c71`, no conflicts |
| `pnpm check:ready` | 0 | config, API_PORT matches API_ORIGIN (4000/4000), engine/delivery exports load |
| `pnpm typecheck && pnpm lint && pnpm test && pnpm build` | 0 | 9 test files, **100 tests** pass (includes 26 delivery, 13 platform tests added by Darren); `next build` ok |
| `pnpm test:e2e` | **3 (BLOCKED)** | 13 tests: 5 passed, 8 skipped as BLOCKED (engine stub) |
| `pnpm test:e2e` with local scratch engine (uncommitted, restored afterwards) | 0 | 12 passed, 1 skipped (stub-failure test, not applicable). Not a gate result. |
| Worker-stopped manual run (API :4200, web :3200, no worker, temp DB) | 0 | observations below |

Ports: this machine's 4000 is free, so defaults are used. The e2e runner and the manual run each set `API_PORT` and
`API_ORIGIN` to the same value (4100 / 4200); `pnpm check:ready` agrees.

## Batch 2 quality questions

1. **Base commit and schemas** — **PASS.** Base `5d8f342`, merged platform `b442c71`. `apps/web/lib/api.ts` validates every response with `TaskSummarySchema`, `TaskDetailSchema`, `WorkspaceSettingsSchema`, `IntegrationStatusSchema`, `NotificationRecordSchema`, `SessionStateSchema`, `DemoInjectResultSchema` from `@afterhours/contracts`; no local task shape exists. A schema mismatch yields `BAD_RESPONSE`, not rendering.
2. **Deep link login, no open redirect** — **PASS** (executed). e2e 7: anonymous `/tasks/<id>` → `/login?returnTo=%2Ftasks%2F<id>`; wrong password shows "Incorrect password."; correct login lands back on the task; `returnTo=https://evil.example/` stays on the app origin (`safeReturnTo` rejects absolute, `//`, backslash, control characters); CLI bearer gets 401 on `/api/tasks`; artifact download without a session gets 401. No credential in URLs or bundle (only `NEXT_PUBLIC_APP_NAME` is public).
3. **Real injection, taskId** — **PASS** for creation, **BLOCKED** for completion. e2e 4 and 11 inject through `/api/demo/inject` (real API, CLI token) and read the same task back from `/api/tasks/<id>`; the UI never creates ids. UI path: the "Run demo" menu calls the same endpoint with a client-generated `replayKey` and navigates to the returned `taskId` only after success. Test ids are generated per run in a temp DB and are not retained; no real ready task id exists.
4. **Events behind progress; worker stopped** — **PASS** (manual) / **BLOCKED** (real engine). Progress text and timeline come only from persisted `TaskEvent`s (`intake`, `plan`, … `export`, `notify`); there is no percentage. With no worker process: banner "The worker is not running…", task page heading "Waiting for the worker", queue card "Waiting for the worker to start", badge "Queued (worker offline)" on cards. After starting a worker the banner disappeared and the task became ready (scratch engine). With the stub engine the real events were `intake`, `plan`, `error/plan` and the UI showed the failed state (e2e 0, passing).
5. **Previews from the same content as the files** — **BLOCKED.** The preview renders `TaskDetail.products` (the `WorkProduct` the worker persisted next to the files). e2e 1 compares the preview's proposal title and all five slide titles with the text inside the downloaded DOCX/PPTX; it passed only with the scratch engine, so it is not evidence about Joanne's output.
6. **Two real Office downloads** — **BLOCKED.** e2e 1 downloads through the UI button, then checks ZIP signature, `[Content_Types].xml`, `word/document.xml` text (title and "6,000"), `ppt/presentation.xml`, exactly five `ppt/slides/slideN.xml` parts, and slide titles. The UI also verifies size and SHA-256 against the manifest before saving and shows a visible failure instead of saving an error body. Executed against synthetic ZIPs only; Word/PowerPoint opening is NOT RUN.
7. **Review persistence and stale revision** — **BLOCKED** for the UI flow with real files; **PASS** at API level (Darren's restart test). e2e 1 and 8 cover reload persistence and a forced revision-99 review (UI shows "This task changed. Refresh to review the latest version.", API still `ready`, button disabled until Refresh); both passed with the scratch engine.
8. **Labeling accuracy** — **PASS** where observable. Badges: "Demo email"/"Gmail", "Fixture output"/"Live model", header "Fixture mode"/"Live model not configured"; warnings and assumptions blocks; unread sources flagged "(not read)"; missing evidence "No source reference". Timestamps: "Entered the system" (task.createdAt) versus "Original email received" (email.receivedAt), checked by e2e 11 (passes on the stub baseline, using the API's actual values; fixture date is intentionally old).
9. **Outbox simulated, no network** — **PASS** (unit) / **BLOCKED** (end to end). `packages/delivery/test/delivery.test.ts`: outbox returns `simulated`, `providerMessageId` null, the provider client and `fetch` are never called. UI labels "Simulated (outbox)" and "not sent to any phone or inbox"; never "Delivered" (e2e 6, scratch-engine only).
10. **Notification failure leaves files accessible** — **NOT RUN** as an automated test. By construction the Files section renders from `detail.artifacts` and does not read notification state; preparation and notification states are displayed separately. No failed-notification task was produced.
11. **Desktop/mobile/keyboard** — **PASS** for what ran (scratch-engine tasks, so BLOCKED as gate evidence). Desktop 1440 px and phone 390 px screenshots inspected; e2e 9 asserts no horizontal overflow and ≥ 40 px review button; e2e 12 opens the source dialog from the keyboard, Esc closes it and focus returns to the chip, and "Mark reviewed" works by keyboard. Fixed: callouts that mixed inline text in flex containers rendered as columns. Not done: screen-reader pass, automated a11y scan.
12. **Loading/empty/error/401/404/409/stale-worker states** — **PASS** (implemented; partly executed). Skeletons; empty queue with Gmail-aware text; error panel with retry and a distinct "server not reachable" variant; 401 → login with `returnTo` (e2e 7); 404 → "That task was not found" page (observed manually); 409 → refresh banner (e2e 8, scratch); stale worker banner/wording (manual run above). 429/503 map to plain-language messages (unit-level code path, not exercised in the browser).
13. **Mocks/TODO/nonfunctional buttons in the user path** — **PASS.** None. Everything in the UI is backed by the real API. The only fake in this report is the scratch engine used for local verification; it is not in the repo (restored with `git checkout`). The Twilio adapter is unit-tested with a mocked client and has never sent a real message.
14. **Commands, real worker/engine** — see table. The browser suite used the real API and real worker process every time; the engine was the real stub (honest failure) or the scratch engine (labeled). No fake backend replaced the API.
15. **What blocks the team gate** — Joanne's engine is not on origin (owner: Joanne). Once it is merged: Darren merges, then `pnpm test:e2e` must exit 0 with no BLOCKED tests, and someone opens the downloaded files in Word/PowerPoint. Handoff: run `pnpm install && pnpm test:e2e`; failures name the exact assertion (slide count, title text, numbers).

## Universal quality questions

1. **Proof** — Proven on the merged baseline: login/deep-link/redirect safety, real injection and dedupe, honest failure display, timestamp labels, settings persistence (5 e2e tests). Ready-to-review proof exists only against the uncommitted scratch engine.
2. **Checks** — table above.
3. **Fixture/mock/stub labels** — Engine: stub (shown as a failed task with the code). Generation mode badge shows fixture; ingestion badge shows Demo email. Delivery provider: mocked in unit tests only; outbox is real code.
4. **Contract** — Matches; no amendments. `scripts/e2e.mjs` replacement and `tests/e2e/package.json` are as already communicated.
5. **Safe failure** — Engine missing: failed task, no files, no review, retry offered, API/queue/other tasks unaffected (e2e 0). Worker missing: banner and waiting wording; work resumes on start.
6. **Persistence** — Review state, tasks, events, sessions are server-side; UI keeps no authoritative state. Reload persistence proven with the scratch engine (e2e 1); API restart persistence is Darren's test.
7. **Boundaries** — No secrets in the browser bundle or URLs; temp storage for tests; no live Gmail/Twilio/model calls; scratch engine kept out of git.
8. **Remaining** — BLOCKED: 8 e2e tests and the whole gate on Joanne's engine. NOT RUN: opening files in Word/PowerPoint, failed-notification UI, screen-reader audit, live Gmail/WhatsApp/model.

## Batch 2 quality questions (role) — evidence pointers

Test names: `tests/e2e/experience.spec.ts` tests 0–12. Delivery: `packages/delivery/test/delivery.test.ts`.
Runner: `scripts/e2e.mjs` (temp DB/artifacts, ports 3100/4100, exit 3 = BLOCKED).

## Known limitations

- No real engine output has been seen in the UI (HIGH for the gate; outside my package).
- Content previews are structured, not Office renderings.
- Chart rendering exists already but is a Batch 3 acceptance item; it is untested against real report data.
- Unsaved-changes guard does not intercept the browser back button.

## Required teammate handoff

- Joanne: push `engine`. The UI needs `products` with blocks/slides and `files`; slide titles in the PPTX must equal the preview's slide titles (e2e 1 asserts it).
- Darren: merge `experience` after `engine`; rerun `pnpm test:e2e`; regenerate the lockfile if you rebase.

Suggested integrated gate status: **BLOCKED**.


---

## Update 2 — verified against Joanne's real engine (local integration, not yet merged on origin)

Candidate: local branch `verify-integration` = `experience` + `origin/platform` `aaed3db` + `origin/person-2-engine` `a45bd5a`. Only conflict was `pnpm-lock.yaml`; resolved by taking ours and running `pnpm install` (+26/-1 packages, from the engine's dependencies). Darren should redo the merge on his side and regenerate the lockfile himself. This local branch is not pushed. One test fix is on `experience`: e2e 11 no longer assumes the fixture's `receivedAt` differs from the ingestion day (Joanne's fixture is `2026-10-23T19:00Z`, the same calendar day as this machine's clock). The labels and values are still checked against the API.

| Command | Exit | Result |
|---|---|---|
| `pnpm typecheck && pnpm lint && pnpm test && pnpm build` | 0 | 13 files, **139 tests** pass; `next build` ok |
| `pnpm test:e2e` (real API + real worker + **real engine**, temp DB) | **0** | 12 passed, 1 skipped (stub-failure test, not applicable with a real engine); nothing BLOCKED |
| Real-file run: demo inject proposal and report, download all four files | 0 | below |
| LibreOffice headless `--convert-to pdf` on all four files | 0 | below |

Real tasks (temp DB, `generationMode: fixture`, `ingestionMode: demo`, revision 1, status `ready`):
- proposal task `cb0c5b95-abdb-42a1-892d-54c09b540887`: `Maple-Moss-Launch-Strategy-Proposal-r1.docx` 10191 B; `Maple-Moss-Kickoff-Deck-r1.pptx` 92951 B.
- report task `35295546-e5a4-4a89-aa02-709a710d810b`: `January-February-Sales-Performance-Report-r1.docx` 9833 B; `January-February-Sales-Update-r1.pptx` 109913 B.
- For all four: HTTP 200 with the exact Office MIME type, downloaded size and SHA-256 equal the artifact manifest.
- LibreOffice opened all four: proposal deck 5 pages (slides), proposal 3 pages, report deck 5 slides, report 2 pages. I looked at the rendered proposal deck and first proposal page: readable, teal accent, "USD 6,000" on the fee slide. This shows the files open and lay out sensibly in LibreOffice; it is **not** a check in Microsoft Word or PowerPoint (NOT RUN).

Changed answers to the Batch 2 role questions (all on the local integration candidate above):
- Q3 injection/real task: **PASS** (ids above, and e2e 1/2/6/8/9/12 inject through the API and the engine produces ready tasks).
- Q4 progress/worker stopped: **PASS** (real events from the real engine in e2e 1; worker-stopped behaviour was shown earlier).
- Q5 previews from the same content as the files: **PASS** for the proposal: e2e 1 compares the preview's proposal title and all five slide titles with the text inside the downloaded DOCX/PPTX.
- Q6 two real Office downloads: **PASS** with the checks above (MIME, hash, size, ZIP parts, five slide parts, title and "6,000" text) plus LibreOffice conversion.
- Q7 review persistence and stale 409: **PASS** (e2e 1 reload; e2e 8 forced stale revision; API stays `ready`).
- Q9 outbox: **PASS** end to end (e2e 6 shows "Simulated (outbox)", never Delivered/Accepted).
- Q11 mobile/keyboard: **PASS** on real tasks (e2e 9 and 12).
- Q14 commands/real engine: **PASS**, see table.
- Q10 failed-notification UI: still NOT RUN.
- Q15 remaining: Darren's merge into an integration branch on origin and his own rerun; Word/PowerPoint opening; the report numbers (12,000 / 15,000 / 3,000 / 25%) were asserted by e2e 2 against the real engine and passed.

Suggested integrated gate status for the web side: **PASS on the local candidate**; the official team gate is Darren's to record after he merges `person-2-engine` and `experience`.
