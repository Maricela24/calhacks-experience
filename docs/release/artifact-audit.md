# Artifact audit (Joanne, Batch 6)

Date: 2026-10-24. All inputs are fictional fixtures. No generated file, database, `.env`, or credential is committed. Generated files were kept in ignored or temporary directories.

## What was audited

There is **no official release candidate yet**: no `docs/release/candidate.md`, no integration branch, and no experience branch on the remote. Darren's Batch 5 integration run used the older engine `de6bd40`. So this audit used an **audit-only local merge**:

| Part | Commit |
|---|---|
| Platform | `origin/platform-batch5` @ `d11127b` |
| Engine | `engine-batch6` @ `6dde883` (pushed with this report) |
| Merge | `git merge --no-ff --no-commit` in a scratch worktree outside the repository. Clean, lockfile unchanged, **not committed or pushed**. |
| UI | none (no experience branch). Browser behavior was not audited here. |
| Modes | demo ingestion, **fixture** intelligence (real engine code), outbox notifications |

When Darren records the real candidate, it must contain `6dde883` or later for this audit to apply. The `de6bd40` engine he tested in Batch 5 lacks every Batch 5 and Batch 6 engine fix.

Checks on that merged tree: `check:ready`, `typecheck`, `lint`, `test` (23 files, **263 tests**), and `build` all exited 0.

Runtime: the real API and worker started as separate processes (`node --import tsx apps/{api,worker}/src/main.ts`) on unused port 4617, with a fresh scratch SQLite database and artifact directory. The API was then driven through real HTTP:

- session login, which returned 200 with a cookie;
- `POST /v1/demo/inject`;
- `POST /v1/tasks/:id/answers` and `/review`;
- `GET /v1/tasks/:id`;
- authenticated `GET /v1/artifacts/:id/download`.

Only the two processes started for the audit were stopped afterwards.

## Tasks and files (final run on `d11127b` + `6dde883`)

| Scenario | Task / revision | Outcome | File (artifact id) | Bytes | SHA-256 (manifest = download) |
|---|---|---|---|---|---|
| proposal | `fffd8767-8b8c-4890-b892-0835b293659e` r1 | ready → **approved** after review | `Maple-Moss-Proposal-r1.docx` (`art_489fee5ccdc53961099038d7b3c14f3c`) | 11,922 | `5d3e9cf67cf305a1…` |
| | | | `Maple-Moss-Kickoff-Deck-r1.pptx` (`art_015e21068115dc3faa88652fda803980`) | 101,280 | `0d88af135cb751c3…` |
| report | `e0e3ac59-76b5-44a5-a90d-7c6a277d3129` r1 | ready | `January-February-2026-Sales-Performance-Report-r1.docx` (`art_156b91dfb5f6027e4e0d17a18d998f96`) | 11,488 | `4685acaf80768cdf…` |
| | | | `January-February-2026-Sales-Update-r1.pptx` (`art_e359f2f8c6cd120d0530c381d0383f7c`) | 119,937 | `a6981a840a290366…` |
| ambiguous | `5689c9de-c6a4-428f-81b8-53531bc16d6b` r1 → r2 | needs_input (4 questions) → ready | `Northstar-Co-Proposal-r2.docx` (`art_e0c3983f05f886287ed691ecefcecbd8`) | 11,320 | `2c4dda4291fbb782…` |
| | | | `Northstar-Co-Kickoff-Deck-r2.pptx` (`art_3956700e851d9e0269e20c0aaf58bfcc`) | 93,943 | `4056b4848adf0810…` |
| no_action | `e064c4bf-7cf6-4cf6-a9be-5829feb10f9c` r1 | skipped, 0 files | — | — | — |
| replay | `2559d7dd-ff59-4fe9-aa26-9bd7a3eb5bef` | same task ID twice, second response `deduplicated: true` | — | — | — |

For every file:
- The authenticated download returned 200.
- `Content-Type` equals the manifest MIME type (DOCX/PPTX OpenXML types).
- `Content-Disposition` carries the manifest filename.
- Downloaded size and SHA-256 equal the manifest.
- An unauthenticated download returned **401**.
- Artifact `revision` equals the task revision.
- `productId` matches a product in `TaskDetail.products`.

