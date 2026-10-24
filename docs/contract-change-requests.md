# Contract change requests

Propose the smallest amendment here, on your own branch, and tell Person 1. Only Person 1 merges an approved
amendment into `docs/CONTRACT.md` and `packages/contracts`.

Template:

```text
ID: CCR-<n>
Requested by / role:
Blocker (what cannot be built without it):
Proposed change (exact names/types/routes):
Compatibility impact on other owners:
Status: proposed | approved | rejected | merged (commit)
```

## Open

```text
ID: CCR-1
Requested by / role: Darren (Person 1), on behalf of the clarification UI (Maricella) — PROPOSAL ONLY, not implemented
Blocker (what cannot be built without it): After a clarification round, `TaskDetail.questions` is empty and
  `TaskDetail.answers` holds only `{ questionId, answer }`. The UI cannot show "what was asked" next to a retained
  answer. The question text is stored (`answer_history.question`) but not exposed. `plan.questions` is overwritten
  by later revisions.
Proposed change: add an optional field to `TaskDetail`: `answerHistory?: Array<{ revision: number; questionId: string;
  question: string; answer: string; createdAt: string }>`, ordered by revision then creation. Additive and optional;
  no route changes.
Compatibility impact on other owners: Maricella may ignore it; Joanne unaffected. Zod schema gains one optional key.
Status: proposed (needs Maricella's yes before Darren merges it). Workaround today: show the answers by
  questionId, or render the question text from the earlier needs_input event messages.
```

## Platform notes (not amendments)

- Batch 4 (Darren): `SettingsPatchSchema` is now strict at every nesting level (`organization`, `organization.brand`,
  `notifications`, `notifications.quietHours`). Unknown keys return 400 instead of being dropped silently, so the
  browser cannot believe it set credentials or eligibility. Field checks added in the data layer: recipient E.164 or
  null, brand colors `#RRGGBB`, currency 3 uppercase letters, organization text length caps. No route, type or
  response shape changed. Maricella: send only the documented editable fields.

- Node: the spec prefers Node 24 LTS. The shared dev machines run Node 20.x, so the workspace targets
  `node >=20.12` and pins `better-sqlite3@12` (v13 requires Node 22+). The Docker image uses Node 22.
  Switching everyone to Node 24 later only needs `better-sqlite3` re-evaluated.
