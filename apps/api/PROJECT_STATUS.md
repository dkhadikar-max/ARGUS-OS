# Project Status — v5.0 Compiler Architecture / Gate Progression

Last updated: 2026-07-31 (Gate 3 Increment 1.5)

| Gate | Status | Notes |
|---|---|---|
| Gate 1 — Architecture Freeze | ✅ Complete | 7 engine files frozen since `6f73804`; verified untouched via `git diff --stat` after every subsequent increment except one explicitly authorized, additive change (Gate 3 Increment 1.5's `decision-engine.ts` edit — see below). |
| Gate 2 — Replay | ⏸️ Incomplete (external blocker) | 10/51 fixtures valid; 41/51 blocked on an Anthropic account credit exhaustion (confirmed via the real API error, not an architecture defect). See `GATE2_REPLAY_REPORT.md`. Resume tooling (`eval/run-replay-resume.ts`) is built and ready — re-run is a $0 cost check away once credits are confirmed active for the right org. |
| Gate 3 Increment 1 — Shadow Runner | ✅ Complete | `evaluate()` runs in shadow on a sampled % of real traffic, persists to `ShadowDecision`, fire-and-forget, fault-isolated. `SHADOW_MODE_ENABLED=false`, `SHADOW_SAMPLE_RATE_PERCENT=0` by default — inert. See commit `8b9f2b7`. |
| Gate 3 Increment 1.5 — Shadow Runner safety hardening | ✅ Complete | Concurrency cap (`SHADOW_MAX_CONCURRENT`, default 2, per-process, drops excess samples rather than queuing — `agents/shadow-concurrency.ts`) + independent wall-clock timeout (`SHADOW_TIMEOUT_MS`, default 180000ms — `agents/shadow-timeout.ts`) + an independent `CircuitBreakerProvider`/`ClaudeProvider` instance for all 5 real LLM calls a shadow run makes (`shadow-runner.service.ts`'s `shadowLlmProvider`), fully isolated from `orchestrator.ts`'s live-path breaker singleton. The last piece required an additive, backward-compatible change to `decision-engine.ts`'s `evaluate()` signature (a new optional trailing `options: {synthesizer?, stageExecutor?}`) — explicitly authorized this session as the one deviation from Gate 1's zero-frozen-file-changes streak, with its own dedicated regression test (`decision-engine.test.ts`) proving the override point is actually used, not just present in source. |
| Gate 3 Increment 2 — Dashboard + operational metrics | ✅ Complete | Decision Explorer (Shadow Decisions list + tabbed detail page: Overview/Evidence/Agent Outputs/Execution Trace) and a Shadow Mode analytics dashboard (KPI cards, volume-by-day and disagreement-breakdown charts, date-range selector) — commits `3df3229`, `c951cb6`. Metrics still have nothing real to show until sampling is raised above 0% somewhere. |
| Gate 4 — Production Cutover | ⛔ Blocked | Requires Gate 2 complete + Gate 3 validated under real sampled traffic. Gate 3's infrastructure and safety hardening are both now in place; a cautious rollout above 0% sampling is the next real step once Gate 2 completes. Not authorized, not close. |

## Why this file exists

Kept as a single, current source of truth for gate status — matches the
existing convention of `GATE2_REPLAY_AUTHORIZATION.md`/`GATE2_REPLAY_REPORT.md`
for Gate 2 specifically, but tracks the whole progression in one place so
it doesn't need to be reconstructed from commit history each time.
