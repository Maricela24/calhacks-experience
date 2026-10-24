# Batch 7 — integration record (Darren)

One committed integration candidate now contains the platform, the real engine and the chosen UI. Everything below was observed on it. Reports from earlier batches are history, not evidence for this commit.

## Candidate

| Item | Value |
|---|---|
| Branch | `integration/batch7` |
| **Tested implementation candidate** | `ae422e6a63c897078c4fea07aeb7a8dd17f1f6bd` (`ae422e6`), a merge commit |
| Parent 1 (platform + UI + Darren's Batch 6 work) | `platform-batch6` @ `fef9396c52ef0499177f6194906d7e72b6f18037` (pushed) |
| Parent 2 (engine) | Joanne's `engine-batch6` @ `b31399861ba327affeed782ee47154ebf95ad4f0` (`b313998`, pushed by her; contains `engine-batch5` @ `0bf8819`) |
| Later commits | docs-only (`docs/batches/batch-7/*`, banners in `docs/release/*`). `git diff ae422e6 HEAD --stat` lists only `docs/` paths. They were not re-run. |
| Lockfile / manifests | `git diff platform-batch6 HEAD -- pnpm-lock.yaml package.json` is empty (0 lines). `pnpm install --frozen-lockfile` exit 0 on pnpm 10.33.4 (Corepack shim), Node v20.20.2. |
| Optional QA harness | `qa/system-batch7` (parent `ae422e6`; tests and QA docs only) |

## Refs observed today (the packet's snapshot was partly superseded)

| Ref | Tip | Versus the packet |
|---|---|---|
| `origin/main` | `5d8f342` | same |
| `origin/person-2-engine` | `de6bd40` | same |
| `origin/platform` | `aaed3db` | same |
| `origin/platform-batch4` | `700d7a6` | same (local `af24fef` is three commits ahead, unpushed; they are already ancestors of `platform-batch5`) |
| `origin/platform-batch5` | `d11127b` | same |
| `origin/platform-batch6` | `fef9396` | **new**, pushed by Darren (contains Batch 5, the engine, the UI and the return-path fix) |
| `origin/engine-batch5` | `0bf8819` | **new** (Joanne) |
| `origin/engine-batch6` | `b313998` | **new** (Joanne) |
| experience / Maricella branch | none | still absent, so no second UI exists to reconcile |

## Preserved local work

| Work | Where it is now |
|---|---|
| Uncommitted SpaceXAI UI in the main checkout (`ui/spacexai-style`) | The ten files under `apps/web/app` are byte-identical (SHA-1 compared file by file) to commit `664cc98` on `platform-batch6`. The main checkout was not modified. |
| QA harness (`tests/system`, `docs/qa`) | Was local only on `qa/system-batch3` @ `1cee0ca` (that branch also holds `4e1b5ae`, a local engine-into-platform merge). The two QA-only commits are cherry-picked onto `qa/system-batch7`; the original branch is untouched. |
| Batch 5 logo files (`brand/`, untracked in the b5 worktree) | untouched, not part of this candidate |

**UI in the candidate:** Darren's SpaceXAI-style UI (author Darren; snapshot `664cc98`, return-path fix `79a35af`, `1e29d42`). It is not Maricella's work. If she pushes a different frontend, it has to be reconciled with this one on purpose.

## What the merge did

- `git merge origin/engine-batch6` conflicted in two files, both engine-owned: `packages/engine/src/content.ts`, `packages/engine/src/render/docx.ts`. Both sides had independently fixed the same release defects (DEF-2 report narrative, DEF-4 table grid). Resolution: take Joanne's files whole. Darren's engine commits `8bcdbb4`, `15b15f8`, `f6e3be1`, `68ea1ec` are therefore superseded in those two files; nothing was combined by hand.
- `packages/engine/src/planning.ts` auto-merged. It keeps Darren's DEF-6 "skipped message is not a proposal" title and Joanne's new answer-validation code.
- `packages/engine/test/engine.test.ts`: the four DEF regression groups were kept. DEF-2 and DEF-4 asserted the old wording and an old 9000-twip width; they now assert values, direction and the page width (9746 twips) instead. No test was removed. DEF-3 and DEF-6 are unchanged and pass.
- Platform code, tests (`apps/worker`, `apps/api`, `packages/data`) and the lockfile are unchanged by the merge.

## Commands and exit codes (candidate `ae422e6`, clean worktree, scratch `.env`, scratch DB)

| Command | Exit | Observed |
|---|---|---|
| `pnpm install --frozen-lockfile` | 0 | lockfile unchanged |
| `pnpm check:ready` (after `pnpm setup:local` wrote a scratch `.env`) | 0 | config, migrations, ports, engine and delivery load; `generation=fixture, notifications=outbox, demo=true`; Gmail INFO not configured. Without a `.env` it exits 1, as designed. |
| `pnpm typecheck` | 0 | |
| `pnpm lint` | 0 | |
| `pnpm test` | 0 | 24 files, 272 tests |
| `pnpm vitest run packages/engine` | 0 | 3 files, 52 tests |
| `pnpm build` | 0 | built with `API_ORIGIN=http://127.0.0.1:4627` |
| `pnpm test:e2e` | 0 | prints `SKIPPED: tests/e2e is empty.` **Browser suite: NOT RUN.** Exit 0 is not a pass. |
| QA harness, inherited expectations | 1 | 53 tests, 49 pass, 4 fail (A3, A4, H5, H6) |
| QA harness, after four reconciled expectations | 0 | 53 tests, 53 pass (`docs/qa/batch-7-verification.md`) |

## Real services, real UI, one task (local, fixture mode)

Processes started by me and stopped by me: API on 4627, worker, built Next on 3627, scratch DB and artifacts under `var/b7/`. The API and worker logs held no level-50 entries across both runs.

1. Unauthenticated `GET /api/tasks/<id>` → 401. Browser to `/tasks/<id>` redirected to `/login?next=%2Ftasks%2F<id>`; after sign-in the browser landed on `/tasks/<id>` (deep-link return PASS, same-origin relative path only).
2. `pnpm demo:proposal` (demo command line) queued task `6882d722-6845-4d5c-9e14-4b2a757de688` (ingestion `demo`, generation `fixture`). It reached `ready`, revision 1. The page showed "Demo email", "Fixture intelligence", the plan, the progress log, the content preview, the sources and the simulated-outbox notification ("not sent to a phone").
3. Content: proposal with 10 blocks and a five-slide deck. Fee `USD 6,000` (quoted from the brief and the company profile). Schedule "Starts October 26, 2026; 4 calendar weeks". Draft due "Monday, October 26, 2026 at 9:00 AM PDT" on its own row. Payment milestones "Not stated in the sources; to be agreed".
4. Downloads through the browser session: both HTTP 200, `Cache-Control: private, no-store`, correct MIME, size and SHA-256 equal the manifest.

   | Artifact id | File | Bytes | SHA-256 (first 16 hex; the full value is in the manifest) |
   |---|---|---|---|
   | `art_05c90bb0038d4eb8cb1e917f497c61d8` | `Maple-Moss-Proposal-r1.docx` | 11923 | `02aa09889f1946c3…` |
   | `art_dbcec1ebaf344e1bfc1b4f52e66e7652` | `Maple-Moss-Kickoff-Deck-r1.pptx` | 101280 | `b4584e1de38b5548…` |

   Structural check on the downloaded copies: both ZIPs pass `testzip`; the PPTX has 5 slides; the DOCX has 2 tables, both `fixed` layout, smallest `gridCol` 1671 twips, and contains the fee and start date. **Visual rendering was not performed on this candidate.** Joanne's audit rendered the same engine in PowerPoint and Quick Look on her merged audit tree (`docs/release/artifact-audit.md`); that is her evidence for her tree, not mine.
5. Clicked **Mark reviewed**: "Marked reviewed. Nothing was sent." Then I killed and restarted the API and worker, reloaded the page: the session cookie still worked, the page still said "Marked reviewed", and `GET /api/tasks/<id>` returned `status: approved`, revision 1. No submission to a client exists in the product.
6. `pnpm demo:report` → task `3e6de0b2-e9a2-49cd-ad22-76a3f54c43d7`, `ready` ("January-February sales performance update"). Report, clarification (revision 2), no-action, replay dedupe, stale review, access and CLI scope are covered by the 53 harness checks through the real API and worker, not by this manual run.

## QA failures: triage

IDs were taken from `docs/qa/defects.md` and the harness test names, not guessed.

| ID | Owner | Expected contract | Observed originally | Class | Now |
|---|---|---|---|---|---|
| DEF-2 / C4, C5, C6, H6 | Joanne | narrative follows computed values | hard-coded "grew 25%", "AOV remained $100" | code defect | PASS with Joanne's `content.ts`; Darren's `68ea1ec` superseded. |
| DEF-3 / D7 | Joanne | no "four-week" next to a three-week answer | hard-coded labels | code defect | PASS with Joanne's `content.ts` (Darren's `f6e3be1` is superseded in that file) |
| DEF-4 / N3.x | Joanne | DOCX tables have a real grid | `gridCol` 100 twips | code defect | PASS (fixed layout, content-proportional widths) |
| DEF-6 | Darren (in Joanne's package) | skipped message is not a proposal | plan title "launch strategy proposal" | code defect | PASS (`15b15f8`, kept through the merge) |
| A4 | QA | start date and duration in the preview | expected an end date `October 26-November 22, 2026` that the email never states | **stale expectation** | PASS after the assertion change |
| A3 | QA | unknown payment milestones are flagged | wording "Not stated … to be agreed" | **stale expectation** | PASS after the assertion change |
| H5 | QA | zero base is flagged, never a number | "Not computable" | **stale expectation** | PASS after the assertion change |
| H6 | QA | AOV unknown for a zero-order month | label "February 2026", "unknown (no orders)" | **stale expectation** (negative assertions kept) | PASS after the assertion change |
| A5 | QA | quotes must match their source | null quotes allowed by the contract | stale expectation | PASS (needed no change) |
| I1 | Joanne | injection-only brief is not a substantive ready proposal | ready outcome, no leak | needs material-fact analysis | PASS |

## Unresolved

| Item | Status | Owner / path |
|---|---|---|
| Browser test suite | **NOT RUN.** `tests/e2e` is empty; `scripts/e2e.mjs` delegates to Person 3. | Maricella; this batch did not change her package |
| Maricella's frontend / reconciliation with the SpaceXAI UI | BLOCKED, no branch on origin | Maricella pushes it; Darren reconciles |
| Delivery adapter (`packages/delivery`) | foundation stub; outbox `simulated`, live always `blocked` | Maricella, then WhatsApp eligibility |
| Evidence chips show raw source ids | P2 | Maricella (web) |
| Word rendering of DOCX | NOT RUN | anyone with Word |
| Live Gmail, live model, WhatsApp | NOT RUN / BLOCKED (no credentials or eligible account) | external |
| Docker, remote host, overnight run | NOT RUN | needs a host |
| Batch 5/6 durability evidence (restart, quiet hours, backup) | reused, unchanged code: `packages/data`, `apps/api`, `apps/worker` are identical to `platform-batch6`; I re-ran one API/worker restart only | see `docs/release/capability-matrix.md` |

## Next tested commands

```bash
git switch integration/batch7
corepack pnpm install --frozen-lockfile
corepack pnpm setup:local          # writes an untracked .env with generated secrets
corepack pnpm check:ready
corepack pnpm dev                  # web, api, worker
corepack pnpm demo:proposal        # then open the printed URL and sign in
QA_REPO_ROOT="$PWD" node --import tsx --test <path-to-qa-worktree>/tests/system/*.test.mjs
```
