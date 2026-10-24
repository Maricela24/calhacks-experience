# Concept video claim check (40-second storyboard)

Owner: Maricella. Scope: align the storyboard's claims with what the working app actually does. I did not see, generate, edit, or publish any video file. This is a claim check against the application, not an inspection of the video.

Storyboard beats come from the conversation (black and white, fast: incoming email, logo, request and context, proposal and deck, night to morning, review, closing logo and tagline).

| Beat | What the video may show | Actual capability and evidence | Label required | Do not say |
|---|---|---|---|---|
| Incoming email, the problem | A client email asking for a proposal and deck | Real prototype flow: demo-injected fictional email through the same intake path as Gmail (e2e 1). **Live Gmail: BLOCKED** (no Google credentials) | If the email arriving "in an inbox" is drawn or animated: **"Concept demo"**. If prototype footage: say demo trigger | "Connected to your Gmail" |
| AfterHours logo | Logo reveal | Name and logo only | none | Affiliation with the visual-style reference brands; another company's logo |
| Request and context | Request, attachment, company profile | Original request tab, sources tab, organization profile (e2e 1, 11) | Fictional data only | |
| Proposal and deck creation | Real proposal and five-slide deck appearing | Real DOCX and PPTX from the engine in **fixture mode** (5 slides, USD 6,000 fee slide; LibreOffice opens all four sample files; Microsoft Office rendering NOT RUN) | If idealized layout: **"Illustrative workflow"** | "AI wrote it" (it is fixture intelligence in the demo); "Joanne's engine verified every claim" |
| Night to morning | A time lapse from evening to morning | Quiet hours scheduling is implemented and tested with controlled clocks and a ~4-minute real run (Darren, `docs/batches/batch-5/integration.md`). **No all-night run exists. Host sleep: NOT RUN** | **"Concept demo, time-compressed"** on screen for the whole sequence | "Ran overnight", "while you slept" as a measured fact; "your laptop can be closed" (a sleeping laptop stops processing; only a closed browser tab is proven, locally) |
| Ready for review | "Ready for review" card | Real status "Ready for review" for a completed draft (e2e 1) | In a mock: **"Concept demo"** | Any "sent", "submitted" or "delivered" wording |
| Review | User reviews and taps accept | "Mark reviewed" records acceptance only; it sends and submits nothing (e2e 1, persists after refresh) | | "Approved and sent to the client" |
| Notification | A phone buzzes | Outbox is simulated; WhatsApp live: BLOCKED (no eligible account); accepted is not delivered | A phone mock is **"Illustrative"**; never a real chat screenshot | A "delivered" tick; a fake WhatsApp thread |
| Closing line / tagline | Tagline and logo | Marketing copy | | Numbers: time saved, accuracy, users, price, customers, testimonials |

## Mismatches and corrections

1. **Overnight**: the video implies a full night. Evidence is a short real run plus controlled clocks. Fix: legible "Concept demo, time-compressed" for the whole scene, or show the real quiet-hours screen ("Currently planned for 8:00 AM") without the word overnight as a fact.
2. **No prompt needed**: true for approved senders once authorized, shown here through the demo trigger. Live Gmail is BLOCKED, so the video must not show the app reading a real inbox.
3. **AI**: the demo content is fixture intelligence. A live-model run is not demonstrated (BLOCKED). Avoid claiming AI quality, accuracy or speed ("seconds" in the app is a fixture run of about 3 seconds).
4. **"Ready for review"** must mean the real completed draft in the app, or be labeled concept.

Everything idealized carries a legible **Concept demo** or **Illustrative workflow** label, including in cropped exports. No stopwatch figures, no customer logos, no testimonials.
