# Runbook (platform)

## Local setup

```bash
pnpm install && pnpm setup:local && pnpm db:migrate && pnpm db:seed && pnpm check:ready
pnpm dev
```

`setup:local` is idempotent: it never overwrites an existing value in `.env`. The login password is
`APP_PASSWORD` in `.env`.

## Modes — always disclosed in the UI and status endpoint

- `GENERATION_MODE=fixture` (default): Person 2's fixture intelligence. Disclose as fixture output.
- `GENERATION_MODE=live`: requires `MODEL_PROVIDER=openai`, `MODEL_NAME` and `OPENAI_API_KEY` (the engine implements
  only OpenAI; `anthropic` fails with `MODEL_PROVIDER_UNSUPPORTED`). Anything missing → `GET /api/integrations` shows
  `model.configured=false`, `pnpm check:ready` prints an INFO line, and live tasks fail nonretryably with
  `MODEL_NOT_CONFIGURED` before the engine runs. There is never a fixture fallback.
  Mode and the organization profile are snapshotted per task at ingestion; changing them affects only new tasks.
- Demo injection (`ingestionMode=demo`) vs real Gmail (`ingestionMode=gmail`) is stored per task.

## Gmail (P1) — Google Cloud console steps

1. Create/choose a Google Cloud project. Enable **Gmail API**.
2. OAuth consent screen: User type **External**, publishing status **Testing**. Add the dedicated test inbox under
   **Test users**. Scope: `https://www.googleapis.com/auth/gmail.readonly` only.
3. Credentials → Create **OAuth client ID** → **Web application**. Authorized redirect URI must exactly equal
   `GOOGLE_REDIRECT_URI`, and `GOOGLE_REDIRECT_URI` must be exactly `PUBLIC_APP_URL` + `/api/integrations/gmail/callback`
   (local default `http://localhost:3000/api/integrations/gmail/callback`). It is the **browser-facing web origin**,
   never the private API port (4000/4177): the session cookie lives on the web origin and the Next proxy forwards
   `/api/*` to the API. A mismatch makes `pnpm check:ready` FAIL and Connect return `503 GMAIL_REDIRECT_MISMATCH`.
4. Put `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` in `.env`. Restart API and worker.
5. In the app: Settings → add the test sender to **allowed senders** (exact address) → Connect Gmail.
6. Send a new email from the allowed sender to the test inbox. The worker polls every
   `GMAIL_POLL_INTERVAL_SECONDS` (15 s). Only messages received after connecting are processed.

### Polling behaviour (Batch 4)

- History: a message whose Gmail `internalDate` is more than 30 s before `connectedAt` is never ingested. The listing
  itself overlaps 120 s behind the checkpoint; the handled-id list plus the unique `gmail:<integration>:<messageId>`
  source key make repeats harmless.
- Bounds per 15 s cycle: at most 5 list pages × 50 ids, at most 10 messages fetched, oldest first. The checkpoint
  only advances to the newest message actually processed.
- More than 250 new messages in the window: the window's end is halved and saved, nothing is processed that cycle,
  and halving repeats until the window lists completely. It is then drained oldest-first and reopened. The checkpoint
  never moves past an unlisted message.
- A malformed message is recorded in `intake_audit` (`malformed_message`) and skipped; it cannot block the inbox.
- Gating before any download, task or model call: exact allowed-sender match; an explicit `dmarc=fail` in Gmail's
  `Authentication-Results` for an allowed address is refused (`sender_authentication_failed`). Fixture `.example`
  addresses are never live senders unless the operator adds them. Unknown senders only add a bounded audit row.
- Gmail is read-only: no remote images, links or macros are fetched; HTML is reduced to text locally.
- Revoked/expired credentials pause polling (no calls to Google) until Reconnect. Quota/5xx errors keep polling.
- Disconnect deletes the stored tokens first, then revokes at Google. Each connection has a rotating
  `connection_token`; a token refresh or poll result from a disconnected or replaced connection is discarded.

Testing-mode limits: refresh tokens for unverified apps in Testing status expire after about 7 days; only listed test
users can connect. A successful test connection is **not** Google production verification.

### Gmail troubleshooting

