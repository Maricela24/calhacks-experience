# Batch 5 — engine hardening (Joanne)

## Baseline, candidate, scope

- Branch: `engine-batch5`, created from `person-2-engine` at `de6bd40` (Batch 2 engine + Batch 2 platform `b442c71`). **Batch 3/4 platform work (`platform` `aaed3db`, `platform-batch4` `700d7a6`) was not merged**, as instructed.
- Candidate: the `engine-batch5` commit that contains this report.
- Owned paths changed: `packages/engine/**`, `fixtures/synthetic/**`, `docs/engine-handoff.md`, `docs/engine-evaluation.md`, and this report. No changes to contracts, migrations, API routes, root dependencies, or the lockfile.
- DEF-1 (artifact IDs containing `/`, found by QA on the older engine commit `258e2eb`) is already fixed on this base by `f5e7837` (`stableId` uses only `[A-Za-z0-9._-]`). This is re-asserted by a Batch 5 test. It has not been re-run against `platform-batch4`.

## What changed

| Area | Change |
|---|---|
| Cancellation | `withTimeout` gives each model call a child signal that aborts on parent abort or the per-call deadline, and settles at the deadline even if the client ignores the signal. The timer and both abort listeners are always released. Progress is never emitted after abort. Abort is checked after export and before returning `ready`. |
| Budgets | `CallBudget` counts every logical call, repairs included: at most 3 per attempt, 60 s each, 12,000 output tokens. The current pipeline uses at most 2 (generate + one repair); the third slot is unused. Calls go through raw `fetch` with no SDK, so there are **0 SDK retries**. The worker's `MAX_ATTEMPTS = 2` with a 30 s delay gives at most 4 provider requests per revision. Actual token usage and duration are reported in progress messages when the provider returns them. |
| Provider boundary | `ModelClient` interface; `createOpenAIClient` (injectable `fetch`); `openAIClientFromEnv` resolves configuration **before any progress or work** and never falls back to fixtures. `createEngine({ modelClient, limits, clock })` is exported as the test factory; `runWork` is unchanged. |
| Error mapping | 401/403 → `MODEL_AUTHENTICATION` (permanent); 400/404/other 4xx → `MODEL_REQUEST_REJECTED` (permanent); 408 → `MODEL_TIMEOUT` (retryable); 429 → `MODEL_RATE_LIMIT` (retryable); 5xx → `MODEL_PROVIDER` (retryable); network failure → `MODEL_NETWORK` (retryable, raw error text dropped); unreadable body → `MODEL_INVALID_OUTPUT` (permanent). Provider bodies and keys are never copied into messages. Fixes an old bug where a body-read failure escaped untyped and became `ENGINE_UNEXPECTED_ERROR`. |
| Live validation and repair | One repair, counted in the budget. Original and repaired output go through the **same** checks: JSON, schema, a product-kind match, slide count, evidence/quote match, money/percentage/date support, calculated-number support, and layout budgets. The model never chooses product/slide/block IDs or `dueAt`; code assigns them. |
| Grounding | Now returns all issues (used to build the repair request). New checks: amounts and percentages must appear in a source (or in calculated metrics); proposal month/day dates must appear in a source or be the resolved deadline; every number in report content and chart values must be a calculated metric or a source value; quotes are capped at 300 characters; `source`/`calculated` blocks need evidence; charts must be `calculated`. |
| Commitments | Proposal facts are derived with exact quotes. Specific questions are asked for: conflicting or missing client; client name over 80 characters; conflicting, missing or mixed-currency fee; conflicting duration; conflicting start date; conflicting or past draft deadline; missing scope. A brief that itemizes its own deliverables now wins over the company's standard package (fixed bug). Clarification answers that are too long, or a fee answer without amount+currency, are asked again instead of being used. Instruction-like text in sources adds a warning and changes nothing. |
| Calculations | `revenue_usd` accepts cents. A `currency` column with mixed/non-USD values → `UNSUPPORTED_INPUT` (never summed). Adds `orderChange`, per-channel share and growth. Report wording is derived from the numbers: increase/decrease/unchanged, AOV same/changed, tied largest channel, month names. **Fixed:** the old deck hardcoded "Revenue grew 25%", "Both channels increased by 25%" and "AOV … in both months", which would have been false for any changed CSV. |
| DOCX | Header (organization + title), "Review draft · Page X of Y" footer. Headings use keep-with-next. Fixed-layout full-width tables with column widths sized to content, a repeating header row, and rows that can't split across pages. Every block shows a visible basis line (Source / Calculated / Recommendation / Assumptions). Chart data table uses formatted units. Source notes list the exact quotes and locators used. All text runs through an XML-safe sanitizer. |
| PPTX | Deterministic text budgets (`layout.ts`) shared by the verifier and the renderer. Fonts step down only to a 14 pt floor (24 pt titles, 28 pt cover); no `fit: "shrink"`. Content that still doesn't fit is reported as a `LAYOUT_BUDGET` issue (repairable in live mode) instead of being shrunk or clipped. Native editable tables and charts; a single-series chart uses one color; `$#,##0` or `$#,##0.00` labels; an axis title for the unit. RECOMMENDATION/ASSUMPTION tags and a per-slide basis line. All text sanitized. |
| Synthetic set | `fixtures/synthetic/*` plus `packages/engine/test/synthetic.ts`: long client/brief, hostile brief (markup characters, emoji, RTL, injection, control characters in email), changed CSV with cents and a decrease, 8-channel CSV, and 10 rejection cases. `test/render-samples.ts` writes current outputs to ignored `var/engine-samples`. |

