# Batch 2 report — Joanne (Person 2, engine)

Batch and owner: Batch 2, Joanne / Person 2.  
Branch: `person-2-engine`.  
Base/foundation commit: `5d8f342`.  
Platform foundation merged: `origin/platform` at `b442c71` by merge commit `4dcb95a`; existing engine work was preserved.  
Engine commits: `258e2eb` (initial implementation), `5b45e95` (source-derived facts and timestamp handling), `f5e7837` (real worker integration and safe artifact IDs).  
Working-tree status when checks completed: clean except for this report, which is committed separately.

## Scope and files

The engine accepts the canonical `EngineInput` through `runWork(input, { signal, onProgress })`, normalizes the real email, attachments, organization profile, and answers into `SourceDocument` records, and returns contract-validated `EngineResult` values. Fixture proposal work creates a substantive proposal DOCX and exactly five-slide PPTX from one shared pair of `WorkProduct` objects; report, ambiguity, no-action, deterministic calculations, and fail-closed live mode are also implemented.

Primary files are `packages/engine/src/**`, `packages/engine/test/engine.test.ts`, `fixtures/scenarios/**`, `fixtures/attachments/**`, `fixtures/organization/**`, `docs/engine-handoff.md`, and `docs/engine-evaluation.md`. `apps/worker/test/worker.test.ts` now exercises the real engine rather than the removed foundation stub.

Public exports remain `runWork`, `EngineError`, canonical engine types, `calculateSales`, and `resolveDeadline`. No shared contract schema changed. The platform handoff rule is implemented: deadlines use `email.receivedAt` plus `organization.timezone`; `input.now`/task ingestion time is not used for relative email dates.

## Commands and evidence

| Command | Exit | Result |
|---|---:|---|
| `git fetch origin` and safe merge of `origin/platform` | 0 | merged `b442c71` as `4dcb95a`, no reset, no lost engine work |
| `corepack pnpm install --frozen-lockfile` | 0 | installed with repository-pinned pnpm 10.33.4 |
| `corepack pnpm setup:local` | 0 | created ignored `.env` and local `var/`; no secrets committed |
| `corepack pnpm check:ready` | 0 | configuration, DB, ports, engine, and delivery checks passed |
| `corepack pnpm typecheck` | 0 | 7/7 workspace projects passed |
| `corepack pnpm lint` | 0 | no problems |
| `corepack pnpm test` | 0 | 9 test files, 89 tests passed |
| `corepack pnpm build` | 0 | all package checks and Next production build passed |
| focused engine + worker run | 0 | 27/27 tests; real worker publishes real engine files |
| LibreOffice DOCX/PPTX conversion | 0 | proposal = 3 readable A4 pages; deck = 5 readable 16:9 slides; all pages visually inspected |
| separate API + worker processes, then `corepack pnpm demo:proposal` | 0 | task `737a7e88-cb1f-4ca7-a9ff-a427ba5e8306` reached `ready` in 66 ms; notification state `simulated` |

An initial invocation through the machine's fallback pnpm 11 wrapper was rejected by its minimum-release-age policy. No policy was bypassed and no lockfile was rewritten; using the repository's declared pnpm 10.33.4 completed the frozen install.

## Live sample

Task `737a7e88-cb1f-4ca7-a9ff-a427ba5e8306`, revision 1, fixture generation:

- `email.receivedAt`: `2026-10-23T19:00:00.000Z`
- `task.createdAt`: `2026-10-24T03:09:03.134Z`
- resolved draft deadline: `2026-10-26T16:00:00.000Z`
- DOCX: `Maple-Moss-Launch-Strategy-Proposal-r1.docx`, 10,191 bytes, SHA-256 `ea732b9a6b77bf5611f993d5ac13561f9772e448be4dcd1464cfc2f8c6000c90`
- PPTX: `Maple-Moss-Kickoff-Deck-r1.pptx`, 92,951 bytes, SHA-256 `ac7117220af42e310dd7b911e575b493806c596f6a6a39ab375d2d06bd773fb4`

The files were persisted by the platform using IDs restricted to `[A-Za-z0-9._-]`; the real worker test originally exposed and then prevented path-like `/` characters in generated IDs.

## Engine quality questions

