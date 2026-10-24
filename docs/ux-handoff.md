# UX handoff (Person 3)

## What exists

`apps/web` (Next 16 App Router, React 19, TanStack Query, lucide-react, plain CSS) and `packages/delivery`.

| Route | Purpose |
|---|---|
| `/login` | Password login (`POST /api/session`), `returnTo` limited to same-origin relative paths |
| `/` | Work queue: filters, cards, demo menu (only when the server reports `DEMO_ENABLED=true`) |
| `/tasks/[id]` | Review: summary, files, Content preview, review/answers/retry, tabs (request, plan, sources, activity, notifications) |
| `/notifications` | Notification history, honest per-state labels |
| `/settings` | Organization, Automation, Gmail, Model and worker, Notifications |

Auth is enforced by the API; the shell redirects to `/login?returnTo=…` on `authenticated:false` or any 401, and sign-out clears
the query cache. All requests use relative `/api/*`. Demo availability comes from a server component reading
`DEMO_ENABLED` at request time (no probing).

## API assumptions

Only the contract routes. Every response is parsed with the shared Zod schemas. Review/answers/retry send the revision from the
loaded task; a 409 (stale revision or invalid transition) shows "This task changed. Refresh to review the latest version.",
refetches, and never resubmits. Queue = up to 500 newest tasks in one list (5 pages × 100) filtered client-side with an explicit
"showing the most recent N" notice when capped; no contract amendment needed. Polling: queue/detail 2 s while active,
slower otherwise, off in hidden tabs, stopped on terminal states.

## Preview rendering

`ProductPreview` renders the same `WorkProduct` the files came from: document page, or slide navigator plus 16:9-style slide card
(layouts title, bullets, two_column, chart, closing). Tables scroll horizontally on phones. Charts are SVG drawn only from the
structured values, with an `aria-label` summary and a data table. Evidence chips open a native modal dialog (focus trap, Esc,
focus return) showing source title, locator, and quote, plus whether the quote really occurs in the extracted text. Unread
(unsupported/failed) sources are visibly flagged. Basis labels: Calculated, Recommendation, Assumption; a `source` block with no
evidence shows "No source reference".

Downloads fetch the file, then check it against the manifest (size, ZIP signature, content type, SHA-256 when the browser
supports it) before saving, and report success only afterwards. Failures show inline with a retry.

## Design notes

Palette from the brief. One deliberate change: secondary text is `#52687F` (not `#627D98`) and primary buttons use `#0F766E`
(accent `#14B8A6` stays for focus rings and highlights) so small text and white-on-teal meet WCAG AA contrast.

## Checks actually run

- `pnpm typecheck`, `pnpm lint`, `pnpm build` (incl. `next build`): pass. `pnpm test`: 87 tests pass (26 new in delivery).
- `pnpm test:e2e` (10 Playwright tests, isolated temp DB/artifacts, real API + worker + web): **10/10 pass, but against a local
  scratch engine, not Person 2's engine** (it was not on the remote yet). The scratch engine is not committed. **Re-run
  `pnpm test:e2e` after merging the real engine.** Assertions about content ("6,000", five slides, 12,000/15,000/3,000/25%)
  are the contract values and may expose differences in the real output.
- Tests cover: login/deep link/`returnTo` safety/CLI token scope; proposal flow with previews, source dialog, real downloads
  (ZIP signature and part names), mark reviewed + reload; CSV values in preview and chart; ambiguous answers → revision 2 →
  ready; duplicate `replayKey`; skipped without downloads; honest outbox labeling; stale review 409; 390 px layout (no
  horizontal overflow, ≥ 40 px review button); settings persistence.
- Also seen manually in a browser: failed state for `MODEL_NOT_CONFIGURED` (Settings link, retry), desktop and phone layouts.

## Not verified / remaining

- Real engine output, live model, live Gmail, live WhatsApp: none exercised from the UI.
- Downloaded files were checked as ZIP containers only; opening them in Word/PowerPoint was not done.
- Stale-worker banner and queued-while-worker-offline wording are implemented from `IntegrationStatus.worker.healthy` but not
  covered by an automated test. The needs_input → "retained answers" prefill is implemented, not separately tested.
- No keyboard-only or screen-reader audit beyond semantic markup; no automated a11y scan.
- Unsaved-changes guard covers browser unload and in-app nav links; browser back is not intercepted.
- The queue has no task preview pane (cards link to the detail page).
- Dev mode shows the Next.js dev indicator over the sidebar; not present in production builds.

## Integration notes for Person 1

- Dependencies added: `apps/web` (`@tanstack/react-query`, `lucide-react`, `zod`, `@playwright/test@1.63.0`), `packages/delivery`
  (`twilio`). `pnpm-lock.yaml` changed; regenerate/merge it with `pnpm install`.
- `scripts/e2e.mjs` (root) was replaced as the stub asked. `tests/e2e/package.json` sets CommonJS and `tests/e2e/tsconfig.json`
  maps `@playwright/test` to the web app's install, because the workspace does not include `tests/`.
- The e2e runner uses ports 3100/4100 (override with `E2E_WEB_PORT`/`E2E_API_PORT`) and a temp directory, never `var/`.
- Delivery: `DELIVERY_UNCERTAIN` must stay non-retryable (already handled in the worker).