## Commands and results

All runs used `corepack pnpm` (pnpm 10.33.4). Root `typecheck`/`build` invoke bare `pnpm`, which is not on this machine's PATH. For those, Corepack's shim was installed into a temporary directory and put first on PATH: `corepack enable --install-directory /private/tmp/.../corepack-bin pnpm`. No global change was made.

| Command | Baseline `de6bd40` | Candidate |
|---|---|---|
| `corepack pnpm install --frozen-lockfile` | exit 0 | (no dependency change) |
| `corepack pnpm setup:local` | exit 0 (created ignored `.env`, `var/`) | — |
| `corepack pnpm check:ready` | exit 0 | exit 0 |
| `corepack pnpm typecheck` | exit 0 | exit 0 |
| `corepack pnpm lint` | exit 0 | exit 0 (after removing 2 unused declarations) |
| `corepack pnpm test` | exit 0, 9 files / 89 tests | exit 0, 10 files / 117 tests |
| `corepack pnpm build` | exit 0 | exit 0 |
| `corepack pnpm vitest run packages/engine` | 15 tests | 43 tests passed |
| `corepack pnpm exec tsx packages/engine/test/render-samples.ts` | — | exit 0, 12 files (6 ready cases) |
| API + worker as separate processes, `demo:proposal`, `demo:report` | — | both `ready`; see below |

Separate-process run (fixture mode, local `var/` DB):

| Task (fictional) | Outcome | Engine time | Artifacts persisted (bytes, sha256 prefix) | Notification |
|---|---|---|---|---|
| proposal `be0759da-1ed3-4377-9d74-7c375dc8d60c` r1 | ready | 63 ms | `Maple-Moss-Proposal-r1.docx` 11,923 `61c08121c8bd1ab1`; `Maple-Moss-Kickoff-Deck-r1.pptx` 101,280 `a66b9d9879fc9ee6` | `simulated` (outbox) |
| report `37ef8218-bcb6-44da-8ba2-f43c7f26d1bf` r1 | ready | 45 ms | `January-February-2026-Sales-Performance-Report-r1.docx` 11,488 `ed184ebd070b05f8`; `January-February-2026-Sales-Update-r1.pptx` 119,924 `8da65464d2050d23` | `simulated` (outbox) |

Only the two processes started for this check were stopped.

## Rendering evidence

| Renderer | Files | Result |
|---|---|---|
| **Microsoft PowerPoint 16.x** (AppleScript `save as PDF`), pages rasterized with macOS PDFKit | All 6 decks: proposal, report, long-proposal, hostile-proposal, changed-report, many-channel-report | Each exported exactly 5 pages. Every slide visually inspected. No clipping or overlap; the long client title wraps to two lines on the cover; dense objectives step down to readable size. |
| Microsoft Word 16.71 | All 6 DOCX files | Word opened all six (listed as open documents), but every scripted `save as` failed with AppleEvent -1708, so **Word page rendering is NOT RUN**. |
| macOS Quick Look (Apple converter, not Word) | All 6 DOCX, page 1 only | Headings, basis notes, tables, header and disclaimer render readably. Quick Look substitutes a serif font and auto-fits table widths, so it is not evidence of Word layout. |

Defects found in the real renders and fixed (then re-rendered and re-inspected in PowerPoint):

1. The scope list split "audience and message strategy" into two items.
2. Two-item lists read "ad spend, and ongoing campaign management".
3. Slide 2 was titled "Goals and constraints" but showed no constraint. A constraints column was added; the lowercase start after the label is now capitalized.
4. The schedule read "October 26, 2026 (4 calendar weeks)"; it now reads "Starts October 26, 2026; 4 calendar weeks".
5. A single-series chart colored each bar differently.
6. Chart labels rounded cents (`$12,000.50` → `$12,001`).
7. Channel names were lowercased in the report subtitle.
8. A tied "largest" channel was presented as the single largest.
9. The 8-channel deck silently showed 6 rows; the heading now says "largest six; all in the report".
10. Earlier, the verifier's layout check caught that the content-slide title box fit only one line at 24 pt; it was resized and the cover slide given its own budget.

