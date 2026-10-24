# Joanne → Claude Code handoff

## Repository state

- Repository: `joannesaputra/calhacks-afterhours`
- Branch: `person-2-engine`
- Code-state commit before this handoff-only commit: `a45bd5ae58955322af5531aa5ff29ee1a49064e3`
- Engine/platform implementation commits: `258e2eb`, merge `4dcb95a`, `5b45e95`, `f5e7837`, report `a45bd5a`
- Remote status at handoff start: local `person-2-engine` exactly matched `origin/person-2-engine` at `a45bd5a`.
- Uncommitted changes at handoff start: none. The only new change is this handoff document.
- Important scope boundary: this branch merged the requested Batch 2 platform tip `b442c71`. `origin/platform` later advanced to Batch 3 commits `29a3570` and `aaed3db`; those were inspected but deliberately not merged because Joanne's authorized work was Batch 2.

The commit containing this file is documentation-only and will be the remote branch tip reported to Claude after push. Do not reset or recreate the repository.

## Implemented

### Engine

- Canonical `runWork(input, { signal, onProgress })` entry point using the shared `EngineInput` and `EngineResult` contracts.
- Real source ingestion from the email, organization profile, user answers, and supplied attachment bytes.
- Deterministic fixture scenarios for proposal, report, ambiguity/clarification, and no-action work.
- Source-derived proposal facts. Agreed client changes flow into the output; conflicting client, fee, or duration facts return stable `needs_input` questions.
- Timestamp handling based on immutable `email.receivedAt` plus `organization.timezone`. `input.now` and task ingestion time are not used to interpret relative dates.
- Substantive proposal DOCX and exactly five-slide PPTX generated as real Office ZIP containers with correct MIME types and in-memory bytes.
- Structured `WorkProduct` previews are the same model consumed by the DOCX/PPTX renderers, preventing separate preview/export copy.
- Grounding and evidence verification using deterministic source IDs and `SourceRef` values.
- Deterministic calculation path for the CSV report fixture, including zero-denominator and blank-value handling.
- Stable product/file/source identifiers. Artifact IDs contain only platform-safe `[A-Za-z0-9._-]` characters and vary by revision.
- Size/count/context limits, unsupported-input handling, runtime validation, typed errors, progress callbacks, and `AbortSignal` cancellation.
- OpenAI Responses API adapter for live mode with validated structured output, timeout/network/rate-limit mapping, and no fixture fallback.

### Platform integration proved on this branch

- The real worker imports the real `@afterhours/engine` export.
- `apps/worker/test/worker.test.ts` executes the real fixture engine, reaches `ready`, publishes a DOCX and PPTX, verifies five slides, and verifies the resolved deadline.
- A separate-process API + worker run queued task `737a7e88-cb1f-4ca7-a9ff-a427ba5e8306`, completed `ready` in 66 ms, persisted both artifacts, and recorded the outbox notification as `simulated`.
- The live sample preserved `email.receivedAt=2026-10-23T19:00:00.000Z`, separately recorded ingestion at `2026-10-24T03:09:03.134Z`, and resolved the deadline to `2026-10-26T16:00:00.000Z`.

## Incomplete, deferred, or stubbed

- The experience/UI branch is not merged here. Browser rendering of structured previews, authenticated downloads, review/refresh behavior, and the final three-way Batch 2 gate remain unverified on one merged commit.
- Delivery remains intentionally non-live: outbox is `simulated`; WhatsApp is `blocked` unless a later authorized implementation provides the official provider path.
- Live OpenAI generation is implemented but was not called with real credentials. This was deferred to Batch 4 and must not silently fall back to fixture content.
- `MODEL_PROVIDER=anthropic` is explicitly unsupported and returns `MODEL_PROVIDER_UNSUPPORTED`.
- Input extraction supports text, Markdown, and CSV. PDF, DOCX, XLSX, encrypted/scanned files, and OCR input extraction are not implemented.
- Microsoft Word and PowerPoint were not used for visual QA. LibreOffice successfully rendered all three proposal pages and all five slides.
- Gmail/live notification/provider testing is outside Joanne's completed Batch 2 engine work.

