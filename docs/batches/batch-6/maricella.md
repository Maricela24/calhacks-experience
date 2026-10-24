# Batch 6 report — Maricella (final experience, browser gate, judge demo)

Branch: `experience-batch6` (pushed to the fork `maricela24/calhacks-experience`). Base `experience-batch3` `95f325a`.
**Candidate tested (local, not pushed):** `verify-integration` tip `f08671a` = experience work (batches 3 to 6) + `origin/platform-batch5` `d11127b` + `origin/person-2-engine` `de6bd40`. Toolchain: Node v22.22.0, pnpm 10.33.4, lockfile as merged (regenerated once for the engine's dependencies; Darren must redo the real merge). The pushed `experience-batch6` contains only my commits on top of `experience-batch3`; the platform and engine branches are not merged into it.
Implementation hash tested: see the "Recorded hashes" block at the end; docs-only commits after it are not separately tested.
**Release decision for my scope: NOT READY as a team release; the browser/UX portion is READY WITH DISCLOSED LIMITATIONS for the fixture-intelligence, demo-trigger, outbox demonstration.** Reasons below. Darren owns the final record.

## Reality check (Step 1)

| Item | Finding | Class |
|---|---|---|
| Engine | `person-2-engine` `de6bd40` is real (DOCX/PPTX, calculations, native chart). No `engine-batch4/5` branch exists. | ok |
| Evidence quotes | All 22 evidence references in the real proposal and report have `quote: null`. UI says "No excerpt was recorded". Real-quote browser test is BLOCKED. | **P1 (Joanne)** |
| Platform | `platform-batch5` is the latest (Darren); not merged into `main` (`5d8f342`) or `platform`. No release candidate file exists yet. | Darren |
| Live Gmail, live model, WhatsApp | No credentials or eligible account. | BLOCKED (external) |
| Rehearsals with Darren and Joanne | Not possible from this session. | NOT RUN |
| Darren's own UI | His report says he tested a separate uncommitted "SpaceXAI" UI, not `apps/web`. **Two UIs exist; the team must pick one candidate UI.** My results apply to `apps/web`. | P1 (decision: team) |
| Fake paths | None in the user path. The e2e route interceptors (stale revision, long content, download failure) modify browser requests only inside tests and are labeled. | ok |

## Browser gate on the actual stack (Step 4 and Part A)

Real API, worker and engine, isolated temp DB and artifact roots, synthetic data. Command `pnpm test:e2e` exit **3** (one test BLOCKED, see above): **22 passed, 2 skipped** of 24.

Scenarios covered: login, wrong password, deep link and safe return (including revoked session on a phone), queue, demo proposal injection, persisted progress events, content preview of proposal and five-slide deck, source chip dialog and keyboard focus, real DOCX and PPTX download with ZIP/XML/slide checks, Mark reviewed and refresh, report numbers/chart/table/DOCX/deck chart XML, clarification resume to revision 2 with earlier answers visible, stale answers (409) and server rejection (400) keeping typed text, no-action, replay dedupe, stale review, failed task and single-revision retry, dismissal, blocked notification with files intact, quiet-hours planned time, offline, download failure, long content at 390 px, settings persistence, timestamps. Plus a manual worker-stopped run.

## Visual and layout inspection (Part C)

Inspected real screenshots at 1440 px and 390 px of the proposal task, deck fee slide, report with chart, notifications and settings. Observed and fixed: page overflow with very long content (found by e2e 19); chart text too small on phones (fixed with larger drawing units under 600 px). Not done: screen-reader pass, automated accessibility scan, contrast measurement tool run (palette was chosen for AA; not machine-verified), Microsoft Office or phone viewer rendering (LibreOffice opened all four sample files). The Next.js dev indicator overlaps the sign-out link in dev builds only.

## Role questions

1. **Exact candidate and scenarios** — PASS. `f08671a` (above); scenario list above; run on the real API, worker and engine.
2. **Login, deep link, download, review, refresh on desktop and mobile with keyboard** — PASS for what ran: desktop e2e 1; phone 390 px e2e 9, 19, 21; keyboard e2e 12. Phone OS file opening: NOT RUN (a normal authenticated download is provided; documented viewer needed).
3. **Progress, revision, files, status from persisted data** — PASS. Everything renders from `TaskDetail`/`TaskSummary`; no local approved or progress state exists; reload after review and dismiss (e2e 1, 18); revision shown from the API; polling stops when terminal.
4. **Demo email, fixture intelligence, outbox simulation, provider acceptance, delivery labeled accurately** — PASS where observable. Badges "Demo email"/"Fixture output"; header "Gmail disconnected" and "Notifications: outbox (simulated)"; "Simulated (outbox)" never shown as delivered (e2e 6); accepted/uncertain/policy wording unit-tested. A real "accepted" event has never occurred.
5. **Both timed rehearsals** — **NOT RUN.** Solo scripted browser run: ready 3.0 s, review done 4.3 s, report ready 7.1 s (fixture engine; narration time not included). Rehearsal table in `docs/release/demo-script.md` is empty on purpose.
6. **Factual, numerical, source checks to show; unsupported claims removed** — Show: fee "Strategy fee: USD 6,000" on slide 4, report 12,000 → 15,000, +3,000, +25% in preview, chart, table, DOCX text and the deck's native chart data (e2e 2), the Limitations block (no causality). Removed from the video and script: any "delivered", live-inbox, live-AI, overnight-as-fact, time-saved, accuracy, customer, price claim (`docs/release/video-claim-check.md`). Joanne's separate artifact audit was not available to me.
7. **Fallback if Gmail, model or WhatsApp is unavailable** — The demo already runs without them: demo trigger, fixture intelligence, outbox. Each is disclosed in the script. A prepared example is shown only as "prepared earlier".
8. **Release-blocking issues** — (a) no recorded team candidate or integration gate (Darren); (b) engine evidence quotes are null (Joanne; fix check: e2e 16 must run, not skip); (c) two UIs, one candidate (team decision); (d) two team rehearsals NOT RUN (all three); (e) live Gmail, model and WhatsApp BLOCKED (accounts).
9. **Missing real dependency or fake UI path** — Found: the engine was a stub (resolved by `person-2-engine`); quotes null (open); Darren's UI divergence (open). Fake UI paths: none.
10. **Traceability of visible status, time, mode, revision** — PASS. Status, revision, modes, notification state and `scheduledFor` come from the API; timestamps are labeled by source; "Files prepared" comes from the persisted ready event or says "Unavailable"; no percentage, time-saved or confidence number exists in the UI.
11. **Mobile, session, offline, source-focus, download, error checks** — PASS: see e2e 9, 12, 19, 20, 21, 23. Defects found and fixed: long-content overflow; chart text size; offline actions queueing silently (fixed with `networkMode: "always"`).
12. **Preview and download content versus Joanne's audit** — PARTIAL. My checks compare each downloaded file with the preview (title, five slide parts and titles, USD 6,000, report numbers, chart XML values). Joanne's own artifact audit was not supplied: NOT RUN on my side. Office rendering beyond LibreOffice: NOT RUN.
13. **Rehearsals tied to the same candidate, durations** — NOT RUN.
14. **Concept-video scenes and labels** — Idealized scenes (incoming email animation, night-to-morning, phone notification) carry "Concept demo"/"Illustrative workflow"; actual prototype footage uses fictional data and the current UI (`docs/release/video-claim-check.md`). I did not inspect any video file.
15. **Remaining final browser/demo blocker** — Rehearsals (all three) and the team's choice of candidate UI; the real-quote check (Joanne). Resolving test: `pnpm test:e2e` exits 0 with nothing BLOCKED on the agreed candidate, then two timed rehearsals recorded in the demo script.

## Universal questions

1. Candidate and proof: `f08671a`; proposal injected → ready → two downloads → reviewed → refresh (e2e 1), report numbers (e2e 2).
2. Commands: `pnpm typecheck && pnpm lint && pnpm test && pnpm build` exit 0 (274 tests); `pnpm test:e2e` exit 3 (22 passed, 2 skipped, 1 BLOCKED).
3. Modes: demo intake, fixture intelligence, simulated outbox, controlled/short quiet window. Nothing live.
4. Contracts and runbook: unchanged contracts; I did not follow Darren's runbook end to end on a clean checkout (NOT RUN); I used `pnpm install`, `pnpm test:e2e` and `pnpm dev` equivalents with isolated storage.
5. Failure behavior: missing credentials, stopped worker, offline, expired session, failed download, stale revision, bad answers all fail visibly with no lost work.
6. Persistence and integrity: reviews, files and schedules persist across reload; downloads are checked against the manifest size and SHA-256 by the page and ZIP-inspected by tests.
7. Boundaries: no secrets, real inboxes, or external messages; process cleanup limited to the harness' own processes; temp directories removed.
8. Remaining: listed under question 8 above.

## Handoff

- Darren: choose the candidate UI; merge `person-2-engine` + `experience-batch6` onto `platform-batch5` and regenerate the lockfile; record `docs/release/candidate.md` and the capability matrix; run `pnpm test:e2e` on that merge. Note the second e2e stack (3101/4101) and `NEXT_DIST_DIR`.
- Joanne: add real evidence quotes; supply the artifact audit; product titles currently echo the user's clarification answer verbatim (probably unintended).
- All three: two rehearsals using `docs/release/demo-script.md`, recording durations.

## Recorded hashes

Filled in by the docs-only commit that follows the implementation hash.
