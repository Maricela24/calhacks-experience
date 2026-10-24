# Batch 5 report — Maricella (overnight review and failure experience)

Branch: `experience-batch6` (stacked work; see Batch 6). Candidate tested: local integration, tip `f08671a` = experience work + `origin/platform-batch5` `d11127b` + `origin/person-2-engine` `de6bd40`.
Mode: demo intake, fixture intelligence (real engine), outbox. Nothing live. No all-night run, no host sleep, no Docker.

## What changed in the UI and delivery

- Notification wording is derived from persisted state only (`describeNotification`): `failed` with `DELIVERY_UNCERTAIN` shows "Failed (uncertain)" and says the provider may have accepted it and that it will not be resent automatically (not a confirmed rejection); `blocked` with `POLICY_CHANGED` shows "Not sent (settings changed)"; queued says the time "is a plan, not a promise" (Darren: the scheduler can move it later); simulated, accepted and delivered stay distinct. No resend button.
- Task Notifications tab and Notifications page show **Files prepared** (the persisted ready event time; "Unavailable" if none), **Currently planned for** (the backend `scheduledFor`), and creation time, in the workspace timezone. The browser never computes a schedule.
- Offline: a banner says so; mutations use `networkMode: "always"` so an action while offline fails visibly instead of being queued and firing on reconnect; queries refresh when the connection returns.
- Expired or revoked session on a deep link returns to login with the safe path and then to the same task.
- Queued messages carry "placeholder, composed when sent"; chart text is larger on phones.

## Commands (exit codes)

| Command | Exit | Result |
|---|---|---|
| `pnpm typecheck && pnpm lint && pnpm test && pnpm build` | 0 | 274 tests pass |
| `pnpm test:e2e` | 3 (one BLOCKED) | 22 passed, 2 skipped |
| Worker stopped / restarted, real API + web + engine, temp DB | 0 | banner "The worker is not running", task page "Waiting for the worker" with badge "Queued (worker offline)", card "Waiting for the worker to start"; after the worker started the banner cleared and the task reached ready |
| Scripted time-compressed demo run (desktop 1440 and phone 390 screenshots inspected) | 0 | see Batch 6 |

## Role questions

1. **Prepared time and scheduled time in the correct timezone** — PASS. e2e 22 sets a quiet window around the current time in the workspace timezone through the real API, injects a proposal, waits for ready, and checks: notification `Queued`, "Currently planned for", "Files prepared", and that the shown time equals the API `scheduledFor` formatted in the workspace timezone and is in the future.
2. **What proves browser closure is not responsible** — Frontend: no timer or browser API is used to run work or send anything (polling only refreshes display; the only timers are object-URL cleanup after a download, toast dismissal, a redirect guard reset, and the elapsed-time display clock; a grep of `apps/web` found no others). Backend proof is Darren's: real worker process, browser pane closed, task finished and persisted (`docs/batches/batch-5/integration.md`, his UI, not mine). I did not close a browser on my own candidate: NOT RUN as an observation.
3. **Stale worker, retry, blocked, uncertain, accepted wording** — PASS for stale worker (manual run above), blocked (e2e 15, real worker), uncertain / policy-changed / accepted (unit tests on `describeNotification`; no real provider event exists). Retry/recovery events appear in the Activity timeline (stage and revision shown).
4. **Mobile notification link surviving session expiry** — PASS. e2e 21 on a 390 px viewport: server-revoked session, deep link → login with `returnTo=/tasks/<id>` → sign in → the same task.
5. **Offline / reconnect / download / stale revision without false success or duplicates** — PASS. e2e 20 (offline click fails visibly, nothing fires on reconnect, task still `ready`), e2e 23 (download failure shows an error, no file saved, retry then yields a real DOCX), e2e 8 and 13 (stale revision), e2e 17 (double-clicked retry makes one revision).
6. **Long content and keyboard/mobile** — PASS. e2e 19 (very long titles, filenames, text, wide tables at 390 px; no overflow, actions reachable; found and fixed a real overflow), e2e 12 (keyboard dialog open/close with focus restored, review by keyboard). Real-quote dialog on a phone: BLOCKED (engine `quote: null`).
7. **Delivery settings, provider, template paths** — Mock only. Exercised in unit tests with a fake client; blocked-by-configuration exercised against the real worker (e2e 15); no real provider call. Live paths BLOCKED.
8. **Valid work reviewable when notifications fail or Gmail is disconnected** — PASS. e2e 15 (blocked notification; download and review work). Gmail is disconnected in every test stack and tasks are fully reviewable.
9. **Times labeled without substitution** — PASS. "Unavailable" is shown when the ready event is absent; "Original email received" and "Entered the system" are separate (e2e 11).
10. **Schedule display follows the backend** — PASS. No client calculation of delivery time exists; the test compares with the API. DST and midnight policy are Darren's tested logic (`batch5-schedule.test.ts`); the UI shows his persisted result.
11. **Offline/remount/changed revision duplicating mutations or losing input** — PASS. Mutations only run in click handlers; in-flight guards on submit and retry; drafts survive a 409 and a 400 (e2e 13, 14); offline actions are not queued (e2e 20).
12. **Phone, desktop, keyboard tests for long content, source focus, downloads** — PASS where run: e2e 9, 12, 19, 21, 23, and manual inspection of 1440 px and 390 px screenshots of the real proposal and report.
13. **Delivery uncertainty and settings-change cases; retry risk** — The adapter has no retry and SDK retries are off, so it cannot resubmit a request that may have been accepted. The durable marker and `POLICY_CHANGED` are Darren's; UI wording tested in unit tests. No real provider case ran.
14. **Time-compressed morning rehearsal** — PARTIAL. Real API, worker and engine with synthetic files: request, preparation, queued notification with a real quiet window (e2e 22), review, download, refresh. Compressed: no overnight, quiet window of ~2 hours around now, fixture intelligence, outbox. Not observed: a real morning delivery, an all-night host.
15. **Missing dependencies and exposure in the UI** — Live Gmail, live model, WhatsApp: BLOCKED and shown as disconnected / not configured / blocked. Docker and host: NOT RUN (Darren). Engine evidence quotes: `quote: null` (Joanne), shown as "No excerpt was recorded". Darren's report says his own UI lost the deep link after session expiry; this UI keeps it (e2e 21).

## Universal questions

1. Input/output and candidate: quiet-hours task ready, notification queued with planned time (e2e 22) on `f08671a`.
2. Checks: table above.
3. Modes: fixture intelligence, demo intake, simulated outbox, controlled quiet window; **nothing live**.
4. Contract and schedule policy: matches the merged contracts; schedule comes from the API.
5. Failure: offline, expired session, failed download, blocked notification, stale revision all fail visibly without lost work.
6. Persistence: reviews, schedules and files verified across reload (e2e 1, 22, 23).
7. Boundaries: temporary stacks only; the e2e settings changes are restored in `finally`; no external messages or calls.
8. Remaining: BLOCKED live checks; NOT RUN browser-closed observation on my candidate, host sleep, Docker.