## Important files and decisions

- `packages/engine/src/index.ts` — public engine exports and `runWork`.
- `packages/engine/src/pipeline.ts` — validates input, selects fixture/live generation, emits progress, verifies content, and exports files.
- `packages/engine/src/sources.ts` — source normalization, extraction limits, safe text cleaning, and answer sources.
- `packages/engine/src/planning.ts` — classification, plans, questions, and deadline application.
- `packages/engine/src/dates.ts` — absolute/relative deadline resolution using `email.receivedAt` and organization timezone.
- `packages/engine/src/proposalFacts.ts` — source-derived client, fee, duration, schedule, and material conflict questions.
- `packages/engine/src/content.ts` — shared structured proposal/report/deck content.
- `packages/engine/src/grounding.ts` — evidence and output verification.
- `packages/engine/src/calculations.ts` — deterministic CSV calculations; never delegates arithmetic to a model.
- `packages/engine/src/providers/openai.ts` — bounded live model adapter and validated response translation.
- `packages/engine/src/render/docx.ts` and `render/pptx.ts` — Office generation from `WorkProduct`.
- `packages/engine/src/ids.ts` — deterministic IDs restricted to the platform's safe filename/id alphabet.
- `packages/engine/test/engine.test.ts` — 15 focused engine tests.
- `apps/worker/test/worker.test.ts` — real engine/worker/artifact integration coverage plus platform worker behavior.
- `fixtures/scenarios/**`, `fixtures/attachments/**`, `fixtures/organization/**` — explicitly fictional deterministic fixture data.
- `docs/engine-handoff.md`, `docs/engine-evaluation.md`, `docs/batches/batch-2/joanne.md` — integration contract, evaluation, and full evidence report.

Key decisions:

1. Preserve shared contracts; no private parallel engine DTOs were introduced.
2. Use the fixture email's original receipt timestamp and organization timezone for relative language; keep ingestion time separate.
3. Return `needs_input` on material conflicts instead of picking a convenient source or inventing a value.
4. Make `WorkProduct` the single source for both preview data and file rendering.
5. Generate real Office bytes in memory; persistence, hashing, downloads, retries, and database ownership stay in the platform.
6. Keep fixture and live modes explicit. Live configuration failures are visible and never trigger fixture fallback.

## Engine exports and contracts

Public exports from `@afterhours/engine`:

- `runWork`
- `EngineError`
- `calculateSales`
- `resolveDeadline`
- `SalesMetrics` and `SalesRow` types
- Re-exported canonical types: `BinaryAttachment`, `EngineDependencies`, `EngineInput`, `EngineProgress`, `EngineResult`, and `GeneratedFile`

Canonical schemas/types come from `@afterhours/contracts`, especially:

- `EngineInputSchema`, `EngineResultSchema`, `EngineProgressSchema`
- `EngineInput`, `EngineResult`, `EngineDependencies`
- `SourceDocument`, `SourceRef`, `WorkPlan`, `WorkQuestion`, `WorkProduct`, `ContentBlock`, and `SlideContent`
- `DemoFixture` and `FixtureScenario`
- `OrganizationProfile` and the shared email/attachment types

Do not change shared schemas, root dependencies, migrations, API routes, or the lockfile without coordinating with the owning teammate. The worker call shape is:

```ts
await runWork(input, { signal, onProgress });
```

## Commands actually run

All successful final checks used the repository's declared pnpm version through Corepack:

| Command | Result |
|---|---|
| `corepack pnpm install --frozen-lockfile` | exit 0; pnpm 10.33.4 |
| `corepack pnpm setup:local` | exit 0; created ignored `.env`, `var/`, and generated local secret values |
| `corepack pnpm check:ready` | exit 0; configuration, DB, ports, engine, and delivery loaded |
| `corepack pnpm typecheck` | exit 0; 7/7 workspace projects passed |
| `corepack pnpm lint` | exit 0; no problems |
| `corepack pnpm test` | exit 0; 9 files, 89 tests passed |
| `corepack pnpm build` | exit 0; all package checks and Next production build passed |
| `corepack pnpm vitest run packages/engine/test/engine.test.ts apps/worker/test/worker.test.ts --config vitest.config.ts` | exit 0; 27/27 focused tests passed |
| LibreOffice conversion of generated DOCX/PPTX | exit 0; 3 A4 pages and 5 16:9 slides; every page visually inspected |
| separate API and worker processes, then `corepack pnpm demo:proposal` | exit 0; sample task reached `ready`, 2 real artifacts persisted |

An earlier attempt with the machine fallback `pnpm` executable used pnpm 11 and was rejected by its minimum-release-age policy. No security policy was bypassed and the lockfile was not rewritten. Use `corepack pnpm ...` so the repository's pinned pnpm 10.33.4 is honored.

## Environment variable names

Never commit values. `corepack pnpm setup:local` can populate the required local-only values in ignored `.env`.

Core/local platform:

- `NODE_ENV`
- `PUBLIC_APP_URL`
- `API_ORIGIN`
- `API_PORT`
- `DATABASE_PATH`
- `ARTIFACTS_DIR`
- `SESSION_SECRET`
- `APP_PASSWORD`
- `TOKEN_ENCRYPTION_KEY`
- `DEMO_ENABLED`
- `DEMO_CLI_TOKEN`

Engine/model:

- `GENERATION_MODE`
- `MODEL_PROVIDER`
- `MODEL_NAME`
- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY` (reserved; provider currently unsupported)

Gmail/platform:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI`
- `GMAIL_POLL_INTERVAL_SECONDS`

Delivery:

- `NOTIFICATION_CHANNEL`
- `WHATSAPP_USE_CASE_ELIGIBLE`
- `WHATSAPP_CUSTOMER_SERVICE_WINDOW_UNTIL`
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_WHATSAPP_FROM`
- `TWILIO_WHATSAPP_TO`
- `TWILIO_CONTENT_SID`

Web:

- `NEXT_PUBLIC_APP_NAME`

## Failures, blockers, and dependencies

- Current engine and engine/worker integration checks have no known failing tests.
- The team Batch 2 gate is blocked on Maricella's experience branch and Darren's final merged integration run.
- Do not merge `origin/platform` Batch 3 work merely because it is newer; obtain explicit authorization and the intended integration base first.
- Do not claim live OpenAI, Gmail, WhatsApp, Microsoft Office, or browser UI validation until each is actually exercised.
- Darren owns platform/integration; Maricella owns browser preview/download/review behavior. Coordinate rather than modifying their owned areas speculatively.

## Exact next task

Complete the integrated Batch 2 review gate on an authorized integration branch:

1. Obtain Maricella's exact experience branch/commit and Darren's intended integration base.
2. Merge `person-2-engine` without resetting or recreating the project; resolve the lockfile only by rerunning the pinned frozen-install workflow and reviewing any real dependency conflict.
3. Start web, API, and worker as separate services.
4. Inject the proposal fixture through the real API and wait for `planning → running → ready`.
5. Verify the browser renders the persisted `WorkProduct` proposal and all five slides, clearly labels fixture mode, exposes two authenticated downloads, and does not invent separate preview text.
6. Download and open the real DOCX/PPTX; record filename, MIME type, byte size, SHA-256, DOCX page count, and exactly five slides.
7. Approve/review the task, refresh, restart the API, and verify the review state and session survive while no message is falsely reported as delivered.
8. Run `corepack pnpm check:ready`, `typecheck`, `lint`, `test`, and `build` on the merged commit and update `docs/batches/batch-2/integration.md` with exact evidence.

If the experience branch or authorized integration base is unavailable, stop and request those exact references. Do not begin Batch 3 or add unrelated engine features as a substitute.