On the ambiguous task, a stale-revision answer returned **409**, and answers for r1 returned 200. Revision 2 is ready with four `user_answer` sources ("Answer: client_identity" … "Answer: project_schedule"), so answer provenance is preserved.

## Content checks (downloaded files vs the TaskDetail preview products)

| Check | Proposal | Report | Northstar (answers) |
|---|---|---|---|
| Preview strings present in DOCX | 51/51 | 40/40 | 34/34 |
| Preview strings present in PPTX | 30/32 * | 24/26 * | 19/21 * |
| Slides / notes pages | 5 / 5 | 5 / 5 | 5 / 5 |
| DOCX core parts (`word/document.xml`, `docProps/core.xml`, `[Content_Types].xml`) | present | present | present |
| Citations → existing, fully read source | 26/26 | 11/11 | 11/11 |
| Exact quotes match normalized source text | 25/25 | (locators only) | 11/11 |
| Placeholder/fake-claim scan (lorem, todo, tbd, placeholder, testimonial, "will increase revenue", "we guarantee") | none | none | none |

\* The two deck strings not found are expected and were checked in the XML. The deck's product title is stored in `docProps/core.xml` (`<dc:title>`), not on a slide. The cover label is drawn in uppercase ("REVIEW DRAFT", "DATASET SCOPE").

Canonical facts, expected vs observed in the downloaded files:

| Fact | Expected | DOCX | PPTX |
|---|---|---|---|
| Organization / client | Harbor Creative / Maple & Moss | yes | yes |
| Authorized fee | USD 6,000 (brief + company profile) | yes | "Strategy fee: USD 6,000" |
| Engagement | starts October 26, 2026; four weeks | "Starts October 26, 2026; 4 calendar weeks" | same |
| Draft deadline (separate from engagement) | from `email.receivedAt` + America/Los_Angeles | "Monday, October 26, 2026 at 9:00 AM PDT" | same |
| Exclusions | ad spend, ongoing management, website development, guaranteed revenue outcomes | all four | first two; full list in speaker notes |
| Unknowns | payment milestones not stated | yes (assumption block) | "agree payment milestones" (recommendation) |
| Report revenue | $12,000 → $15,000, +$3,000, +25% | yes | chart values `12000`, `15000`; title "Revenue increased 25%"; notes "$3,000" |
| Orders / AOV | 120 → 150; $100 both months | yes | "Orders: 120 to 150 (orders increased 25%)", "Average order value: $100 in both months" |
| Channels | Website $8,000 → $10,000; Partnerships $4,000 → $5,000; Website share 66.7% | yes | yes |
| Causality | not claimed | "data does not establish causality" | "Do not infer campaign causality"; notes say causality not established |
| Clarified proposal | Northstar Co., USD 6,000, November 2-29, 2026, answered scope | yes | yes |

## Changed input (calculation, not fixed answers)

The demo API injects fixed fixtures only, so changed inputs were verified through the engine's `runWork` (the same function the worker calls) and asserted in tests:

- **Spec variation:** February Website 10,000 → 11,000 gives February $16,000, change $4,000, growth 33.33% (shown as **33.3%**), orders 150, AOV $106.67. The chart XML has `<c:v>16000</c:v>`, slide 2 reads "Revenue increased 33.3%", and none of $15,000, $3,000 or "Revenue increased 25%" remain. Test: `batch6.test.ts › recomputes the spec variation`.
- **Sweep:** February Website from 9,000 to 11,200 in steps of 37 (60 inputs) all reach `ready`. Test: `never rejects its own rounded percentages`.
- **Batch 5 changed CSV** (cents, decrease): "Revenue decreased 12.5%", $12,000.50, no stale values (Batch 5 test, still passing).

Rounding policy: percent changes are computed to 2 decimals and displayed to 1 decimal (half away from zero, `displayPercent`). Shares are computed and displayed to 1 decimal. AOV is rounded to whole cents. A zero denominator is reported as "not computable", never Infinity. Blank values are rejected, never treated as 0.