1. **PASS — exact interface.** `apps/worker/src/worker.ts` passes the validated canonical `EngineInput` directly to `@afterhours/engine.runWork`. `buildSources` translates the real email, organization, attachments, and answers; no parallel DTO exists.
2. **PASS — traceable sources.** Every source has a deterministic opaque ID. Source/calculated content carries `SourceRef` evidence, optional quotes/locators, and `verifyProducts` rejects unknown sources or mismatched quotes.
3. **PASS — changed material inputs.** An agreed client change in both email and brief changes previews/exports. A brief fee changed to USD 7,000 while the company profile remains USD 6,000 returns `needs_input` naming both values; it does not silently choose.
4. **PASS — fixture facts.** The output contains USD 6,000, a four-week scope, paid-media/management/website/outcome exclusions, and a draft deadline separate from the engagement schedule. Evidence: engine tests plus the live sample above.
5. **PASS — fact boundaries.** `basis` labels source, calculated, recommendation, and assumption blocks. Audience segments are hypotheses; payment milestones and baseline are unknown; no awards, clients, demographics, or performance promises are fabricated.
6. **PASS — substantive deliverables.** Proposal sections cover summary, objectives, scope, commercials, responsibilities, exclusions, measures, assumptions, and next steps. The deck contains exactly five purposeful slides.
7. **PASS — preview/export consistency.** The same `WorkProduct.blocks` and `.slides` returned for structured previews are passed directly to DOCX/PPTX renderers. There is no second preview-copy generator.
8. **PASS — real files.** Exact Office MIME types, ZIP signatures, required DOCX/PPTX container parts, nontrivial bytes, and five slide XML parts are tested. Live filenames, sizes, and hashes are above.
9. **PASS — stable identity.** IDs hash task ID, revision, product/kind, and format. Same task/revision retries match; revision 2 differs. Real platform storage accepts the safe IDs.
10. **PASS — failures and cancellation.** Runtime schema validation, size/type limits, unsupported material attachments, malformed CSV/output, missing live configuration, and `AbortSignal` are typed and fail visibly. Incomplete required input returns `needs_input`, never `ready`.
11. **PASS with stated boundary — visual check.** LibreOffice opened and rendered every page/slide. Two-column spacing was corrected after inspection. Microsoft Word/PowerPoint were not separately exercised.
12. **PASS — fixture and live honesty.** Fixture behavior is deterministic and labeled by `generationMode: fixture`. Live mode requires provider/model/key and never falls back to fixtures; no live provider call was made because live generation is Batch 4.
13. **PARTIAL — consumers.** Actual worker consumption is proven by a test and a separate-process live run. The contract exposes `products`, `sources`, and artifact metadata in the task detail shape Maricella consumes; her browser UI branch is not merged here, so browser preview consumption remains her integration check.
14. **PASS — evidence.** Exact commands/results and a sample task/file set are recorded above.
15. **BLOCKED only at team gate.** Engine + platform path passes. Remaining integrated Batch 2 work is Maricella's experience branch and Darren's final three-way merged smoke test.

## Universal quality questions

1. **PASS — usable behavior.** Demo inject → queue → separate worker → real `runWork` → persisted ready task with DOCX/PPTX is proven by task `737a7e88-cb1f-4ca7-a9ff-a427ba5e8306`.
2. **PASS — checks.** Readiness, typecheck, lint, 89 tests, build, LibreOffice rendering, and a live local API/worker run all exited 0.
3. **PASS — fixture/mock/stub labeling.** Fixture mode is explicit in task DTOs. Test-only fake engines remain confined to tests. Delivery is still honestly `simulated`; live engine configuration does not fallback.
4. **PASS — shared contract.** `@afterhours/contracts` was consumed unchanged. The only cross-role adjustment is the platform test replacing its obsolete engine-stub assertion with real integration coverage.
5. **PASS — unavailable dependencies.** Missing live model credentials produce visible nonretryable configuration failures without deleting work. Worker transient errors/timeouts use bounded retry behavior. The local setup prerequisite is documented.
6. **PASS — persisted state.** The separate-process run persisted task, plan, products, sources, bytes, sizes, hashes, notification intent, original email receipt time, and separate ingestion time in SQLite/artifact storage. Platform restart/review persistence tests are included in the 89 passing tests.
7. **PASS — boundaries.** No secrets, `.env`, database, generated client files, or absolute local paths are committed. The engine has no database, messaging, arbitrary filesystem-destination, or prompt-directed tool execution path.
8. **BLOCKED items are explicit.** Browser preview/download/review smoke testing awaits Maricella's branch; final merged-gate ownership is Darren. Live model/provider and Microsoft Office checks are not Batch 2 release blockers and are recorded as not run.

## Limitations and handoff

- HIGH for the team gate: experience/UI branch is not merged, so browser preview/download/review is unverified here. Owner: Maricella, then Darren for integration.
- LOW: Microsoft Office itself was not used; LibreOffice successfully rendered every page and slide.
- DEFERRED: live model credentials/provider smoke test belongs to Batch 4; fixture mode is complete and does not make network calls.
- Supported extraction is plain text, Markdown, and CSV. PDF/DOCX/XLSX/OCR input extraction is explicitly unsupported and returns visible input requirements when material.

Darren should merge `person-2-engine` after `platform`, run the documented three-service smoke test with Maricella's branch, download the two artifacts, and record the final integration commit in `docs/batches/batch-2/integration.md`. Do not advance Batch 3 until that merged gate passes.
