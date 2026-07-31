import { randomUUID } from "node:crypto";
import { agentDebateOutputSchema, type AgentDebateOutput } from "@argus/shared";
import { attachUsageAndRethrow, type DecisionAgentInput, type StageId, type StageOutputs, type TokenUsageAccumulator } from "./orchestrator.js";
import type { DecisionPack } from "./decision-pack.js";
import { buildAgentStageCapabilities } from "./reasoning-capability.js";
import type { ExecutionContext, ExecutionIdentity, ReasoningCapability, AgentStageCapabilityInput, CapabilityOutputsByStage, StageExecutor } from "./reasoning-capability.js";
import { plan } from "./planner.js";
import { runPlan, type CapabilityResolver } from "./executor.js";
import { createCallAgentDecisionSynthesizer, type DecisionSynthesizer } from "./decision-synthesizer.js";
import { buildInterimDecisionState } from "./decision-state.js";
import { decide, DEFAULT_CONTROLLER_POLICY, type ControllerDecision, type ControllerPolicy } from "./controller.js";
import { deriveBudgetSnapshot, NO_REAL_COMPLEXITY_SCORE_AVAILABLE } from "./budget-manager.js";
import { createDecisionStateGraph, appendState, type DecisionStateGraph } from "./decision-state-graph.js";
import { calculateInferenceCostUsd } from "./decision-value.service.js";
import { CLAUDE_MODEL } from "./claude-client.js";
import type { ExecutionTrace, StageTiming, StageCost, SynthesizerVerdictSummary } from "./execution-trace.js";
import { logger } from "../lib/logger.js";

// v5.0 scaffolding, Increment 2 -- the single public entry point wiring
// Planner -> Executor -> the existing, unmodified Controller
// (controller.ts's decide()) -> the same real DecisionState/BudgetSnapshot
// machinery execution-runtime.ts already established -> a
// DecisionSynthesizer for the final verdict. Deliberately does NOT expose
// execution-runtime.ts's ExecutionRuntimeResult as its own public contract
// -- DecisionEngine is a new, independent entry point, not a thin
// re-export of someone else's shape, even though the real fields
// substantially overlap today (both are describing the same real
// checkpoint-then-verdict flow).
//
// Critical, explicit constraint: evaluate() does NOT persist to the
// database and is NOT wired into decision.service.ts's live call site in
// this increment -- it stays exactly as unwired as
// runAgentDebateWithController already is. "No behavior change" means "the
// same real output a caller could persist the same way runAgentDebate's
// output already is," not "gets called from a new live path." Flipping
// decision.service.ts to call this instead is a separate, later,
// explicitly-authorized step.

export interface DecisionEngineResult {
  output: AgentDebateOutput;
  processingTimeMs: number;
  usage: TokenUsageAccumulator;
  /** Real, unique to this run -- not the eventual database Decision.id
   *  (that doesn't exist until a caller persists this result). Same
   *  semantics as execution-runtime.ts's own executionId. */
  executionId: string;
  /** Full real audit chain (DecisionState history + the one real
   *  ControllerDecision) -- kept separate from executionTrace precisely
   *  because it DOES contain real prospect data (DecisionState.context is
   *  the full DecisionAgentInput; DecisionState.subject.prospectName is
   *  real PII). A caller that needs the full audit trail (e.g. a future
   *  persistence layer, which already handles real prospect data via the
   *  database) uses this; anything meant to be retained/compared as an
   *  operational artifact (Replay, Shadow) uses executionTrace instead. */
  graph: DecisionStateGraph;
  controllerDecision: ControllerDecision;
  /** PII/raw-evidence-free operational record -- see execution-trace.ts's
   *  own module comment for the explicit contents checklist. Safe to
   *  retain long-term, log, or compare across Replay/Shadow runs. */
  executionTrace: ExecutionTrace;
}

function stageTimingsFrom(capabilityOutputsByStage: CapabilityOutputsByStage): StageTiming[] {
  return Object.entries(capabilityOutputsByStage).map(([stage, output]) => ({ stage: stage as StageId, latencyMs: output.latencyMs }));
}

function stageCostsFrom(capabilityOutputsByStage: CapabilityOutputsByStage): StageCost[] {
  return Object.entries(capabilityOutputsByStage).map(([stage, output]) => ({ stage: stage as StageId, tokens: output.cost.tokens, costUsd: output.cost.costUsd }));
}

