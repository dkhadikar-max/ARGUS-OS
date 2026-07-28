import type { StageId, DecisionAgentInput, StageOutputs, TokenUsageAccumulator } from "./orchestrator.js";
import type { ExecutionPlan } from "./planner.js";
import { topologicalBatches } from "./planner.js";
import type { AgentStageCapabilityInput, CapabilityOutputsByStage, ExecutionContext, ReasoningCapability } from "./reasoning-capability.js";

// v5.0 scaffolding, Increment 2 -- executes a plan, does not know where
// capabilities come from (that's the caller's job, via resolveCapability).
// Keeps this agnostic to whether capabilities are built from
// buildAgentStageCapabilities(pack), a future registry, or a test double,
// and doesn't hardcode a fixed 4-stage shape -- it only needs a resolver
// for whatever stages the given ExecutionPlan actually contains. Standalone
// and unwired -- nothing calls runPlan() from any live path.

export interface ExecutorResult {
  stageOutputs: StageOutputs;
  usage: TokenUsageAccumulator;
  capabilityOutputsByStage: CapabilityOutputsByStage;
}

export type CapabilityResolver = (stage: StageId) => ReasoningCapability<AgentStageCapabilityInput, unknown>;

/** Merges one stage's real output into StageOutputs -- StageOutputs only
 *  has slots for the 4 real agent stages (research/icp/intent/risk), so a
 *  plan containing any other stage id would have nowhere honest to put its
 *  output; that's a real limitation of this increment (Judge isn't a
 *  capability, and no plan should ever contain it -- see
 *  reasoning-capability.ts's own module comment), not silently ignored. */
function mergeStageOutput(stageOutputs: StageOutputs, stage: StageId, output: unknown): StageOutputs {
  switch (stage) {
    case "research":
      return { ...stageOutputs, research: output as StageOutputs["research"] };
    case "icp":
      return { ...stageOutputs, icp: output as StageOutputs["icp"] };
    case "intent":
      return { ...stageOutputs, intent: output as StageOutputs["intent"] };
    case "risk":
      return { ...stageOutputs, risk: output as StageOutputs["risk"] };
    case "judge":
      throw new Error("executor.ts: judge is not a capability and must never appear in an ExecutionPlan (see reasoning-capability.ts's module comment)");
  }
}

/** Walks executionPlan's topological batches; within a batch, invokes every
 *  stage's capability in parallel (Promise.all), merging each real result
 *  into StageOutputs before starting the next batch -- so a later batch's
 *  capabilities see real prior output, exactly like
 *  runStagesResearchThroughRisk's own priorOutputs threading. Accumulates
 *  real token usage and the real CapabilityOutput per stage (no
 *  reconstruction needed -- unlike execution-runtime.ts's
 *  deriveCapabilityOutputsFromStageResults, which has to synthesize one
 *  after the fact because runStagesResearchThroughRisk never produces one
 *  natively). */
export async function runPlan(
  executionPlan: ExecutionPlan,
  resolveCapability: CapabilityResolver,
  input: DecisionAgentInput,
  ctx: ExecutionContext,
): Promise<ExecutorResult> {
  let stageOutputs: StageOutputs = {};
  const usage: TokenUsageAccumulator = { inputTokens: 0, outputTokens: 0 };
  const capabilityOutputsByStage: CapabilityOutputsByStage = {};

  for (const batch of topologicalBatches(executionPlan)) {
    const results = await Promise.all(
      batch.map(async (stage) => {
        const capabilityOutput = await resolveCapability(stage).invoke({ input, priorOutputs: stageOutputs }, ctx);
        return { stage, capabilityOutput };
      }),
    );
    for (const { stage, capabilityOutput } of results) {
      stageOutputs = mergeStageOutput(stageOutputs, stage, capabilityOutput.outputs);
      capabilityOutputsByStage[stage] = capabilityOutput;
      // Known, documented gap: CapabilityOutput.cost (RawCost, decision-
      // state.ts) only tracks a combined `tokens` total, not an input/
      // output split -- wrapAgentStageAsCapability (Increment 1) collapses
      // the real split it has internally (from StageExecutionResult.usage)
      // into that single field, since RawCost is the existing, established
      // shape shared with budget-manager.ts. The split is genuinely not
      // recoverable from CapabilityOutput alone. Putting the whole total
      // into inputTokens (not silently splitting it some other way) is the
      // most honest representation available -- downstream cost-per-token
      // accuracy (calculateInferenceCostUsd prices input/output
      // differently) is reduced as a real, documented consequence, not a
      // hidden one.
      usage.inputTokens += capabilityOutput.cost.tokens;
    }
  }

  return { stageOutputs, usage, capabilityOutputsByStage };
}
