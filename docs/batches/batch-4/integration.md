# Batch 4 — integration record (Darren)

| Item | Status | Evidence |
|---|---|---|
| Shared baseline for Batch 4 | Not established | No engine fix branch, no experience branch on origin (checked `git branch -r` after fetch). |
| Batch 2 combined gate | **FAIL** | QA (`qa/system-batch3`, local) merged `platform` `aaed3db` + `person-2-engine` `258e2eb` as `4e1b5ae`: every real proposal/report task fails `ARTIFACT_INVALID` (DEF-1). Browser half BLOCKED. |
| Batch 3 combined gate | **FAIL / BLOCKED** | Same candidate: 32/53 system checks pass; DEF-1 (P0), DEF-2/3 (P1). |
| Batch 4 platform module | Implemented, unit-tested | `platform-batch4` `72ecb27`: 145 tests, typecheck/lint/build exit 0; proxy OAuth path verified without Google network. |
| Live core (Gmail → live model → files) | **BLOCKED** | No Google OAuth client/test account, no model key on this machine. |
| Live notification | **BLOCKED** | No Twilio credentials, eligibility not confirmed, no designated recipient. Outbox `simulated` remains the disclosed fallback. |

No merge into `platform` or `main` was made. Next integration candidate: `platform-batch4` + engine with DEF-1 fixed + experience branch.