const AGENT_STAGE_IDS: ReadonlySet<string> = new Set(["research", "icp", "intent", "risk"]);
function isAgentStageId(id: string | undefined): id is "research" | "icp" | "intent" | "risk" {
  return id !== undefined && AGENT_STAGE_IDS.has(id);
}

/**
 * Runs the real Sales pack pipeline via the v5.0 Planner/Executor/
 * capability path instead of runStagesResearchThroughRisk's hardcoded
 * direct-callAgent sequence, then reuses controller.ts's real decide(),
 * budget-manager.ts's real deriveBudgetSnapshot, and decision-state.ts's
 * real buildInterimDecisionState completely unchanged -- exactly the same
 * one-controller-cycle shape execution-runtime.ts's
 * runAgentDebateWithController already implements (Judge always runs
 * last; invoke_capability re-runs exactly one stage; stop/continue/
 * escalate all fall through to Judge regardless -- a decision without a
 * verdict isn't useful to anyone).
 */
export async function evaluate(
  pack: DecisionPack,
  input: DecisionAgentInput,
  identity: ExecutionIdentity,
  policy: ControllerPolicy = DEFAULT_CONTROLLER_POLICY,
  // Gate 3 Increment 1.5 -- a single trailing options object for both LLM-
  // execution override points, rather than letting positional params creep
  // one-by-one (stageExecutor is new here; synthesizer moved into this
  // object from its own standalone positional param -- verified safe: no
  // real call site anywhere in this codebase ever passed a 5th positional
  // argument, so this is fully backward-compatible, not just additive).
  // Shadow Runner uses this to give shadow evaluate() runs a fully
  // independent LLMProvider (and therefore circuit breaker) from the live
  // path's module-level singleton in orchestrator.ts.
  options?: {
    synthesizer?: DecisionSynthesizer;
    stageExecutor?: StageExecutor;
  },
): Promise<DecisionEngineResult> {
  const startedAt = Date.now();
  const executionId = randomUUID();
  const synthesizer = options?.synthesizer ?? createCallAgentDecisionSynthesizer(pack);

  const executionPlan = plan(pack);
  const capabilities = buildAgentStageCapabilities(pack, options?.stageExecutor);
  const resolveCapability: CapabilityResolver = (stage) => {
    if (!isAgentStageId(stage)) {
      throw new Error(`decision-engine.ts: no agent-stage capability registered for stage "${stage}"`);
    }
    return capabilities[stage] as ReasoningCapability<AgentStageCapabilityInput, unknown>;
  };

  const ctx: ExecutionContext = {
    identity,
    // Same honest "unconstrained" placeholder capability-shadow.ts uses:
    // no real BudgetSnapshot exists yet at this point (deriveBudgetSnapshot
    // needs a DecisionState, built below from this very run's real
    // output) -- not a guessed real number.
    budget: { remainingReasoning: Number.POSITIVE_INFINITY, remainingLatency: Number.POSITIVE_INFINITY, remainingCost: Number.POSITIVE_INFINITY },
  };

  const { stageOutputs, usage, capabilityOutputsByStage } = await runPlan(executionPlan, resolveCapability, input, ctx);
  // Mutated (not replaced) if invoke_capability re-runs a stage below, so
  // the trace's timings/costs always reflect the real, latest attempt for
  // that stage -- not a stale first-attempt value.
  const finalCapabilityOutputsByStage: CapabilityOutputsByStage = { ...capabilityOutputsByStage };

  const checkpointState = buildInterimDecisionState({
    decisionId: executionId,
    teamId: identity.teamId,
    userId: identity.userId,
    prospectId: identity.prospectId,
    prospectName: identity.prospectName,
    input,
    stageOutputs,
    usage,
    processingTimeMs: Date.now() - startedAt,
    reasoningDepth: 4,
  });

  const budgetSnapshot = deriveBudgetSnapshot(checkpointState.budget.raw, checkpointState.objective.value, NO_REAL_COMPLEXITY_SCORE_AVAILABLE);
  const controllerDecision = decide(checkpointState, budgetSnapshot, capabilityOutputsByStage, policy);

  let graph = createDecisionStateGraph(checkpointState);
  let finalReasoningDepth = 4;
  let finalStageOutputs: StageOutputs = stageOutputs;

  let output: AgentDebateOutput;
  let synthesisTiming: StageTiming = { stage: "judge", latencyMs: 0 };
  let synthesisCost: StageCost = { stage: "judge", tokens: 0, costUsd: 0 };
  try {
    if (controllerDecision.action === "invoke_capability" && isAgentStageId(controllerDecision.targetCapability)) {
      const targetStage: StageId = controllerDecision.targetCapability;
      const capabilityOutput = await capabilities[targetStage].invoke({ input, priorOutputs: finalStageOutputs }, ctx);
      finalStageOutputs = { ...finalStageOutputs, [targetStage]: capabilityOutput.outputs };
      finalCapabilityOutputsByStage[targetStage] = capabilityOutput;
      usage.inputTokens += capabilityOutput.cost.tokens; // see executor.ts's own comment on the same combined-total limitation
      finalReasoningDepth = 5;

      const nextState = buildInterimDecisionState({
        decisionId: executionId,
        teamId: identity.teamId,
        userId: identity.userId,
        prospectId: identity.prospectId,
        prospectName: identity.prospectName,
        input,
        stageOutputs: finalStageOutputs,
        usage,
        processingTimeMs: Date.now() - startedAt,
        reasoningDepth: finalReasoningDepth,
        parent: { version: checkpointState.version, transitionHash: checkpointState.transitionHash },
        transitionAction: "invoke_capability",
        transitionRationale: `DecisionEngine v5.0: re-invoked "${targetStage}" per Controller decide() (${controllerDecision.reasons.join("; ")}).`,
      });
      graph = appendState(graph, nextState);
    }

    const synthesis = await synthesizer.synthesize({ input, stageOutputs: finalStageOutputs }, ctx);
    usage.inputTokens += synthesis.usage.inputTokens;
    usage.outputTokens += synthesis.usage.outputTokens;
    synthesisTiming = { stage: "judge", latencyMs: synthesis.durationMs };
    synthesisCost = {
      stage: "judge",
      tokens: synthesis.usage.inputTokens + synthesis.usage.outputTokens,
      costUsd: calculateInferenceCostUsd(synthesis.usage.inputTokens, synthesis.usage.outputTokens),
    };

    output = agentDebateOutputSchema.parse({
      research: finalStageOutputs.research,
      icp: finalStageOutputs.icp,
      intent: finalStageOutputs.intent,
      risk: finalStageOutputs.risk,
      judge: synthesis.output,
    });
  } catch (err) {
    attachUsageAndRethrow(err, usage);
  }

  logger.info(
    {
      executionId,
      controllerAction: controllerDecision.action,
      controllerReasons: controllerDecision.reasons,
      controllerTargetCapability: controllerDecision.targetCapability,
      graphVersions: Array.from(graph.states.keys()),
      finalReasoningDepth,
    },
    "DecisionEngine v5.0: one controller cycle completed",
  );

  const executedNodes = Object.keys(finalCapabilityOutputsByStage) as StageId[];
  const skippedNodes = executionPlan
    .toGraph()
    .nodes.map((node) => node.id)
    .filter((id) => !executedNodes.includes(id));

  // Deliberately narrow projection of output.judge -- see
  // SynthesizerVerdictSummary's own doc comment for exactly what's
  // excluded and why (reasoning/key_evidence/message/confidence_explanation
  // can embed prospect-specific content).
  const synthesizerSummary: SynthesizerVerdictSummary = {
    verdict: output.judge.verdict,
    confidence: output.judge.confidence,
    weightedScore: output.judge.weighted_score,
    agentConsensus: output.judge.agent_consensus,
    recommendedAction: output.judge.recommended_action,
  };

  const executionTrace: ExecutionTrace = {
    requestId: executionId,
    packId: pack.id,
    model: CLAUDE_MODEL,
    controllerDecisions: [controllerDecision],
    executedNodes,
    skippedNodes,
    synthesizerOutput: synthesizerSummary,
    timings: [...stageTimingsFrom(finalCapabilityOutputsByStage), synthesisTiming],
    costs: [...stageCostsFrom(finalCapabilityOutputsByStage), synthesisCost],
  };

  return {
    output,
    processingTimeMs: Date.now() - startedAt,
    usage,
    executionId,
    graph,
    controllerDecision,
    executionTrace,
  };
}
