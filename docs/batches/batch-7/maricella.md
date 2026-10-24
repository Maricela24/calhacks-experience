# Batch 7 report — Maricella (preserve, reconcile, publish the frontend; real browser suite)

Branch: `experience-batch7` (pushed to `joannesaputra/calhacks-afterhours` and the fork `maricela24/calhacks-experience`).
**Tested implementation candidate: `0e63c759e6d3442c2c4a0056fc0b120c363f63fd` (`0e63c75`)**, a descendant of the merge `f38e86e` ("Merge experience-batch6 into integration/batch7"). Later commits on the branch are docs-only (this report); they were not re-run.

| Parent | Ref |
|---|---|
| Base | `origin/integration/batch7` `1b4deca` (Darren; = `platform-batch6` `fef9396` + Joanne's `engine-batch6` `b313998`; its code candidate is `ae422e6`) |
| Merged in | `experience-batch6` `19a499e` (my UI, delivery adapter, browser suite, docs; built on `experience-batch3` `95f325a`) |

Toolchain: Node v22.22.0, pnpm 10.33.4 (the declared `packageManager`; engines `>=20.19`). Modes: demo intake, **fixture** intelligence (Joanne's real engine), outbox. Nothing live.

## 1. Local work: where it was, what was preserved, what is pushed

- My work was never uncommitted in a way that could be lost: every contribution is a pushed commit. `experience` `629830b` (Batch 2), `experience-batch3` `95f325a`, `experience-batch6` `19a499e`. The Batch 7 packet saw no experience branch because it pre-dated my pushes; refs refreshed today show `experience-batch6` on origin.
- Darren's UI (his "SpaceXAI-style" files) is committed on `platform-batch6` as `664cc98` (snapshot), `79a35af` and `1e29d42` (return-path fix), and is in `integration/batch7`. It was not copied from any untracked directory by me.
- Working tree after every step was clean (`git status` empty) at each commit.

## 2. Reconciling the two UIs, without losing either

Both UIs defined the same routes (`/`, `/login`, `/settings`, `/tasks/[id]`), so only one set can build. Comparison:

| | Darren's (`664cc98`) | Mine (`experience-batch6`) |
|---|---|---|
| Routes | `/`, `/login`, `/settings`, `/tasks/[id]` | the same plus `/notifications` |
| Previews, charts, source dialog | basic preview; evidence chips showed raw source ids | content preview of proposal/deck/report, SVG charts with data tables, source dialog with quote check |
| Review/answers/retry/download | review and basic flows | review, clarification form with draft preservation, retry, verified downloads (size, ZIP signature, SHA-256) |
| Settings | status view | forms for organization, automation, senders, notifications, quiet hours |
| Tests | one unit test for the return path | 311-test workspace suite includes 42 web/delivery tests, 26 Playwright tests |
| Delivery | stub (`simulated`/`blocked`) | Twilio adapter, mock-tested; outbox simulated |
| Return after login | `?next=` | `?returnTo=` (same-origin relative only) |

Decision, recorded in the merge commit `f38e86e`: keep mine, because only it has the notifications page, settings forms, source inspection, browser suite and delivery adapter. **Darren's files were removed on purpose, not silently**, and remain restorable from the three commits above: `apps/web/app/{page.tsx, settings/page.tsx, tasks/[id]/page.tsx, components/Shell.tsx, components/ui.tsx, lib/api.ts, lib/next.ts, lib/useResource.ts}` and `apps/web/test/next.test.ts`. Conflicting files (`globals.css`, `layout.tsx`, `login/page.tsx`) took my version. His return-after-login behavior is kept in effect (tests below). **This is a decision for Darren to confirm**; if he prefers his visual style, the two can be reconciled by restyling my components, not by running both. `pnpm-lock.yaml`: his kept, regenerated with pnpm 10.33.4 (adds `@tanstack/react-query`, `lucide-react`, `zod`, `@playwright/test@1.63.0` for the web app and `twilio` for delivery); **Darren should review that lockfile diff**.

## 3. Framework and contract

I read the installed Next 16.4.3 docs listed by `apps/web/AGENTS.md` (`connection`, `use-search-params`, `page` params). Followed: dynamic `params` is a Promise (`use(params)`), `useSearchParams` sits inside `<Suspense>`, `connection()` makes the demo flag request-time. All API responses are parsed with `@afterhours/contracts` schemas from the merged candidate; no guessed fields, no CCR assumed.

## 4. Login return defect

Reproduced scenario on the merged candidate (my UI) with the real API: a session that is revoked on the server while the browser still holds the cookie, then a task deep link. Observed and tested: redirect to `/login?returnTo=<same path>`, sign in, land on the same task; with a query string preserved; a wrong password stays on login and keeps the target; a manual login with no target lands on `/`; logout revokes the token server-side and the private queue is unreachable afterward. Hostile targets are rejected by `safeReturnTo` (`//host`, `https://host`, backslash, `javascript:`, control characters, `/login`, empty): 13 unit cases plus browser checks that the login page loads with such values. I did **not** reproduce the defect on Darren's UI itself (it is no longer in this branch); his commit `79a35af` is his fix there.

## 5. Browser suite: it runs real tests

`scripts/e2e.mjs` (the file delegates it to Person 3) now starts an isolated real stack (API + worker + web on temp DB/artifacts, ports 3100/4100) and a second stack for the unconfigured-live-model failure (127.0.0.1:3101/4101), runs Playwright, and cleans only processes and folders it created. Exit codes: 0 passed; 1 failed; **3 a test was BLOCKED (never a pass)**; **4 no browser installed ("NOT RUN")**. The old "SKIPPED, exit 0" placeholder is gone; verified the missing-browser path with `PLAYWRIGHT_BROWSERS_PATH=/nonexistent` → exit 4. Root dependency/lockfile edits are limited to the regenerated lockfile above; **not yet coordinated with Darren** (he has not seen this branch).

## 6. Results on the committed candidate

All run in a **fresh clone** of `0e63c75` (`git clone --no-hardlinks`, clean status):

| Command | Exit | Result |
|---|---|---|
| `pnpm install --frozen-lockfile` | 0 | |
| `pnpm typecheck && pnpm lint && pnpm test && pnpm build` | 0 | 25 files, **311 tests** pass; `next build` ok |
| `pnpm test:e2e` | **0** | **26 tests: 25 passed, 1 skipped** (stub-engine failure test, not applicable because the engine is real); nothing BLOCKED |
| Darren's system QA harness (`qa/system-batch7`, `QA_REPO_ROOT` = this candidate) | 0 | 53 tests, 53 pass (API-level, UI-independent; shows the merge did not disturb platform, engine or the new delivery package) |

The browser suite uses the real API, worker and engine. Test names: see `tests/e2e/experience.spec.ts` (tests 1 to 25 incl. 24 login variants, 25 logout) and `failed-state.spec.ts` (17, 18).

## 12 role questions

1. **Where was the work; pushed ref** — Above. `origin/experience-batch7` `0e63c75` (+ docs commit), also `experience-batch6` `19a499e`. PASS.
2. **Darren's UI reconciled without loss** — PASS with a decision flag. Compared file by file (table), removed his duplicate routes in a named commit with restore points, nothing copied from an untracked directory. Darren must confirm the choice.
3. **Installed Next guidance, toolchain, contracts** — PASS (section 3; pnpm 10.33.4; typecheck and build clean on contracts).
4. **Expired-session task deep link returns to the safe task path** — PASS. e2e 21 (390 px) and 24 (query string, wrong password), e2e 7 (no session).
5. **External or malformed targets rejected without breaking login** — PASS at unit level (13 cases) and browser level for page load; a browser *login* completing with each hostile value is not exercised for every value (the same function guards them).
6. **`test:e2e` executes real browser tests** — PASS: 26 Playwright tests, 25 passed, exit 0; missing browser gives exit 4.
7. **Smoke uses real API/worker/engine/files and persistent review** — PASS: e2e 1 (proposal injected through the real demo endpoint, progress, ready, two previews, downloads, review, reload still approved, API says `approved`).
8. **Downloaded file integrity, current revision, slide count** — PASS for structure: e2e 1 inspects the downloaded ZIPs (`word/document.xml` text contains the preview title and USD 6,000; five `ppt/slides/slideN.xml` parts; all five slide titles from the preview appear in the PPTX); e2e 2 checks report numbers in DOCX text, deck text and native chart XML; the page also checks MIME, size and SHA-256 against the manifest before saving. Current revision: the UI shows only the API's current-revision artifacts and prints `revision N` on each card; a dedicated browser assertion that a revision-2 download differs from revision 1 is NOT RUN. Visual Office rendering: NOT RUN here (Joanne's audit covers rendering; LibreOffice opened earlier sample files).
9. **Phone, desktop, keyboard, offline defects** — PASS: e2e 9, 12, 19, 20, 21, 23 on 390 px and 1440 px; defects found and fixed earlier (long-content overflow, silent offline queueing, chart text size). Screen-reader pass: NOT RUN.
10. **Notification failure, stale worker, expired session leave work accessible** — PASS: blocked notification (e2e 15), stopped worker (manual run), revoked session (e2e 21). A real `accepted`/`failed (uncertain)` notification: NOT RUN (mock/unit wording only).
11. **Committed merged candidate passed the smoke** — PASS: fresh clone of `0e63c75`, table above. Not run on a different integration commit (Darren's own candidate `ae422e6` does not contain this UI).
12. **Remaining** — FAIL: none known. BLOCKED: live Gmail, live model, WhatsApp (no accounts). NOT RUN: Word rendering, Docker, remote host, real overnight, two team rehearsals, a revision-2 download assertion, Darren's confirmation of the UI choice and lockfile.

## 8 universal questions

1. Candidate and proof: `0e63c75`, proposal → ready → downloads → reviewed → reload (e2e 1) in a fresh clone.
2. Commands: table in section 6; old reports were not reused as evidence.
3. Preserved/integrated/missing: preserved my branches, Darren's UI commits and QA harness; integrated both packages' work; missing: Darren's confirmation and updating his release docs (they still say "UI = SpaceXAI", "delivery = stub", "browser suite NOT RUN" for his candidate).
4. Contract and expectations: tests follow the real engine contract; the ambiguous test failed on the newer engine because it validates answers, and I changed the *answers* to be valid (per stable question id), not the assertion.
5. Persisted state: tasks, files, review and settings persist across reload (e2e 1, 10, 22); download integrity checks pass.
6. Modes: demo intake, fixture intelligence, simulated outbox, unconfigured live model (failure stack). Labels are truthful; no live claim.
7. Boundaries: temp storage, owned processes only, no secrets, no external calls, no force push; settings changed by tests are restored.
8. Remaining: as in question 12; gates prevented: live-core, deployment, rehearsal, and Darren's candidate decision.

## Handoff

- **Darren:** confirm keeping this UI (or restyle it), review the lockfile diff and `scripts/e2e.mjs` (exit codes 0/1/3/4), fast-forward or merge `experience-batch7` into `integration/batch7`, update `docs/release/*` (they predate this UI, the delivery adapter and the browser suite), and rerun the browser smoke on your candidate hash.
- **Joanne:** none new. engine-batch6 now supplies real evidence quotes; e2e 16 ran and passed. Product titles still echo clarification answers if they are long (not asserted).
