# ARGUS v4 — Adaptive Decision Operating System

Architecture North Star, frozen 2026-07-24. This document captures a
refinement of the existing v4 architecture, not a new version — see
"Naming" below. It exists to give future work (this repo's or a future
engineer's) a stable reference for what ARGUS is trying to be, independent
of which model or agent framework happens to implement it this year.

## Naming

Stays **v4**. Nothing here changes the architecture that's already been
built across Phases 0–10 (eval harness, LLM provider abstraction, Decision
Value, Evidence Graph, Conflict Surprise Score, Retriever Registry, Policy
versioning, Routing Optimizer, Learning Wiring, the 3-candidate benchmark).
Everything below is a refinement layered on top of that, using the same
"extend, don't replace" discipline the whole v4 roadmap has followed.

## North Star

> **Maximize decision value by spending only the reasoning necessary for
> the expected benefit.**

This supersedes the earlier framing ("spend the minimum reasoning required
to make the correct decision"). The refinement matters because "correct"
and "economically optimal" aren't always the same thing — a change that
improves accuracy 98.2% → 98.3% at 10x the cost is not a change ARGUS
should make. Decision Value (built, Phase 2) is the mechanism that already
captures this trade-off; the sections below describe wiring it in as the
actual optimization target rather than a metric that's only logged.

## One-sentence description

> ARGUS is an adaptive Decision Operating System that continuously learns
> the minimum reasoning required to maximize decision value for each
> organization.

Deliberately silent on multi-agent, Claude, debate, or graphs — those are
implementation details that should be free to change without this
sentence becoming false.

## Conceptual flow (target state)

```
Organization
     |
     v
Knowledge Assets (Evidence * Policies * Memory * Patterns)
     |
     v
Decision Complexity Engine
     |
     v
Execution Strategy Registry
     |
     v
Reasoning Engine (single_pass / micro_debate / executive_debate)
     |
     v
Decision
     |
     v
Outcome
     |
     v
Learning Engine
     |
     v
Reasoning Asset Evolution
     |
     +--> feeds back into Knowledge Assets
```

## Status of each stage against what's actually built

| Stage | Status | Where |
|---|---|---|
| Knowledge Assets | Partial | `EvidenceEdge` (Phase 3), `CompanyMemory`, `PolicyDefinition`/`PolicyVersion` (Phase 5) exist as separate models; not yet unified under one "Reasoning Asset" abstraction (Phase 13, planned, not started) |
| Decision Complexity Engine | Partial | [conflict-detector.ts](../apps/api/src/agents/conflict/conflict-detector.ts) + [conflict-surprise.ts](../apps/api/src/agents/conflict/conflict-surprise.ts) compute cv/spread/directional/surprise today via fixed thresholds (`POSITIVE_THRESHOLD=65`, `cv>0.25`, `maxSurprise>0.7/0.9`); not yet a versioned, learnable weighted model (Phase 12, planned — needs a concrete feature/weight design before it's built) |
| Execution Strategy Registry | Built | [execution-strategy.ts](../apps/api/src/agents/routing/execution-strategy.ts) — `EXECUTION_STRATEGY_REGISTRY`, an ordered list of strategy definitions (Phase 11) |
| Reasoning Engine | Built | [orchestrator.ts](../apps/api/src/agents/orchestrator.ts)'s 5-agent pipeline; Phase 9's benchmark is evaluating single-call and conflict-augmented alternatives against it |
| Decision / Outcome | Built | `decision.service.ts` / `outcome.service.ts` |
| Learning Engine | Built (human-in-the-loop only — see Decision 3 below) | `learning.service.ts`, `LearningRecommendation` (PENDING/ACTIONED/DISMISSED) |
| Decision Value as optimization target | Partial | `decision-value.service.ts` computes Decision Value and Decision Value/$ (used in Phase 9's benchmark metrics); not yet wired into the Routing Optimizer's actual routing decision (Phase 12 candidate) |

**Important caveat on Execution Strategy**: the registry (Phase 11) makes
the *selection* of a strategy name inspectable and extensible. It does
**not** yet make strategies "implement behavior" — nothing in
`orchestrator.ts` currently branches on the `ExecutionStrategy` value to
actually run fewer or more debate rounds. `determineExecutionStrategy` is
computed but not called from anywhere in the live decision pipeline yet.
Wiring it into real orchestration behavior is a separate, larger task
against `orchestrator.ts` itself and needs its own explicit go-ahead before
it's built, given how central that file is to every live decision made
today.

## Decisions locked by this freeze

1. **No v5 rename.** Everything above is v4.
2. **Decision Complexity Engine's thresholds are bootstrapping defaults,
   not permanent architecture.** They're expected to become a versioned,
   per-team weighted model — reusing the same `RoutingThresholdVersion`
   -style approval workflow already built for Phase 6 — rather than
   staying hardcoded forever.
3. **Execution Strategy enum values become Strategy Registry entries.**
   Policies select strategies; strategies (eventually) implement behavior.
4. **Decision Value / Reasoning Cost becomes the framing for any future
   routing decision**, not just a metric that gets logged after the fact.
5. **The organizational learning loop is wider than currently built:**
   Decision → Outcome → Knowledge → Policy → Retriever → Routing →
   Complexity → next Decision, not the narrower Decision → Outcome →
   Retriever/Policy loop built so far.
6. **"Reasoning Asset"** (Policy, Evidence, Pattern, Retriever, Threshold,
   Prompt, Strategy — each versioned, owned, approved, and tracked for
   effectiveness) is the target unifying abstraction for the Learning
   Engine. Planned (Phase 13), not yet built — no code today unifies these
   under one model.

## Open design questions before Phase 12 / Phase 13 can be built

These are listed here rather than guessed at in code:

- **Phase 12 (Decision Complexity weight-learning):** what exact feature
  set feeds the weighted score (cv, directional, surprise, and then what —
  evidence quality and novelty need their own defined computations, which
  don't exist yet), what triggers a re-weighting (a fixed decision count
  like "100,000 decisions", a scheduled job, an admin-triggered
  recompute?), and what happens to `RoutingThresholds`' existing two-field
  shape when it's replaced by an N-feature weighted model — is it
  superseded outright or does it coexist as a simpler fallback tier.
- **Phase 13 (Reasoning Asset):** Policy, Evidence, Pattern, Retriever,
  Threshold, Prompt, and Strategy are structurally very different today
  (different Prisma models, different owners, different approval flows).
  A real schema needs to decide whether "Reasoning Asset" is a new base
  table each of these extends, a shared interface implemented by existing
  tables without a schema change, or a metadata-only wrapper layered on
  top — each has very different migration cost and blast radius.
