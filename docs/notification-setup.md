# Notification setup (Person 3)

Package: `@afterhours/delivery` (server-only; the worker calls it, the browser never imports it).
Exports: `sendNotification(input)`, `composeNotification(input)`, `DeliveryError`.

## Channels

| Channel | Behaviour | Needs |
|---|---|---|
| `outbox` (default) | Composes the exact message and returns `simulated`. No network request. Nothing reaches a phone. | Nothing. |
| `whatsapp` | Official Twilio WhatsApp API only. Returns `accepted` (provider took the request), `blocked` (nothing sent, reason stored), or throws `DeliveryError`. Never returns `delivered`. | Everything below. |

The dashboard labels `simulated`, `accepted`, `blocked`, `failed` separately, and says "not sent" for outbox messages.

## Eligibility prerequisite (operator decision, not a code switch)

WhatsApp's current platform policy may restrict general-purpose AI assistants. Before enabling live delivery, confirm this
use case is permitted for your account and region. A sandbox, an approved template, or having a Twilio account is **not**
proof of eligibility. Only then set `WHATSAPP_USE_CASE_ELIGIBLE=true`. The browser cannot change it. While it is not
`true`, every WhatsApp send is `blocked` with that reason and the result stays in the dashboard.

## Environment variables (server only)

| Variable | Used for |
|---|---|
| `NOTIFICATION_CHANNEL` | `outbox` or `whatsapp` initial channel (editable in Settings) |
| `PUBLIC_APP_URL` | Base of the review link. Must be a valid http(s) URL without credentials. |
| `WHATSAPP_USE_CASE_ELIGIBLE` | Must be `true` for any live send |
| `WHATSAPP_CUSTOMER_SERVICE_WINDOW_UNTIL` | ISO time; the worker turns it into `customerServiceWindowOpen` |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` | Credentials. Never logged; scrubbed from error text. |
| `TWILIO_WHATSAPP_FROM` | Sender, `+E164` or `whatsapp:+E164` (the sandbox number works for sandbox tests) |
| `TWILIO_WHATSAPP_TO` | Fallback recipient (Settings recipient wins; the worker does that fallback) |
| `TWILIO_CONTENT_SID` | Approved template SID (`HX` + 32 hex), for sends outside the 24 h window |

## Send rules

1. Not eligible, any credential missing, bad `FROM`/recipient format, or an unusable `PUBLIC_APP_URL`: `blocked` with a safe reason (names missing variables, never values).
2. Window open: free-form body (the composed notification) to the configured recipient.
3. Window closed: only a template send with `contentSid` and `contentVariables`, never a dynamic body. No valid `TWILIO_CONTENT_SID` means `blocked`.

### Approved template variable contract

Create the template in Twilio/WhatsApp with exactly two variables, and get it approved:

```text
{{1}} = number of results ready for review (integer as text)
{{2}} = review URL (single task link, or the queue link for a digest)
```

Example body: `You have {{1}} result(s) ready to review in AfterHours: {{2}}`. If your approved template differs, change
`sendWhatsApp` in `packages/delivery/src/whatsapp.ts` to match; do not send variables a template does not declare.

## Errors and retries (the worker owns retries)

| Code | Retryable | Meaning |
|---|---|---|
| `DELIVERY_AUTH` | no | 401/403 from provider |
| `DELIVERY_RATE_LIMITED` | yes | 429 |
| `DELIVERY_PROVIDER_ERROR` | yes | provider 5xx |
| `DELIVERY_NETWORK` | yes | DNS/connection failure before submission |
| `DELIVERY_REJECTED` | no | other 4xx (bad recipient, template, sandbox opt-in), or provider status `failed` immediately |
| `DELIVERY_UNCERTAIN` | **no** | timeout or unreadable response after submission. Acceptance unknown. The worker records `failed` with an explanation and must not resend automatically. |

The Twilio SDK's own retries are disabled (`autoRetry: false`) and the call has a 20 s timeout, so there is one retry layer.
Error text is redacted: phone numbers, Twilio SIDs, and the configured secrets are removed.

## Message content

One task: `Ready to review: <title>.` / `<n> files prepared. Review: <PUBLIC_APP_URL>/tasks/<id>`.
Several: `Good morning. N requests are ready for review.`, up to 5 bullet titles, `…and K more`, then the queue link.
Titles are flattened, stripped of links and control characters, and cut to 80 characters; the message is capped at 1000
characters. No email body, source text, or attachment content is ever included.

## Tested versus untested

- Tested (`pnpm test`, `packages/delivery/test/delivery.test.ts`, 26 tests, mocked provider client): composition, outbox
  makes no request, every blocked condition, template mapping, open-window send, accepted-not-delivered, error mapping,
  redaction.
- **Not tested: any real Twilio request.** No credentials or approved template were available. A live send must be
  verified by the team with their own account before claiming it works.
- Not built: delivery status callbacks (P2). Without one, `accepted` is as far as a notification ever goes.
