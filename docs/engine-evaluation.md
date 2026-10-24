# Engine evaluation

This file records expected outcomes and is updated only from actual checks; it does not claim a success rate.

Last executed locally on 2026-10-23: 15 focused tests passed and the package typecheck passed. LibreOffice opened and converted the proposal/deck pair successfully; the proposal rendered as three readable A4 pages and the deck as five 16:9 slides. All rendered pages were visually inspected for overflow and the two-column slide spacing was corrected after the source-derived schedule was introduced.

| Scenario | Expected outcome | Key assertions |
|---|---|---|
| proposal | `ready` | Proposal DOCX, exactly five-slide PPTX, USD 6,000 and four-week scope agree, grounded review-draft language |
| report | `ready` | January USD 12,000, February USD 15,000, USD 3,000/25% growth, 120/150 orders, USD 100 AOV, 66.7% website share |
| ambiguous | `needs_input`, then `ready` | Four stable material questions; revision uses supplied answer text |
| no_action | `skipped` | No files generated |
| injection text | policy unchanged | Attachment remains data; engine has no messaging, secret-reading, arbitrary destination, or tool-execution path |
| changed client | `ready` with changed content | Agreed email/brief client name appears in both structured previews and exports; original fixture name is absent |
| conflicting fee | `needs_input` | Both supplied fee values appear in a stable blocking question; no document is exported |
| relative deadline | deterministic UTC instant | Uses `email.receivedAt` plus `organization.timezone`, not worker run or ingestion time |
| live without credentials | typed failure | `MODEL_CONFIGURATION`, nonretryable, no fixture fallback |

## Batch 5 (2026-10-24, branch `engine-batch5`)

43 engine tests and 117 repository tests passed. All six current decks (proposal, report, long, hostile, changed CSV, eight-channel) were exported through **Microsoft PowerPoint** and every slide was inspected. Ten layout and wording defects were found and fixed, then re-rendered. Word page rendering was **not run**: Word opened the files, but scripted export failed with AppleEvent -1708. DOCX page 1 was checked only in macOS Quick Look, which is not Word.

| Scenario | Expected outcome | Key assertions |
|---|---|---|
| changed CSV (cents, decrease) | `ready` | Revenue decreased 12.5%; $12,000.50 → $10,500.25; no stale canonical values |
| eight-channel CSV | `ready` | Deck table limited to six rows with an honest heading; tie stated, not resolved arbitrarily |
| long client/brief | `ready` | Brief's own six deliverables, USD 14,500, six weeks; zero layout issues; two-line cover title |
| hostile brief | `ready` with warning | Markup characters escaped, control characters removed, injection text absent from outputs |
| fee/start/deadline/scope conflicts (10 cases) | `needs_input` or typed error | Specific question IDs asserted |
| live repair (injected client) | ready, or `MODEL_INVALID_OUTPUT` | One repair; fabricated amounts, quotes, percentages and chart values rejected after repair |
| cancellation/timeout (injected client) | `ENGINE_ABORTED` / `MODEL_TIMEOUT` | Signal propagated; timers and listeners released; no ready after abort |

The deterministic content and Office-container checks are automated in `packages/engine/test/engine.test.ts`. A live provider smoke test requires operator-supplied credentials and incurs provider usage. PDF/DOCX/XLSX extraction and visual Office rendering are not part of the automated suite; the PowerPoint render above was a manual check.
