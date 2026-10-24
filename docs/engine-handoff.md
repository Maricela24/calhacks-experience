# Engine handoff

## Integration

Import `runWork` and `EngineError` from `@afterhours/engine`. The canonical input/result/progress types are re-exported from the package and originate in `@afterhours/contracts`. The worker supplies attachment bytes, an injected clock, an `AbortSignal`, and an async progress callback. The engine returns bytes only; the platform owns persistence, hashes, download routes, task state, and retries.

```ts
const result = await runWork({
  taskId, revision, mode, email, attachments, organization, answers,
  now: new Date().toISOString(), fixtureScenario,
}, { signal, onProgress });
```

Fixture paths are `fixtures/scenarios/*.json`, `fixtures/organization/harbor-creative.json`, and `fixtures/attachments/*`. Proposal/report fixtures return one DOCX and one five-slide PPTX. Ambiguous work returns four stable questions until answered. No-action work returns `skipped` with no files.

## Modes and environment

- `fixture`: deterministic local planning/content, real CSV calculation, validation, and real Office bytes; no network.
- `live`: `MODEL_PROVIDER=openai`, nonempty `MODEL_NAME`, and `OPENAI_API_KEY` are required. Responses API calls use a 60-second deadline and JSON output validated against contract schemas. There is no fixture fallback.
- `MODEL_PROVIDER=anthropic`: explicitly unsupported in this version and returns `MODEL_PROVIDER_UNSUPPORTED`.

Errors expose safe `code` and `retryable`. Retryable codes are `ENGINE_ABORTED`, `MODEL_TIMEOUT`, `MODEL_NETWORK`, `MODEL_RATE_LIMIT`, and provider 5xx `MODEL_PROVIDER`. Configuration, authentication, invalid output/input, grounding, unsupported input, and export failures are nonretryable.

## Supported inputs

Plain text, Markdown, and CSV are extracted with five-file, 10 MB/file, 20 MB aggregate, and 60,000-character context limits. CSV parsing supports BOM, CRLF, headers, quoted commas, and empty cells; required blanks fail instead of becoming zero. PDF, DOCX, XLSX, encrypted/scanned files, and OCR are not implemented. Unsupported material inputs return `needs_input` when fixture generation depends on them.

## Preview and UI guidance

Render `WorkProduct.blocks` for documents and `WorkProduct.slides` for decks, labeled **Content preview**. Evidence references point to `TaskDetail.sources` by opaque ID. Do not create separate preview copy or imply pixel-identical Office rendering. `basis` distinguishes sourced, calculated, recommendation, and assumption content.

## Verification

The package tests cover fixture calculations, changed inputs, zero denominators, blank values, no-action, clarification/resume, deterministic IDs, five-slide output, ZIP signatures, and fail-closed live configuration. Visual Office rendering is not guaranteed unless the generated artifacts are opened or rendered in an Office-compatible application.
