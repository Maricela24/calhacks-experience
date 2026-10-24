# Batch 6 — final engine and artifact audit (Joanne)

## Baseline, candidate, scope

- Branch `engine-batch6` from `engine-batch5` @ `0bf8819`. Engine fixes: `4f660d2` (P1 rounding), `6dde883` (P2 wording). Docs: the commit containing this file.
- Audited stack: an audit-only, uncommitted local merge of `platform-batch5` @ `d11127b` + `engine-batch6` @ `6dde883`. There is no official candidate, integration branch, or experience branch on the remote.
- Owned paths only: `packages/engine/**`, `docs/release/artifact-audit.md`, `docs/engine-*.md`, and this report. No contract, migration, route, root dependency, or lockfile change.
- Full evidence: `docs/release/artifact-audit.md`.

## Commands

| Command | Where | Exit / result |
|---|---|---|
| `corepack pnpm vitest run packages/engine` | engine-batch6 | 0; 46 tests (15 Batch 2 + 28 Batch 5 + 3 Batch 6) |
| `corepack pnpm --filter @afterhours/engine typecheck`, `eslint packages/engine` | engine-batch6 | 0, 0 |
| `corepack pnpm install --frozen-lockfile` | merged audit tree | 0 |
| `corepack pnpm check:ready` / `typecheck` / `lint` / `test` / `build` | merged audit tree | 0 / 0 / 0 / 0 (23 files, 263 tests) / 0 |
| `corepack pnpm check:ready` / `typecheck` / `lint` / `test` / `build` | engine-batch6 checkout @ `6dde883` (Batch 2 platform base) | 0 / 0 / 0 / 0 (11 files, 120 tests) / 0 |
| real API + worker processes, API audit driver (login, inject, answers, review, detail, downloads) | merged audit tree, port 4617, scratch DB | all scenarios as recorded in the audit |
| PowerPoint PDF export + PDFKit rasterize; Quick Look DOCX page 1 | downloaded files | 5 pages per deck; DOCX page 1 readable |

Root `typecheck`/`build` call bare `pnpm`. As in Batch 5, Corepack's pnpm 10.33.4 shim was placed on PATH from a temporary directory.

## Role-specific questions

1. **Final task/revision/artifacts audited; do they belong to the candidate?** PASS for the audit merge (`d11127b` + `6dde883`). Six artifacts across proposal r1, report r1 and Northstar r2 are listed with IDs and hashes in the audit. BLOCKED as release evidence until Darren records an official candidate that contains `6dde883`.
2. **Fee/dates/scope and report metrics consistent across preview, document and deck?** PASS. Every preview string is found in the DOCX (51/51, 40/40, 34/34). The canonical facts table matches in both files. Chart XML values `12000`/`15000` match the calculation.
3. **Citations valid; assumptions and limitations visible?** PASS. All 48 citations point to existing, completely read sources, and all 36 quotes match the normalized source text. Basis lines, RECOMMENDATION tags, the assumption block, limitations and source notes are present in the downloaded files. Caveat: one citation per block does not prove every sentence in that block.
4. **Changed input changes results; unknown/conflict blocks?** PASS. Spec variation → $16,000 / $4,000 / 33.3% / $106.67, with stale values absent. A 60-input sweep all reach ready. The 10 Batch 5 conflict cases still produce questions.
5. **Final files opened/rendered; remaining problems; unverified?** PowerPoint: proposal, report and Northstar decks; no clipping. Word: NOT RUN (automation -1708). DOCX was rendered only by Quick Look, page 1. Remaining P2: the Northstar deck is sparse (one answered scope line appears on two slides; truthful, not padded); fonts are named, not embedded.
6. **Fixture distinct from live; can failure masquerade as live?** Every audited task is `generationMode: fixture`. Live mode was never called (no key). Unit tests show missing configuration fails before progress, with no fixture fallback, and invalid or repaired output fails with a typed error.
7. **Justified claims:** see "Proof points". There is no accuracy, speed, or cost evidence.
8. **Engine defect that could interrupt the demo; tested fallback?** B6-E1 would have failed any report whose growth is not a one-decimal value. It is fixed and covered by the sweep. No known engine P0/P1 remains on the audited flows. If a live model misbehaves, there is no automatic fallback to fixtures (by design); the tested, disclosed fallback for the demo is a fixture-mode task. Live mode is unverified.
9. **Actual vs incomplete capability; prerequisite finished first?** Actual: fixture proposal/report/clarification/no-action through the real worker, with real DOCX/PPTX output. Incomplete: live provider call (no key); PDF/DOCX/XLSX input. Before any polish I fixed the P1 rounding defect that broke the report on changed data.
10. **Fixture proposal rerun now: fee/scope/deadline/engagement consistent and grounded?** PASS. USD 6,000 is quoted from the brief and company profile. The draft deadline, Monday October 26, 2026 9:00 AM PDT, is resolved from `email.receivedAt` in America/Los_Angeles and is distinct from "Starts October 26, 2026; 4 calendar weeks". Scope comes from the standard package the brief invokes.
11. **Exact changed-input proof:** test `batch6.test.ts › recomputes the spec variation`. It asserts metrics `[1600000, 400000, 33.33, 150, 10667]`, product text containing $16,000/$4,000/33.3%/$106.67, chart series `[12000, 16000]`, PPTX chart XML `<c:v>16000</c:v>`, and slide 2 "Revenue increased 33.3%".
12. **Downloads match manifest, revision and preview?** PASS. Six of six: HTTP 200, MIME, disposition, size and SHA-256 equal the manifest; revision matches; productId maps to a preview product. Unauthenticated → 401.
13. **Protections still passing on the candidate:**
    - Source checks, unknowns and unsupported inputs: PASS.
    - Repair re-validation, cancellation, timeouts, error mapping, stable IDs, injection-as-data: PASS (unit).
    - All of these are among the 263 tests on the merged tree.
    - Live failure against a real provider: NOT RUN.
