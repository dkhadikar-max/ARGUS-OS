import { randomUUID } from "node:crypto";
import type { Evidence } from "@argus/database";
import {
  agentDebateOutputSchema,
  researchAgentOutputSchema,
  icpAgentOutputSchema,
  intentAgentOutputSchema,
  riskAgentOutputSchema,
  judgeAgentOutputSchema,
  type AgentDebateOutput,
  type JudgeAgentOutput,
} from "@argus/shared";
import { logger } from "../lib/logger.js";
import {
  attachUsageAndRethrow,
  buildStagePrompt,
  callAgent,
  runStagesResearchThroughRisk,
  RESEARCH_TOOL,
  ICP_TOOL,
  INTENT_TOOL,
  RISK_TOOL,
  JUDGE_TOOL,
  type DecisionAgentInput,
  type StageOutputs,
  type TokenUsageAccumulator,
} from "./orchestrator.js";
import { RESEARCH_AGENT_PROMPT, ICP_AGENT_PROMPT, INTENT_AGENT_PROMPT, RISK_AGENT_PROMPT, JUDGE_AGENT_PROMPT } from "./prompts.js";
import { buildInterimDecisionState } from "./decision-state.js";
import { decide, DEFAULT_CONTROLLER_POLICY, type ControllerDecision, type ControllerPolicy } from "./controller.js";
import { deriveBudgetSnapshot, NO_REAL_COMPLEXITY_SCORE_AVAILABLE } from "./budget-manager.js";
import { createDecisionStateGraph, appendState, type DecisionStateGraph } from "./decision-state-graph.js";
import type { CapabilityOutput, CapabilityOutputsByStage } from "./reasoning-capability.js";

// Execution Runtime v1, Phase 1 (docs/ARCHITECTURE_V4.md) -- the first real
// (stage -> state -> controller -> next stage) cycle, replacing the fixed
// "all stages -> controller" shape everywhere else in ARGUS still uses.
// Deliberately narrow, per its own explicit scope:
//   - Runs exactly ONE controller cycle, at ONE checkpoint (after
//     Research/ICP+Intent/Risk, before Judge) -- not a real multi-round
//     loop. A second cycle (deciding again after an invoke_capability
//     re-run) is future work, not built here.
//   - Reuses runStagesResearchThroughRisk/buildStagePrompt/callAgent/the
//     real tool schemas from orchestrator.ts completely unchanged --
//     Research/ICP/Intent/Risk behave identically to the fixed pipeline;
//     only what happens *between* Risk and Judge is new.
//   - Reuses controller.ts's decide() completely unchanged -- this module
//     never re-implements Controller logic, only feeds it real data and
//     acts on its real output.
//   - Gated by env.EXECUTION_RUNTIME_V1 (decision.service.ts), default
//     false. Returns the exact same {output, processingTimeMs, usage}
//     shape runAgentDebate does (ExecutionRuntimeResult is a superset), so
//     nothing downstream of the call site needs to change.
//
// The one thing this module can't do honestly: build a real DecisionState
// pre-Judge (Verdict is an LLM judgment, not a formula -- see decision-
// state.ts's buildInterimDecisionState comment). confidence.overall is a
// real mean of the 4 real per-stage confidences; verdict is an explicit,
// documented placeholder, so ControllerDecision.utilityEstimate is not
// meaningful at this checkpoint -- only confidence/budget/capability
// signals drive decide()'s actual branching, and those are all real.

export interface ExecutionIdentity {
  teamId: string;
  userId: string;
  prospectId: string;
  prospectName: string;
}

export interface ExecutionRuntimeResult {
  output: AgentDebateOutput;
  processingTimeMs: number;
  usage: TokenUsageAccumulator;
  /** Bug fix (Critical #3): the same id executionTrace.graph is keyed under
   *  (graph.decisionId), surfaced at the top level so a caller that only
   *  needs to persist a correlation id (decision.service.ts) doesn't have
   *  to reach into executionTrace for it. Real, but NOT the eventual
   *  database Decision.id -- that doesn't exist until createDecisionRecord
   *  runs, after this returns. Callers that want the real trace should
   *  persist this value (Decision.executionTraceId) so a real Decision row
   *  can be correlated back to the Controller's real per-decision history
   *  (today, only reachable via structured logs otherwise). */
  executionId: string;
  /** Real audit trail: the DecisionState checkpoint(s) this run actually
   *  produced (one, or two if invoke_capability genuinely re-ran a stage)
   *  and the one real ControllerDecision made along the way. Additive --
   *  callers that only need {output, processingTimeMs, usage} (the same
   *  shape runAgentDebate already returns) can ignore this entirely. */
  executionTrace: {
    graph: DecisionStateGraph;
    controllerDecision: ControllerDecision;
  };
}

