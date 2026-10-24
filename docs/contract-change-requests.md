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

None.

## Platform notes (not amendments)

- Node: the spec prefers Node 24 LTS. The shared dev machines run Node 20.x, so the workspace targets
  `node >=20.12` and pins `better-sqlite3@12` (v13 requires Node 22+). The Docker image uses Node 22.
  Switching everyone to Node 24 later only needs `better-sqlite3` re-evaluated.
