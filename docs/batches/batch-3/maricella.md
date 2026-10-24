# Batch 3 report — Maricella (Person 3, experience)

Batch and owner: Batch 3, Maricella / Person 3 (three-person team; the Eden/QA coordination text in the four-person prompt is superseded, so questions 10 and 11 of that list are marked not applicable).
Branch: `experience-batch3` (pushed to the `maricela24/calhacks-experience` fork; Joanne's repo has no push access from this session).
Base: `experience` `629830b` (Batch 2). Candidate tested locally on `verify-integration` = `experience` + `origin/platform` `aaed3db` (Darren Batch 3) + `origin/person-2-engine` `de6bd40` (Joanne). That merge is a local test branch and is **not** pushed; Darren owns the real integration merge and the lockfile.
Implementation commit: see the last line of this file.
Not started: Batch 4 and 5 work (their prompts were read only).

## Scope implemented (web, tests, docs only)

1. **Clarification form** (`NeedsInputPanel`): questions, reasons and required markers from the API; client validation; server `400` shown as "The server rejected the answers: …"; a `409` shows the refresh banner. The old per-revision remount that could discard text is gone: only what the user typed is held locally (`edits`), retained server answers fill untouched fields, and a banner says when the task moved to a new revision while the form was open. Double submit is blocked with an in-flight guard as well as the disabled button.
2. **Earlier answers stay visible**: "Your answers" in the Plan tab and "Your earlier answers" under the form, with the question text when the plan still carries it, otherwise "Earlier question (<id>)". No new contract field was guessed (see CCR-1 below).
3. **Failed state and retry**: configuration errors link to Settings and say retrying alone will not fix them; non-config failures say whether the error was marked retryable; double-clicking Retry creates exactly one new revision (guard plus server rule); Dismiss works and is terminal.
4. **Charts**: `ChartView` draws only the returned labels/series/unit, with axis ticks, legend (multi-series), and a data table; no fixture numbers exist in renderer code (unit test proves different input gives different output and never leaks other numbers).
5. **Source inspection**: dialog shows source title/type/filename, locator, extraction status and warnings, the exact quote, and whether the quote really occurs in the extracted text; unreadable or unknown sources are flagged; markup is escaped.
6. **Layout defect found and fixed by a new test**: very long titles/filenames/text/tables stretched the task page past a 390 px viewport because flex/grid children kept `min-width:auto`. Fixed in `globals.css`.
7. **Runner**: `scripts/e2e.mjs` now also starts a second isolated stack (127.0.0.1:3101/4101) whose live model has no credentials, so the real `MODEL_NOT_CONFIGURED` failure, retry and dismiss paths are exercised in a browser. Its dev server uses its own build directory (`apps/web/.next-e2e-fail`, git-ignored via `apps/web/.gitignore`; `next.config.mjs` reads `NEXT_DIST_DIR`). `apps/web/tsconfig.json` now uses `jsx: react-jsx` so the web unit tests can compile components.

Files: `apps/web/{app/globals.css,components/{review-panels,task-detail}.tsx,components/preview/*.tsx,next.config.mjs,tsconfig.json,.gitignore,test/render.test.ts}`, `tests/e2e/{experience.spec.ts,failed-state.spec.ts,helpers.ts}`, `scripts/e2e.mjs`, docs.

## CCR-1 (optional `TaskDetail.answerHistory`) — Maricella's answer

**Yes, approve it** as proposed (additive, optional, `{ revision, questionId, question, answer, createdAt }[]`). It would let the UI show "what was asked" next to each earlier answer for every round. Until Darren merges it into `packages/contracts`, the UI does **not** read it (the shared Zod schema would strip it anyway) and uses the workaround above. When merged, the only UI change is in `EarlierAnswers`.

## Commands executed (exit codes) — candidate `verify-integration`

| Command | Exit | Result |
|---|---|---|
| `pnpm typecheck && pnpm lint && pnpm test && pnpm build` | 0 | 14 test files, **152 tests** pass (13 are new web render tests); `next build` ok |
| `pnpm test:e2e` (real API + worker + **real engine**, temp DBs; plus the unconfigured-model stack) | **3 (BLOCKED, by design)** | 20 tests: **18 passed**, 2 skipped. Skipped: test 0 (stub-failure check, not applicable because the engine is real) and test 16 (real evidence quote, BLOCKED: engine returns `quote: null`). Earlier same-candidate run before test 16 was marked BLOCKED: exit 0, 18 passed, 2 skipped |

The e2e runner exits 3 whenever a test is skipped as BLOCKED, so this candidate does not report a clean pass for the whole suite.

## Role quality questions

1. **Real clarification resumes with a new revision and real files — PASS.** e2e 3: inject `ambiguous` → `needs_input` → validation blocks empty required fields → fill → submit → "Revision 2" → `ready` with files; API says revision 2. Real API, worker and engine.
2. **Required/empty/duplicate/stale answers give the right outcome — PASS.** Empty required: client message and API revision stays 1 (e2e 3). Stale: e2e 13 rewrites the revision to 99, UI shows "This task changed. Refresh…", API still `needs_input` revision 1, typed text kept, form blocked until Refresh. Server validation: e2e 14 sends an unknown question id, UI shows "The server rejected the answers: …", no revision created, text kept. Duplicate submit: in-flight guard plus Darren's concurrency tests; browser double-click verified for retry (e2e 17).
3. **Which states allow review/retry/dismiss — PASS.** Mark reviewed only when `ready` (absent on skipped, failed, needs_input: e2e 5, 17); Retry only on `failed` (e2e 17); Dismiss on needs_input/failed/skipped/ready; approved/dismissed show no actions (e2e 1, 18). Controls are absent, not just disabled. The matrix against the API is Darren's `apps/api/test/batch3.test.ts`.
4. **Charts and tables use exact returned data and update on changed input — PASS.** `apps/web/test/render.test.ts`: values 12,000/15,000 vs 8,000/9,500 render different output and the other numbers never leak. e2e 2 on the real report: preview, chart `aria-label`, data table, DOCX text, deck text (25%) and the deck's native chart XML (`12000`, `15000`) agree. Note: Joanne's current fixtures describe a Website/Partnerships report whose total revenue is 12,000 to 15,000 and orders are 120 to 150.
5. **Inspect real source quotes and warnings without raw HTML or private paths — PARTIAL / BLOCKED on the engine.** UI paths are unit-tested (quote shown, "appears in the extracted source text", missing/wrong quote, unreadable source, escaped markup). But the real engine returned 22 evidence references in the proposal and report and **all have `quote: null`**, so the dialog says "No excerpt was recorded". e2e 16 (real quote versus source text, on a phone) is therefore BLOCKED. Owner: Joanne. No filesystem paths appear in any DTO (Darren's leak scan).
6. **Skipped/failed/needs_input/notification-failed tasks understandable after refresh — PASS.** e2e 5 (skipped), 17 (failed, after retry; reload on dismissed in 18), 3/13/14 (needs_input), 15 (blocked notification: files, review and download still work).
7. **Four-scenario browser checks on the real worker — PASS.** proposal e2e 1, report e2e 2, ambiguous e2e 3, no_action e2e 5, duplicate `replayKey` e2e 4, stale review e2e 8, downloads e2e 1/2/15. Task ids are generated per run in temp databases and are not retained; none are quoted.
8. **Desktop/mobile/keyboard defects found and fixed — PASS for what ran.** Found and fixed: page overflow from long content (e2e 19, was FAIL, now PASS); callout layout (earlier). Passing: phone viewport (e2e 9, 16, 19), keyboard source dialog and review (e2e 12). Still not done: screen-reader pass, automated accessibility scan, real Microsoft Office rendering.
9. **Time labels — PASS.** "Entered the system" (`task.createdAt`) and "Original email received" (`email.receivedAt`) are separate in the header and Request tab (e2e 11, checked against API values).
10. Eden verification: not applicable (team is three people).
11. Eden defect reports: not applicable.
12. **Changed returned data renders new numbers; polling and conflicts keep unsent input — PASS.** Render unit test for changed data; e2e 13/14 keep typed text across a 409 and a 400, and the form no longer remounts when the revision changes.

## Universal quality questions

1. **Input/output and commit** — e.g. ambiguous task → answers → revision 2 `ready`, run on the local candidate above. Not a pushed integration commit.
2. **Checks** — table above and the final run block.
3. **Modes** — intake `demo` (injected through the real endpoint), intelligence `fixture` (Joanne's real engine in fixture mode), delivery outbox/simulated; the second stack uses the real live-mode configuration check with no key (fails by design). No live model, Gmail or WhatsApp was used.
4. **Contract** — no change; CCR-1 answered, not implemented.
5. **Safe failure** — missing model credentials: failed task, Settings link, no files, retry creates one revision (e2e 17). Blocked notification: work stays reviewable (e2e 15). Server 400/409 on answers: no write, input kept (e2e 13/14).
6. **Persistence** — review, revision and answers are server-side; reload after review and dismiss verified (e2e 1, 18).
7. **Boundaries** — fictional data only; temp storage; no credentials; the only mutation of settings in tests (channel to whatsapp) is restored to outbox in a `finally`, and that stack has no provider credentials so nothing is sent.
8. **Remaining** — BLOCKED: real evidence quotes (Joanne). NOT RUN: Word/PowerPoint rendering, screen reader, live providers. Darren must merge engine + experience and regenerate the lockfile.

## Findings for teammates

- **Joanne (engine)**: all evidence `quote` fields are null in real proposal and report products; the contract and the spec ask for exact short excerpts when available. Product titles also include the user's answer text verbatim after clarification ("Proposal: Answer 1: Maple & Moss needs a brand refresh…"); probably unintended.
- **Darren**: `apps/web/tsconfig.json` is now `react-jsx`; `next.config.mjs` honours `NEXT_DIST_DIR`; `scripts/e2e.mjs` starts a second stack on 3101/4101 (override with `E2E_FAIL_WEB_PORT`/`E2E_FAIL_API_PORT`). Lockfile unchanged this batch.

## Known limitations

- Quotes: see above. Unsaved-changes guard does not intercept the browser Back button.
- E2E 16 and the stub-failure test 0 are skipped by design on this candidate; the runner exits 3 when a skip is marked BLOCKED.