type RealStageId = "research" | "icp" | "intent" | "risk";
const REAL_STAGE_IDS: ReadonlySet<string> = new Set<RealStageId>(["research", "icp", "intent", "risk"]);

function isRealStageId(id: string | undefined): id is RealStageId {
  return id !== undefined && REAL_STAGE_IDS.has(id);
}

function capabilityOutputFrom(capabilityId: RealStageId, confidence: number): CapabilityOutput<Evidence[]> {
  return {
    capabilityId,
    // The real per-stage agent output (ResearchAgentOutput/IcpAgentOutput/
    // etc.) isn't Evidence[]-shaped, so it can't honestly fill `outputs`
    // here -- left empty rather than coerced into a shape it isn't.
    // decide() never reads outputs/evidenceProduced/cost/latencyMs, only
    // confidence (see controller.ts), which IS the real, direct value the
    // stage itself just reported -- more direct than capability-shadow.ts's
    // own retriever-based confidence (evidence-found-or-not), since this is
    // the live agent's own self-reported confidence for this real call.
    outputs: [],
    confidence,
    evidenceProduced: [],
    disagreements: [],
    cost: { tokens: 0, latencyMs: 0, costUsd: 0, reasoningDepth: 0 },
    latencyMs: 0,
  };
}

function deriveCapabilityOutputsFromStageResults(stageOutputs: StageOutputs): CapabilityOutputsByStage {
  const result: CapabilityOutputsByStage = {};
  if (stageOutputs.research) result.research = capabilityOutputFrom("research", stageOutputs.research.confidence);
  if (stageOutputs.icp) result.icp = capabilityOutputFrom("icp", stageOutputs.icp.confidence);
  if (stageOutputs.intent) result.intent = capabilityOutputFrom("intent", stageOutputs.intent.confidence);
  if (stageOutputs.risk) result.risk = capabilityOutputFrom("risk", stageOutputs.risk.confidence);
  return result;
}

/** Re-invokes exactly one real stage -- the same buildStagePrompt/callAgent/
 *  tool/schema/maxTokens runStagesResearchThroughRisk already uses for that
 *  stage, called a second time with whatever priorOutputs exist so far.
 *  Mutates nothing; returns a new StageOutputs with that one stage
 *  replaced by its fresh real result. */
async function reinvokeStage(
  stageId: RealStageId,
  input: DecisionAgentInput,
  priorOutputs: StageOutputs,
  usage: TokenUsageAccumulator,
): Promise<StageOutputs> {
  switch (stageId) {
    case "research": {
      const prompt = buildStagePrompt("research", RESEARCH_AGENT_PROMPT, input, priorOutputs);
      const research = await callAgent(prompt.system, prompt.userPrompt, RESEARCH_TOOL, researchAgentOutputSchema, 2048, usage);
      return { ...priorOutputs, research };
    }
    case "icp": {
      const prompt = buildStagePrompt("icp", ICP_AGENT_PROMPT, input, priorOutputs);
      const icp = await callAgent(prompt.system, prompt.userPrompt, ICP_TOOL, icpAgentOutputSchema, 1536, usage);
      return { ...priorOutputs, icp };
    }
    case "intent": {
      const prompt = buildStagePrompt("intent", INTENT_AGENT_PROMPT, input, priorOutputs);
      const intent = await callAgent(prompt.system, prompt.userPrompt, INTENT_TOOL, intentAgentOutputSchema, 1536, usage);
      return { ...priorOutputs, intent };
    }
    case "risk": {
      const prompt = buildStagePrompt("risk", RISK_AGENT_PROMPT, input, priorOutputs);
      const risk = await callAgent(prompt.system, prompt.userPrompt, RISK_TOOL, riskAgentOutputSchema, 2560, usage);
      return { ...priorOutputs, risk };
    }
  }
}

