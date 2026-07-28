import { randomUUID } from "node:crypto";
import { agentDebateOutputSchema, type AgentDebateOutput } from "@argus/shared";
import { attachUsageAndRethrow, type DecisionAgentInput, type StageId, type StageOutputs, type TokenUsageAccumulator } from "./orchestrator.js";
import type { DecisionPack } from "./decision-pack.js";
import { buildAgentStageCapabilities } from "./reasoning-capability.js";
import type { ExecutionContext, ExecutionIdentity, ReasoningCapability, AgentStageCapabilityInput } from "./reasoning-capability.js";
import { plan } from "./planner.js";
import { runPlan, type CapabilityResolver } from "./executor.js";
import { createCallAgentDecisionSynthesizer, type DecisionSynthesizer } from "./decision-synthesizer.js";
import { buildInterimDecisionState } from "./decision-state.js";
import { decide, DEFAULT_CONTROLLER_POLICY, type ControllerDecision, type ControllerPolicy } from "./controller.js";
import { deriveBudgetSnapshot, NO_REAL_COMPLEXITY_SCORE_AVAILABLE } from "./budget-manager.js";
import { createDecisionStateGraph, appendState, type DecisionStateGraph } from "./decision-state-graph.js";
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
  executionTrace: {
    graph: DecisionStateGraph;
    controllerDecision: ControllerDecision;
  };
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
  synthesizer: DecisionSynthesizer = createCallAgentDecisionSynthesizer(pack),
): Promise<DecisionEngineResult> {
  const startedAt = Date.now();
  const executionId = randomUUID();

  const executionPlan = plan(pack);
  const capabilities = buildAgentStageCapabilities(pack);
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
  try {
    if (controllerDecision.action === "invoke_capability" && isAgentStageId(controllerDecision.targetCapability)) {
      const targetStage: StageId = controllerDecision.targetCapability;
      const capabilityOutput = await capabilities[targetStage].invoke({ input, priorOutputs: finalStageOutputs }, ctx);
      finalStageOutputs = { ...finalStageOutputs, [targetStage]: capabilityOutput.outputs };
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

  return {
    output,
    processingTimeMs: Date.now() - startedAt,
    usage,
    executionId,
    executionTrace: { graph, controllerDecision },
  };
}