| Symptom | Fix |
|---|---|
| `/settings?gmail=error&reason=session` or `invalid_state` | Start Connect again from the same logged-in browser tab within 10 minutes. |
| `reason=no_refresh_token` | Remove the app at myaccount.google.com/permissions, then reconnect (consent is forced). |
| Status `error`: "Reconnect Gmail in Settings" | Token revoked/expired (Testing tokens expire ~7 days). Disconnect and reconnect. Task history is kept. |
| `503 GMAIL_NOT_CONFIGURED` | Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. |
| `503 GMAIL_REDIRECT_MISMATCH` | Set `GOOGLE_REDIRECT_URI` to `PUBLIC_APP_URL` + `/api/integrations/gmail/callback`, and register that exact URI in Google Cloud. |
| `reason=scope` | The Gmail read permission was unticked on Google's consent screen. Connect again and allow it. |
| `reason=expired` | More than 10 minutes passed between Connect and the callback. Start again. |
| Mail ignored | Sender not in allowed senders (exact match), automation disabled, or message older than the connection. |

## Using a different API port locally

Port 4000 may be taken by another project. Three things read the API address and they must agree:

| Reader | Variable |
|---|---|
| API (`apps/api`) listens on | `API_PORT` |
| Web proxy (`apps/web/next.config.mjs`, `/api/*` → `/v1/*`) calls | `API_ORIGIN` |
| Demo CLI (`pnpm demo:proposal`, `demo:report`) calls | `API_ORIGIN` |

Set both to the same port. Use either your own untracked `.env` (git-ignored) or shell variables; never edit `.env.example` for a machine-specific port. Example with port 4177 and a throwaway database, using only shell variables:

```bash
export API_PORT=4177 API_ORIGIN=http://127.0.0.1:4177
export DATABASE_PATH=/tmp/ah-scratch/db.sqlite ARTIFACTS_DIR=/tmp/ah-scratch/artifacts
pnpm check:ready   # fails with "API_PORT matches API_ORIGIN" if the two disagree
pnpm dev
```

Shell variables win over `.env` values. If `API_ORIGIN` is left unset the default is port 4000 everywhere, so setting only `API_PORT` is a mismatch: `pnpm check:ready` fails and the API logs a warning at startup. Non-loopback origins (Docker Compose uses `http://api:4000`) are not checked. Verified together on 4177 for the API, the web proxy on port 3000 and the demo CLI (see `docs/batches/batch-2/darren.md`).

## Worker behaviour

- One engine job at a time; 90 s lease renewed every 15 s; 240 s hard deadline; at most 2 automatic attempts per
  revision (transient errors retried after ~30 s). Expired leases are recovered on start and every loop.
- `SIGTERM`/`SIGINT`: stops claiming, waits up to 10 s, then aborts and returns the job to the queue.
- Worker shows unhealthy if its heartbeat is older than 45 s.
- **A sleeping laptop stops all processing.** Overnight operation needs an always-on host with a persistent disk.
  A hackathon demo that compresses "overnight" into a few minutes must say it is time-compressed.

## Notifications

Default channel `outbox`: messages are composed and stored as `simulated`; nothing is sent. Live WhatsApp needs
Twilio credentials, `WHATSAPP_USE_CASE_ELIGIBLE=true` (operator-confirmed policy eligibility), an operator-designated
test recipient `TWILIO_WHATSAPP_TO`, and either an open customer-service window
(`WHATSAPP_CUSTOMER_SERVICE_WINDOW_UNTIL`) or an approved `TWILIO_CONTENT_SID`. The worker checks this from server
configuration before any provider code runs; otherwise the notification is `blocked` (terminal, no retry loop) with the
reason, also shown in `GET /api/integrations`. Live sends go only to `TWILIO_WHATSAPP_TO`: a different recipient typed
in Settings is refused, not used. `accepted` means provider acceptance only. A live send interrupted by a crash
is recorded as failed/uncertain and never resent automatically.

Quiet hours (Settings) delay delivery only; work continues. Results during quiet hours join one digest per local
date, delivered at `digestTime` (or when quiet hours end, if later).

## Deployment (single host)

```bash
cp .env.example .env   # fill secrets (or run pnpm setup:local), set PUBLIC_APP_URL + GOOGLE_REDIRECT_URI to the public HTTPS URL
docker compose up -d --build
```

- Only `web:3000` is published. Put HTTPS (reverse proxy or platform TLS) in front of it.
- `api` and `worker` share the `afterhours-var` volume (SQLite + artifacts). Do not run replicas or put SQLite on a
  network filesystem.
- Next bakes the `/api` rewrite target at build time (`API_ORIGIN` build arg, default `http://api:4000`).
- With an `https://` `PUBLIC_APP_URL`, session cookies are `Secure`.
- Backup: stop the worker, copy `var/afterhours.sqlite*` and `var/artifacts/` together.

The Docker path has not been exercised in this environment (see backend handoff).
