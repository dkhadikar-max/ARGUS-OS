## v0.9.1 — Stability Fixes

Eight critical bugs found via architectural review + a real, budgeted live benchmark, fixed and committed separately with passing tests.

### Bug Fixes

- **#1** Decision cache key now includes the runtime path (`legacy` | `execution-runtime-v1`) — previously a request with `EXECUTION_RUNTIME_V1` off could be served a result the flagged runtime produced, for up to the cache's 24h TTL.
- **#2** Failed decisions now log the real accumulated token/cost usage before rethrowing — previously a decision that failed after several real (billable) stage calls left zero cost trace.
- **#3** Added `Decision.executionTraceId` (real Prisma migration) — the Controller's real per-decision history is now correlatable from a persisted Decision row, not only from structured logs.
- **#4** Budget exhaustion now gates on real `remainingCost` (derived from actual token cost) instead of a raw step count that treated every capability as equally expensive.
- **#5** Controller `escalate` now delivers a real Slack alert + audit entry to the team's configured channel — previously a logged no-op.
- **#6** `ControllerDecision.capabilityVisibilityMissing: boolean` — a structured, alertable signal distinguishing "no capability data was available" from a future caller silently failing to supply it.
- **#7** Circuit breaker around the single LLM provider — an Anthropic outage now fails fast (no wasted network round trips) instead of every request independently rediscovering the outage. Not a second provider; that stays deferred.
- **#8** Automated structural test (`prompt-schema-contract.test.ts`) verifying every prompt's `output_format` example shows every field its Zod schema requires, including nested array-item fields — runs in `npm test`, not just a manual checklist.

### Tests

- 584/584 passing (26 new)
- Typecheck clean at every commit
- Full local build (`npm run build`, matching CI's own steps) verified before this release

### Known Limits

- Bug #7: circuit breaker only, no second provider (deferred to the Decision Router phase, pending empirical local-vs-Claude likelihood measurement)
- Bug #8: catches structural schema drift (a required field missing from an example); does not catch cross-field semantic constraints or runtime model deviations from an already-correct prompt