Not a defect: this Mac's locale is `en_ID`, so PowerPoint displays `$#,##0` as `$15.000`. The file stores the standard format code, which a US-locale viewer shows as `$15,000`.

## Role-specific questions

1. **Cancellation/timeout/repair tests; any unbounded work?** PASS (unit, injected clients).
   - Tests cover: abort during progress (stops, no later progress); abort after export (no `ready`); parent abort inside an in-flight cooperative call (signal aborted, `ENGINE_ABORTED`); per-call timeout (`MODEL_TIMEOUT`, signal aborted); a noncooperative client (settles in under 150 ms against a 200 ms client); timer and listener cleanup over 5 runs (0 timers, add = remove); repair-once; no third call; budget of 1 means no repair.
   - Remaining unbounded work: a noncooperative client's promise keeps running after the timeout (detached, not stopped), and the provider may still bill an accepted request. Synchronous export is not preemptible; it is bounded by content budgets (see Q10).
2. **Retryable vs permanent; aligned with queue policy?** PASS (unit).
   - Retryable: `ENGINE_ABORTED`, `MODEL_TIMEOUT`, `MODEL_NETWORK`, `MODEL_RATE_LIMIT`, 5xx `MODEL_PROVIDER`.
   - Permanent: configuration, authentication, request rejected, invalid/ungrounded/unsupported output or number, layout budget, invalid input/CSV, unsupported input, export failure.
   - The worker retries a retryable code once after 30 s within the same revision (`MAX_ATTEMPTS = 2`). It ignores the engine error on deadline, lease loss or shutdown and records its own `ENGINE_TIMEOUT` or release. Not re-run against `platform-batch4`.
3. **Fee/date/scope/currency conflicts tested; resulting questions?** PASS (fixture). Ten synthetic rejection cases, each with an asserted question ID or code:
   - `proposal_fee_conflict`: injected "USD 1" amount, EUR-vs-USD fee, missing fee.
   - `proposal_schedule_conflict`: four vs six weeks.
   - `proposal_start_conflict`.
   - `proposal_deadline_conflict`.
   - `proposal_deadline_past`.
   - `proposal_client_conflict`.
   - `proposal_scope_missing`.
   - `UNSUPPORTED_INPUT`: mixed CSV currency.
   - Plus an unusable fee answer, which is re-asked with the reason "amount with a currency".
4. **Real Office artifacts opened; defects fixed; unverified?** All 6 decks rendered and inspected in Microsoft PowerPoint: PASS. Ten defects fixed (listed above). Word page rendering: NOT RUN (automation -1708). DOCX page 1 in Quick Look only.
5. **Long text/tables/chart labels readable?** PASS for the synthetic set in PowerPoint:
   - A 73-character client name wraps to two lines on the cover.
   - Six dense objectives fit above 14 pt.
   - The 8-channel table shows six rows with an honest heading.
   - Cents labels display correctly.
   - Content beyond the budget is rejected by a test rather than shrunk.
6. **What stops invalid or repaired content bypassing checks?** PASS (unit). The repaired output goes through the same `evaluate` → `productIssues` path as the original, and the pipeline re-runs `verifyProducts` before export. Tests show a repaired response with a fabricated USD 9,999, an invented 40% quote, or a "30%" slide title is rejected (`MODEL_INVALID_OUTPUT`, permanent). A fabricated report chart value is also rejected.
7. **IDs deterministic through retries, distinct across revisions?** PASS (unit, live mode with hostile model IDs). Product, slide, block and file IDs are equal across two runs of r1, different for r2, and match `^[A-Za-z0-9._-]+$`. A model-supplied `../../etc/passwd` product ID and a fake `dueAt` are discarded.
8. **Supported modes and inputs the demo can honestly claim:**
   - Fixture mode: proposal and report (DOCX + 5-slide PPTX), ambiguous → questions → resume, no-action skip.
   - Inputs: TXT/MD/CSV.
   - Live OpenAI: implemented and unit-tested with injected clients only. **No live call has been made** (no key): NOT RUN.
   - Not implemented: PDF/DOCX/XLSX inputs, OCR, Anthropic.
