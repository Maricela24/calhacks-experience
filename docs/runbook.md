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
- `GENERATION_MODE=live`: requires `MODEL_PROVIDER` (`openai` | `anthropic`) and the matching API key. Missing key
  → `GET /api/integrations` shows `model.configured=false`, and tasks fail with `MODEL_NOT_CONFIGURED`.
  Mode is snapshotted per task at ingestion; changing it affects only new tasks.
- Demo injection (`ingestionMode=demo`) vs real Gmail (`ingestionMode=gmail`) is stored per task.

## Gmail (P1) — Google Cloud console steps

1. Create/choose a Google Cloud project. Enable **Gmail API**.
2. OAuth consent screen: User type **External**, publishing status **Testing**. Add the dedicated test inbox under
   **Test users**. Scope: `https://www.googleapis.com/auth/gmail.readonly` only.
3. Credentials → Create **OAuth client ID** → **Web application**. Authorized redirect URI must exactly equal
   `GOOGLE_REDIRECT_URI` (local default `http://localhost:3000/api/integrations/gmail/callback`).
4. Put `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` in `.env`. Restart API and worker.
5. In the app: Settings → add the test sender to **allowed senders** (exact address) → Connect Gmail.
6. Send a new email from the allowed sender to the test inbox. The worker polls every
   `GMAIL_POLL_INTERVAL_SECONDS` (15 s). Only messages received after connecting are processed.

Testing-mode limits: refresh tokens for unverified apps in Testing status expire after about 7 days; only listed test
users can connect. A successful test connection is **not** Google production verification.

### Gmail troubleshooting

| Symptom | Fix |
|---|---|
| `/settings?gmail=error&reason=session` or `invalid_state` | Start Connect again from the same logged-in browser tab within 10 minutes. |
| `reason=no_refresh_token` | Remove the app at myaccount.google.com/permissions, then reconnect (consent is forced). |
| Status `error`: "Reconnect Gmail in Settings" | Token revoked/expired (Testing tokens expire ~7 days). Disconnect and reconnect. Task history is kept. |
| `503 GMAIL_NOT_CONFIGURED` | Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. |
| Mail ignored | Sender not in allowed senders (exact match), automation disabled, or message older than the connection. |

## Worker behaviour

- One engine job at a time; 90 s lease renewed every 15 s; 240 s hard deadline; at most 2 automatic attempts per
  revision (transient errors retried after ~30 s). Expired leases are recovered on start and every loop.
- `SIGTERM`/`SIGINT`: stops claiming, waits up to 10 s, then aborts and returns the job to the queue.
- Worker shows unhealthy if its heartbeat is older than 45 s.
- **A sleeping laptop stops all processing.** Overnight operation needs an always-on host with a persistent disk.
  A hackathon demo that compresses "overnight" into a few minutes must say it is time-compressed.

## Notifications

Default channel `outbox`: messages are composed and stored as `simulated`; nothing is sent. Live WhatsApp needs
Twilio credentials, `WHATSAPP_USE_CASE_ELIGIBLE=true` (operator-confirmed policy eligibility), and either an open
customer-service window (`WHATSAPP_CUSTOMER_SERVICE_WINDOW_UNTIL`) or an approved `TWILIO_CONTENT_SID`. Otherwise
results are `blocked` with a reason. `accepted` means provider acceptance only. A live send interrupted by a crash
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
