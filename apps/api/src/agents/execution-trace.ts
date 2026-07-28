import type { JudgeAgentOutput } from "@argus/shared";
import type { StageId } from "./orchestrator.js";
import type { ControllerDecision } from "./controller.js";
import type { DecisionStateGraph } from "./decision-state-graph.js";

// v5.0 scaffolding, Increment 2 follow-up -- an immutable, operator-facing
// record of one real DecisionEngine.evaluate() run. Not for end users; for
// whoever needs to compare old-runtime vs new-engine behavior (shadow mode)
// or debug a specific execution after the fact. Built entirely from data
// evaluate() already has -- no new measurement, just a single place that
// collects it.
//
// Known, explicit gap: only built on the SUCCESS path today.
// attachUsageAndRethrow (orchestrator.ts) already attaches real usage to a
// thrown AppError on failure, shared with execution-runtime.ts and
// decision.service.ts's real error paths -- extending that shared function
// to also carry a partial ExecutionTrace would ripple beyond what's been
// tested here. Not built in this pass; a real limitation, not silently
// omitted.

export interface StageTiming {
  stage: StageId;
  latencyMs: number;
}

export interface StageCost {
  stage: StageId;
  tokens: number;
  costUsd: number;
}

export interface ExecutionTrace {
  requestId: string;
  packId: string;
  graph: DecisionStateGraph;
  /** Plural, not the single ControllerDecision execution-runtime.ts's
   *  ExecutionRuntimeResult carries -- Execution Runtime v1 (and this
   *  increment) only ever run one real cycle, so this is always
   *  length-1 today, but a real multi-cycle loop (out of scope for this
   *  increment) would append here, not require a shape change. */
  controllerDecisions: ControllerDecision[];
  executedNodes: StageId[];
  /** Plan nodes that did NOT run. Always [] today -- all 4 real agent
   *  stages, plus a possible invoke_capability re-run, always execute;
   *  nothing in the current Controller/Executor path ever skips a planned
   *  node. Real, not fabricated: kept as a genuine (currently always
   *  empty) field rather than omitted, since a future conditional
   *  skipIf-style plan (the original v5.0 proposal's CapabilityRequirement.skipIf,
   *  never built here) would need somewhere honest to report it. */
  skippedNodes: StageId[];
  synthesizerOutput: JudgeAgentOutput;
  timings: StageTiming[];
  costs: StageCost[];
}