14. **Proof points supplied; unsupported claims excluded:** see below.
15. **Limitation that could interrupt judging; fallback tried; unverified:**
    - Word page rendering: unverified.
    - Live model: unverified.
    - The PowerPoint-rendered decks are the verified visual artifacts.
    - Fallback actually tried: fixture-mode tasks through the real API and worker (this audit).

## Universal questions

1. **Candidate and input/output:** the audit merge `d11127b` + `6dde883`, with the task and artifact IDs listed in the audit.
2. **Commands and results:** the table above. Every listed command exited 0.
3. **Modes:**
   - Demo ingestion, fixture intelligence, outbox notifications (`simulated`).
   - Live model and Gmail: NOT RUN.
   - Mocks were used only in unit tests.
4. **Contracts:** unchanged; `runWork` unchanged; `createEngine` remains the additive test factory.
5. **Safe failure:**
   - Unknown, conflicting or unsupported input → `needs_input` or a typed error.
   - Cancellation → no ready result.
   - Stale answers → 409 (platform).
   - Restart behavior is Darren's evidence, not re-run here.
6. **Persistence and integrity:**
   - Manifest equals the downloaded hashes.
   - Answers are stored as revision-2 sources.
   - Approval persisted (`approved`).
   - Verified through the API, not by reading the DB.
7. **Boundaries:**
   - Fictional data only.
   - The app password was read from the scratch `.env` by the driver and never printed.
   - No external sends or paid calls.
   - Cleanup touched only the scratch worktree and processes I started.
8. **Remaining:**
   - Official candidate: Darren.
   - Browser/UI: Maricella, BLOCKED (no experience branch).
   - Word render: Joanne/teammate, NOT RUN.
   - Live model smoke: BLOCKED on a key.
   - These limit release claims; they are not engine code failures.

## Proof points for Maricella (verified, fixture mode)

1. **Grounded fee and dates.** From an email plus brief, the proposal and deck both state "Strategy fee: USD 6,000", quoted from the brief and the company profile. The draft deadline (Mon Oct 26, 2026, 9:00 AM PDT) is kept separate from the engagement start ("Starts October 26, 2026; 4 calendar weeks").
2. **Arithmetic is code, not text.** The sales CSV gives $12,000 → $15,000, +$3,000, +25%, 120 → 150 orders, $100 AOV. Change February Website to 11,000 and the report, the native chart and the deck all become $16,000, +$4,000, 33.3%.
3. **Asks instead of inventing.** "Prepare the proposal" with no details gets 4 specific questions (client, scope, fee, schedule). The answers create revision 2 with editable Northstar Co. DOCX/PPTX, and conflicting fees in the sources produce a question instead of a file.

Say "real editable .docx and .pptx files, opened in PowerPoint". Do **not** say: live AI generated it (fixture mode), it works for any request, accuracy, time saved, Word-verified layout, it sends the proposal, or that it reads PDFs.

## Handoff

- **Darren:** use `engine-batch6` @ `6dde883` (or later) in the release candidate; `de6bd40` lacks the Batch 5/6 fixes. The merge with `platform-batch5` is clean with no lockfile change; 263 tests pass on the merged tree. Please record it in `docs/release/candidate.md` and the capability matrix (engine rows in the artifact audit).
- **Maricella:** proof points above. The content preview should render the same `WorkProduct`s, which now include basis tags.
- **Open:** Word page check of the three DOCX files; one deliberate live OpenAI smoke when a key exists.
