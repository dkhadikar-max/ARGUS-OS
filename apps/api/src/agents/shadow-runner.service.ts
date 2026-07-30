import { scoreToVerdict, type AgentDebateOutput, type Verdict } from "@argus/shared";
import { prisma } from "@argus/database";
import { evaluate, type DecisionEngineResult } from "./decision-engine.js";
import { SALES_LEAD_QUALIFICATION_PACK } from "./decision-pack.js";
import type { DecisionAgentInput, TokenUsageAccumulator } from "./orchestrator.js";
import type { ExecutionIdentity } from "./reasoning-capability.js";
import { calculateInferenceCostUsd } from "./decision-value.service.js";
import { compareForShadow, type NormalizedShadowOutcome } from "./decision-disagreement.js";
import { shouldSampleShadow } from "./shadow-sampling.js";
import { env } from "../config/env.js";
import { increment, timing } from "../lib/datadog.js";
import { logger } from "../lib/logger.js";

/**
 * Gate 3 Shadow Mode, Increment 1 -- runs the v5.0 DecisionEngine
 * (evaluate()) in shadow alongside the live decision path, on a sampled
 * percentage of real traffic, and persists a comparable ShadowDecision
 * row. Gated internally on both env.SHADOW_MODE_ENABLED and
 * env.SHADOW_SAMPLE_RATE_PERCENT (so this function is safe to call
 * unconditionally in tests without duplicating the gating logic).
 *
 * Every failure mode (evaluate() throws, persistence throws) is caught
 * internally -- this function always resolves, never rejects, and never
 * throws into the live request path. Callers must still fire this
 * void/`.catch()`-wrapped (see decision.service.ts's call site) rather
 * than awaited inline: evaluate() is a second full LLM debate (multiple
 * real Claude calls, real seconds), and awaiting it would add that
 * latency to every sampled live request.
 */

export interface ShadowRunnerInput {
  decisionId: string;
  teamId: string;
  userId: string;
  prospectId: string;
  prospectName: string;
  context: DecisionAgentInput;
  liveOutput: AgentDebateOutput;
  liveVerdict: Verdict;
  liveProcessingTimeMs: number;
  liveUsage: TokenUsageAccumulator;
  liveControllerAction: string | null;
  liveControllerTargetCapability: string | null;
}

export async function runShadowDecision(input: ShadowRunnerInput): Promise<void> {
  if (!env.SHADOW_MODE_ENABLED) return;
  if (!shouldSampleShadow(input.prospectId, env.SHADOW_SAMPLE_RATE_PERCENT)) return;

  const startedAt = Date.now();
  const identity: ExecutionIdentity = {
    teamId: input.teamId,
    userId: input.userId,
    prospectId: input.prospectId,
    prospectName: input.prospectName,
  };

  let result: DecisionEngineResult;
  try {
    result = await evaluate(SALES_LEAD_QUALIFICATION_PACK, input.context, identity);
  } catch (err) {
    increment("shadow.decision.error", { reason: "evaluate_threw" });
    logger.warn(
      { err, decisionId: input.decisionId, teamId: input.teamId, prospectId: input.prospectId },
      "Shadow Runner: evaluate() failed; live decision unaffected",
    );
    return;
  }

  // Same de-risked derivation decision.service.ts already applies to the
  // live verdict -- never output.judge.verdict directly (see
  // decision-disagreement.ts's own module comment for why).
  const shadowVerdict = scoreToVerdict(result.output.judge.weighted_score);
  const inferenceCostUsd = calculateInferenceCostUsd(result.usage.inputTokens, result.usage.outputTokens);

  const oldR: NormalizedShadowOutcome = {
    verdict: input.liveVerdict,
    confidence: input.liveOutput.judge.confidence,
    controllerAction: input.liveControllerAction,
    controllerTargetCapability: input.liveControllerTargetCapability,
  };
  const newR: NormalizedShadowOutcome = {
    verdict: shadowVerdict,
    confidence: result.output.judge.confidence,
    controllerAction: result.controllerDecision.action,
    controllerTargetCapability: result.controllerDecision.targetCapability ?? null,
  };
  const { comparison, controllerComparisonApplicable } = compareForShadow(oldR, newR);

  try {
    await prisma.shadowDecision.create({
      data: {
        decisionId: input.decisionId,
        teamId: input.teamId,
        userId: input.userId,
        prospectId: input.prospectId,
        executionId: result.executionId,
        packId: result.executionTrace.packId,
        model: result.executionTrace.model,
        verdict: shadowVerdict,
        confidence: result.output.judge.confidence,
        weightedScore: result.output.judge.weighted_score,
        agentConsensus: result.output.judge.agent_consensus,
        recommendedAction: result.output.judge.recommended_action,
        reasoning: result.output.judge.reasoning,
        controllerAction: result.controllerDecision.action,
        controllerTargetCapability: result.controllerDecision.targetCapability ?? null,
        controllerReasons: result.controllerDecision.reasons as never,
        processingTimeMs: result.processingTimeMs,
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
        inferenceCostUsd,
        agentOutputs: result.output as never,
        executionTrace: result.executionTrace as never,
        verdictAgreement: comparison.verdictAgreement,
        confidenceDelta: comparison.confidenceDelta,
        controllerComparisonApplicable,
        disagreementCategories: comparison.disagreementCategories as never,
      },
    });
  } catch (err) {
    increment("shadow.decision.error", { reason: "persist_failed" });
    logger.warn({ err, decisionId: input.decisionId, teamId: input.teamId }, "Shadow Runner: persistence failed; shadow result discarded");
    return;
  }

  timing("shadow.decision.duration", Date.now() - startedAt);
  increment("shadow.decision.count", { verdictAgreement: String(comparison.verdictAgreement) });
  for (const category of comparison.disagreementCategories) {
    increment("shadow.disagreement.count", { category });
  }
}