9. **Does the SDK cancel on AbortSignal?** There is no SDK; raw `fetch` receives the child signal (asserted with an injected fetch), and Node's fetch aborts the request and body read on abort. That behavior was not exercised against the real OpenAI endpoint (NOT RUN). After a timeout against a noncooperative client, that client's work continues detached; the provider may still bill an accepted request.
10. **Timer/listener cleanup and bounded sync behavior tested without blocking heartbeat?** PASS. Cleanup is asserted with fake timers and listener spies. Four synthetic exports took 130 ms in total, with a **maximum event-loop delay of 14.7 ms** (`monitorEventLoopDelay`, 10 ms resolution, this machine). The worker heartbeats every 15 s against a 90 s lease. No worker-thread boundary was added because no measured need exists.
11. **Can a repaired/late result bypass verification or return ready after cancellation?** No. Repairs re-validate (Q6). `emit` checks abort before and after each callback, and `execute` checks abort after export and before return. Both are tested. The worker additionally fences the commit by owner token.
12. **Do exports match source fee/date/scope/numbers under changed and conflicting input?** PASS.
    - Changed CSV: "Revenue decreased 12.5%" and `$12,000.50`, with no stale `$15,000`, `25%`, `66.7%` or "January" (tested).
    - Long brief: USD 14,500, six weeks, November 2 and the brief's own six deliverables (rendered).
    - Conflicts produce questions (Q3).
13. **Which current files were inspected by a real renderer vs structurally?**
    - Real renderer: the 6 decks listed in the table above, in Microsoft PowerPoint.
    - Structural only: the 6 DOCX files (ZIP/XML assertions, Quick Look page 1).
    - Sample sha256 values are printed by `render-samples.ts`. They change per run because the Office packages embed timestamps.
14. **ID/file mapping handoff for Darren's immutable publication.** `file.id = stableId(taskId, revision, productId, format)`. `productId = stableId(taskId, revision, kind, slot)`. Filenames are `<safe-title>-r<revision>.<ext>`. These are stable within a revision and distinct across revisions. **Bytes are not stable** across reruns (Office timestamps; live output varies), so a stale attempt must never overwrite a published file with the same ID. Publication must stay fenced by owner token and be immutable.
15. **Unsupported inputs, unfinished integrations, and claims to limit:**
    - No live model call yet.
    - No Word page render.
    - Browser preview/download/review gate still BLOCKED on the missing experience branch.
    - Batch 3/4 platform not merged here.
    - PDF/DOCX/XLSX extraction and OCR not implemented.
    - Do not claim "renders perfectly in Office", "live AI verified", or "production-ready".

## Universal questions

1. **Input/output and candidate:**
   - Fixture proposal/report plus 4 synthetic ready inputs and 10 rejection inputs.
   - 12 generated files.
   - Two separate-process tasks with the IDs above.
   - Candidate: the `engine-batch5` commit containing this report.
2. **Checks and exit codes:** see the commands table. Every listed command exited 0 on the candidate.
3. **Modes and labels:**
   - All generation was in fixture mode. Live mode was only exercised with injected test clients, never a real provider.
   - Notifications were outbox `simulated`. Labels in the outputs are truthful: the visible "review draft" text and basis tags.
4. **Contract and policy:** No contract changes. `runWork` signature unchanged; `createEngine` is additive. Retry semantics match the worker's 2-attempt / 30 s policy.
5. **Safe failure:**
   - Missing or invalid inputs → typed permanent errors or `needs_input`.
   - Timeouts and transient provider errors → retryable codes.
   - Cancellation → no progress and no `ready`.
   - Layout overflow → issue/repair, never a clipped file.
6. **Persistence:** The engine persists nothing. Platform persistence of 4 artifacts and 2 notifications was observed in the local SQLite through the separate-process run (read-only query).
7. **Boundaries:**
   - No secrets, `.env`, DB, or generated files are committed.
   - The hostile fixture is fictional (`attacker@example.com`); its text never reaches the outputs, and a warning is raised.
   - Office automation only opened and exported local synthetic files.
   - No external messages, and no paid calls.
8. **Remaining items:**
   - Word page rendering: NOT RUN (Joanne; a teammate can open the samples in Word).
   - Live OpenAI smoke: BLOCKED on a key (Joanne/Darren).
   - Combined Batch 2/5 browser gate: BLOCKED on Maricella's experience branch.
   - Integration with `platform-batch4`: Darren.
   - These block the combined gate, not the engine module.

## Next handoff

- **Darren:**
  - Merge `engine-batch5` into the integration candidate built on `platform-batch4`.
  - For drills, use `createEngine({ modelClient, limits })` with a scripted `ModelClient`: hang until abort for lease-loss/deadline tests, a failing client for transient-retry tests, and malformed JSON for permanent failure. See `packages/engine/test/batch5.test.ts`.
  - Expect at most 2 provider requests per attempt.
- **Maricella:**
  - Products now include visible basis tags.
  - The report's chart/table headings and many-channel note are worth mirroring in the Content preview.
  - New warning strings may appear: instruction-like text, fee currency.
- **Joanne (human):** Open `var/engine-samples/*.docx` in Word once and record page count and appearance; then run one deliberate live OpenAI smoke on a designated key.