/**
 * Runs Research -> ICP+Intent -> Risk exactly like runAgentDebate does
 * (unchanged), then -- instead of always calling Judge next -- builds one
 * real interim DecisionState, derives a real BudgetSnapshot and
 * CapabilityOutputsByStage from what actually just happened, and calls the
 * real, unmodified controller.ts decide(). Only "invoke_capability" changes
 * what runs next (one real extra stage call, then a real version-1
 * DecisionState appended to the graph); "stop"/"continue"/"escalate" all
 * fall through to Judge here regardless -- a decision that stalls with no
 * verdict is worse than one that proceeds and is separately flagged. This
 * module stays side-effect-free by design (the Controller decides, it
 * doesn't execute -- Section 7.1's own capability-isolation principle);
 * decision.service.ts is what reads executionTrace.controllerDecision and
 * delivers the real escalation notification (Critical Bug #5's fix,
 * notifyControllerEscalation) once this function returns. Judge always
 * runs last, exactly like the fixed pipeline -- a decision without a
 * verdict isn't useful to anyone.
 */
export async function runAgentDebateWithController(
  input: DecisionAgentInput,
  identity: ExecutionIdentity,
  policy: ControllerPolicy = DEFAULT_CONTROLLER_POLICY,
): Promise<ExecutionRuntimeResult> {
  const startedAt = Date.now();
  // Not the eventual database Decision.id (createDecisionRecord mints that
  // later, after this returns) -- a real, unique identifier scoped to just
  // this execution run, for the DecisionStateGraph built below.
  const executionId = randomUUID();

  const { research, icp, intent, risk, usage } = await runStagesResearchThroughRisk(input);
  let stageOutputs: StageOutputs = { research, icp, intent, risk };

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

  const capabilityOutputs = deriveCapabilityOutputsFromStageResults(stageOutputs);
  const budgetSnapshot = deriveBudgetSnapshot(checkpointState.budget.raw, checkpointState.objective.value, NO_REAL_COMPLEXITY_SCORE_AVAILABLE);
  const controllerDecision = decide(checkpointState, budgetSnapshot, capabilityOutputs, policy);

  let graph = createDecisionStateGraph(checkpointState);
  let finalReasoningDepth = 4;

  // Bug fix (Critical #2): both the re-invocation call and the final Judge
  // call are real, billable LLM calls that can throw after runStages
  // ResearchThroughRisk already succeeded -- without this, the tokens spent
  // on all 4 (or 5) real stages so far would be lost the moment either
  // call failed, same gap orchestrator.ts's own runAgentDebate had.
  let judge: JudgeAgentOutput;
  try {
    if (controllerDecision.action === "invoke_capability" && isRealStageId(controllerDecision.targetCapability)) {
      const targetCapability = controllerDecision.targetCapability;
      stageOutputs = await reinvokeStage(targetCapability, input, stageOutputs, usage);
      finalReasoningDepth = 5;

      const nextState = buildInterimDecisionState({
        decisionId: executionId,
        teamId: identity.teamId,
        userId: identity.userId,
        prospectId: identity.prospectId,
        prospectName: identity.prospectName,
        input,
        stageOutputs,
        usage,
        processingTimeMs: Date.now() - startedAt,
        reasoningDepth: finalReasoningDepth,
        parent: { version: checkpointState.version, transitionHash: checkpointState.transitionHash },
        transitionAction: "invoke_capability",
        transitionRationale: `Execution Runtime v1: re-invoked "${targetCapability}" per Controller decide() (${controllerDecision.reasons.join("; ")}).`,
      });
      graph = appendState(graph, nextState);
    }

    const judgePrompt = buildStagePrompt("judge", JUDGE_AGENT_PROMPT, input, stageOutputs);
    judge = await callAgent(judgePrompt.system, judgePrompt.userPrompt, JUDGE_TOOL, judgeAgentOutputSchema, 2560, usage);
  } catch (err) {
    attachUsageAndRethrow(err, usage);
  }

  const output = agentDebateOutputSchema.parse({
    research: stageOutputs.research,
    icp: stageOutputs.icp,
    intent: stageOutputs.intent,
    risk: stageOutputs.risk,
    judge,
  });

  logger.info(
    {
      executionId,
      controllerAction: controllerDecision.action,
      controllerReasons: controllerDecision.reasons,
      controllerTargetCapability: controllerDecision.targetCapability,
      graphVersions: Array.from(graph.states.keys()),
      finalReasoningDepth,
    },
    "Execution Runtime v1: one controller cycle completed",
  );

  return {
    output,
    processingTimeMs: Date.now() - startedAt,
    usage,
    executionId,
    executionTrace: { graph, controllerDecision },
  };
}
