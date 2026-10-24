> **SUPERSEDED** by `docs/release/demo-script.md` (final, with measured timing, roles and fallbacks). Kept for history.

# Demo script (2 to 3 minutes)

Say up front what is real and what is not: **the worker runs continuously, and "overnight" is time-compressed for this
demo.** The email below is a labeled demo email unless live Gmail is connected; say which. Do not claim time savings,
reliability, or demand.

## Before you start

- `pnpm dev`; sign in once so the queue is open. Header badges should read: model mode, Gmail state, notification channel.
- If the model is `Fixture mode`, say "fixture intelligence". If live and configured, say so. Never blur the two.
- Keep the Run demo menu closed; have the CSV and ambiguous scenarios ready.

## Script

1. **Standing instruction (15 s).** Settings → Automation: one approved sender, automation on, "prepare automatically".
   "Only this exact address can trigger work. I don't prompt per email." (Do not linger in settings.)
2. **The request arrives (20 s).** Trigger the email: live Gmail from the approved sender, or Run demo → *Proposal + kickoff
   deck* (badge: **Demo email**). Show the original request: a brief and an attachment, no prompt written.
3. **Real stages (20 s).** The task page moves through persisted stages (Planning, Generating, Checking sources,
   Exporting). Point out these come from the activity log, with no percentage or estimate. The worker did this, not the browser.
4. **The work (45 s).** *Ready for review*. Open the proposal preview, then the five-slide deck. Point to the **USD 6,000** fee
   and click its source chip to show the exact excerpt. Mention the Assumptions block and the "No source reference"
   warning behaviour. Say "Content preview" is a structured view; download both files and open them in Word/PowerPoint.
5. **Review (15 s).** *Mark reviewed*, explaining it records acceptance and sends nothing. Reload to show it persisted.
6. **Morning delivery (20 s).** Notifications page. In outbox mode: "this is the exact message, labeled **Simulated**; nothing
   reached a phone." If quiet hours are on, show the queued digest and its real morning time. If live WhatsApp was
   verified, say "provider accepted", not "delivered".
7. **Second proof (30 s).** Run demo → *Sales CSV report*: figures USD 12,000 → 15,000, +3,000, +25%, identical in the
   table, chart, and chart data. Or run *Ambiguous request* to show specific blocking questions and a new revision after
   answering.

## If something fails

Say so. A failed task shows its safe error code; a stopped worker shows a banner. Do not refresh until it "works".
