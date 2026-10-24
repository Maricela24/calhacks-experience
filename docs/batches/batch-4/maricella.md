# Batch 4 report — Maricella (web, delivery)

Branch: `experience-batch6` (Batches 4, 5 and 6 UX work are stacked on `experience-batch3`; see the Batch 6 report for the exact commits).
Candidate tested: local integration of `experience` work + `origin/platform-batch5` `d11127b` (includes Darren's Batch 4) + `origin/person-2-engine` `de6bd40`, tip `f08671a`. Not merged anywhere else.
Credentials: none existed. **Every live check is BLOCKED**: no Google OAuth client or test inbox, no model key, no eligible WhatsApp account or designated recipient.

## What was done

- Settings forms (organization, automation, approved senders, notifications with quiet hours and digest) save through `PATCH /api/settings`; dirty/saved/error states; the organization form now says each task keeps the profile it was created with, so saving changes new requests only. Credentials and eligibility are read-only status; there is no credential form.
- Gmail section reads `IntegrationStatus` only (state, account, connectedAt, lastPollAt, safe lastError). Connect is a navigation to the existing authenticated `/api/integrations/gmail/start`; the callback markers (`connected` and the error reasons including the new `not_configured`, `redirect_mismatch`, `scope`) are shown once and removed from the URL. "Connected" is never shown because a button was clicked.
- Ingestion mode and model mode are independent badges per task ("Demo email"/"Gmail", "Fixture output"/"Live model"); the header shows model mode and configured status.
- Twilio WhatsApp adapter behind the frozen delivery interface (done in Batch 1, reviewed here): eligibility, credentials, E.164 sender/recipient, public URL, open window versus approved Content SID with exact variables `{{1}}` task count and `{{2}}` review URL; `accepted` only with a provider message id; timeouts after submission are `DELIVERY_UNCERTAIN`, non-retryable; SDK retries disabled; 20 s timeout (well under the 60 s notification lease).

## Commands (exit codes) on the candidate

| Command | Exit | Result |
|---|---|---|
| `pnpm typecheck && pnpm lint && pnpm test && pnpm build` | 0 | 23 files, **274 tests** pass (26 delivery, 16 web render) |
| `pnpm test:e2e` | 3 (BLOCKED by design) | 24 tests: 22 passed, 2 skipped. Skipped: stub-failure test (engine is real, not applicable) and the real evidence-quote test (BLOCKED: engine returns `quote: null`) |

## Role questions

1. **Settings that persist; operator-only fields** — PASS for what ran. Organization name edit persists after reload (e2e 10); notification channel/recipient and quiet hours saved through the real API (e2e 15, 22). Operator-controlled values (credentials, eligibility, window, template, provider, model key) appear only as read-only status. Server rejection of unknown keys is Darren's (`SettingsPatchSchema` is strict in `platform-batch5`). Browser-reload persistence for the automation and sender-list forms: NOT RUN.
2. **Real callback proving Gmail connection** — **BLOCKED**. No Google credentials. The UI only displays what `GET /api/integrations` returns plus the callback marker; the marker map is code only, not unit-tested (NOT RUN).
3. **Ingestion and generation modes independent and truthful** — PASS. Badges read the two separate fields. e2e 17 shows a demo-injected task on a live-mode stack with "Live model not configured" in the header and "Demo email" on the task; Gmail + fixture and demo + live are separate by construction.
4. **Tests that missing eligibility/window/template block a send; template variable matching** — PASS (unit, mock client). `packages/delivery/test/delivery.test.ts`: not eligible, missing credentials, bad recipient/sender, closed window with no or malformed template → `blocked` and no client created; closed window with template → `contentSid` plus `contentVariables = {"1": count, "2": URL}` and no `body`.
5. **Outbox zero network; accepted versus delivered** — PASS (unit). Outbox never creates a provider client and never calls `fetch`; provider acceptance maps to `accepted`, never `delivered`. Not proven with a real provider.
6. **Timeout after possible submission; duplicates** — PASS (unit) for the adapter: timeout and unreadable responses are `DELIVERY_UNCERTAIN`, non-retryable; the adapter has no retry and SDK retries are off. The worker's durable submit marker that prevents a resend is Darren's (`batch5-notifications` tests). UI wording distinguishes uncertain from rejected and offers no resend (`describeNotification` unit tests).
7. **Actual eligible recipient or provider event** — **BLOCKED / NOT RUN**. None. Everything about WhatsApp is mocked.
8. **Phone link authenticates and opens the correct work without leaks** — PASS for links and login return. Message links are `PUBLIC_APP_URL/tasks/<id>` with encoded ids, only title and counts (unit); deep link → login → same task, including on a phone viewport with a revoked session (e2e 7, 21).
9. **API responses establishing Gmail connection, settings, worker health, model mode** — Worker health PASS (stopped/started worker, banner appears/clears, manual run on this candidate). Model mode PASS (`configured:false` shown, e2e 17). Settings PASS (above). Gmail connection **BLOCKED**.
10. **Times and modes independently truthful** — PASS. Original receipt versus ingestion (e2e 11); files prepared versus planned delivery (e2e 22); ingestion and generation modes separate; notification state separate.
11. **Guessed contract fields** — PASS (none). CCR-1 (`answerHistory`) is not read. Schemas come from `@afterhours/contracts` on the merged candidate and typecheck clean.
12. **Missing/ineligible setup blocks without changing ready work** — PASS (real API and worker). e2e 15 switches the channel to WhatsApp on a stack with no Twilio configuration: the notification is **Blocked** with the backend's reason, the files download, review works.
13. **Accepted versus delivered versus uncertain; no unintended messages** — PASS in unit tests with a mock client. The browser suites run on stacks without provider credentials, so nothing can be sent.
14. **Darren's separate QA session reproducing login/settings/review/download** — NOT RUN (no QA report seen on the remote). My own e2e covers it against the real stack.

## Universal questions

1. Input/output: demo proposal → ready → two real downloads → reviewed (e2e 1) on the candidate above.
2. Checks: table above.
3. Modes: demo intake, fixture intelligence (real engine), outbox simulated; a second stack with live mode and no key; **no** live Gmail, model or WhatsApp.
4. Contract: unchanged, no amendment. Darren's stricter settings patch is consistent with the forms.
5. Failure: missing model key shows a failed task with a Settings link; blocked notification keeps files; offline actions fail visibly.
6. Persistence: server-side; reload after review (e2e 1), settings (e2e 10).
7. Boundaries: fictional data, temp storage, no credentials, no external calls.
8. Remaining: BLOCKED live Gmail, live model, WhatsApp (owner: whoever holds the accounts; Darren for OAuth/runtime wiring); NOT RUN Darren's QA session; Joanne: evidence quotes.