## Defects found and fixed in Batch 6

| ID | Severity | Defect | Fix | Evidence |
|---|---|---|---|---|
| B6-E1 | **P1** | The Batch 5 calculated-number check rejected the report's own rounded growth (e.g. 25.83% shown as 25.8%), so most changed CSVs failed with `UNSUPPORTED_NUMBER`. It also exposed `toFixed` and `Math.round` disagreeing (14.35%). The spec's 11,000 variation only passed because Partnerships' January share is coincidentally 33.3%. | `4f660d2`: one `displayPercent` used by both content and verifier | spec-variation test plus 60-value sweep |
| B6-E2 | P2 | Report deck said "$100 to $100" and "66.7% to 66.7%" for unchanged metrics. | `6dde883`: "… in both months" | wording test; PowerPoint re-render |

No P0 engine defect was found. No open engine P0 or P1 remains for the fixture flows audited above.

## Rendering

| Renderer | Files (from the authenticated downloads) | Result |
|---|---|---|
| **Microsoft PowerPoint** (scripted Save as PDF, pages rasterized with PDFKit, every page viewed) | proposal deck, report deck (final run); Northstar deck (first audit run, before the report-only wording fix) | 5 pages each; no clipping or overlap; readable type; chart axis and labels in USD |
| Microsoft Word | — | **NOT RUN.** Word opens the files, but scripted export fails (AppleEvent -1708). Pages export timed out. |
| macOS Quick Look (Apple converter, not Word) | the 3 DOCX, page 1 only | readable headings, tables, basis notes, header and disclaimer. Not evidence of Word page flow. |

Portability: fonts are named, not embedded (Aptos from the organization profile), so viewers without Aptos substitute a font; Quick Look used a serif. There are no network images or fonts. Chart number formats follow the viewer's locale: this Mac's `en_ID` locale shows `$15.000`, a US locale shows `$15,000`.

Files for a teammate to open in Word: rerun `corepack pnpm exec tsx packages/engine/test/render-samples.ts` (writes to ignored `var/engine-samples/`), or use the API downloads.

## Engine capability details (for Darren's capability matrix)

| Capability | Status | Evidence |
|---|---|---|
| Inputs: email body, `.txt`, `.md`, `.csv` | PASS (fixture flows) | worker-path tasks above |
| Inputs: PDF, DOCX, XLSX, images, OCR | **Not implemented**. A required unsupported attachment → `needs_input` (`usable_project_brief`/`usable_sales_csv`); never cited as read. | engine tests |
| Limits | 5 files, 10 MB/file, 20 MB total, 60,000 characters of context (with truncation warnings) | engine tests |
| Outputs | proposal DOCX + presentation PPTX; report DOCX + presentation PPTX; 5 slides when requested | worker path above |
| Fixture intelligence | PASS. Deterministic and labeled `generationMode: fixture` in the task. | task DTO |
| Live intelligence (OpenAI Responses API) | Implemented and tested **only with injected fake clients**. **Live call: NOT RUN** (no key). Unsupported: Anthropic. | Batch 5 tests |
| No live → fixture fallback | PASS (unit). Missing configuration fails before any progress. | `never falls back to fixtures` |
| Budgets / repair / cancellation / timeouts | PASS (unit). 3 calls per attempt, 60 s each, one counted repair re-validated, abort honored, timers released. | Batch 5 tests |
| Clarification | PASS (worker path). Stable questions, new revision, answer provenance. | ambiguous task above |
| Conflicts / unknowns (fee, currency, duration, start, deadline, scope, client) | PASS (engine). Specific questions, no files. | 10 synthetic rejection cases |
| No-action | PASS (worker path). Skipped, 0 files. | no_action task |
| Visual rendering | PowerPoint PASS (3 decks); Word NOT RUN | above |

Do not claim: accuracy rates, time saved, cost, "works with any request", live AI output, Word-verified layout, or PDF/DOCX/XLSX input support. Two good fixture examples are not a benchmark.
