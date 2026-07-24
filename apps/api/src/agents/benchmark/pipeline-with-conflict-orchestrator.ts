import { agentDebateOutputSchema, judgeAgentOutputSchema, type AgentDebateOutput } from "@argus/shared";
import { JUDGE_AGENT_PROMPT } from "../prompts.js";
import {
  runStagesResearchThroughRisk,
  callAgent,
  fillPlaceholders,
  systemPromptFor,
  JUDGE_TOOL,
  type DecisionAgentInput,
} from "../orchestrator.js";
import { computeBaseConflict, type BaseConflictResult } from "../conflict/conflict-detector.js";

/**
 * v4 roadmap Phase 9 -- Candidate 3 for the architecture benchmark
 * (standalone, not used by the live decision path). Identical to the real
 * pipeline (runStagesResearchThroughRisk, unchanged) through Risk; only
 * Judge's prompt changes, gaining a deterministic conflict analysis
 * (Phase 3's computeBaseConflict -- CV, spread, directional disagreement)
 * as an addendum, so it has real numbers in front of it instead of having
 * to eyeball disagreement from raw scores alone.
 *
 * Uses computeBaseConflict, not the full calculateConflictSurprise: the
 * surprise layer needs a real team's accumulated historical pair-
 * frequency data (a DB query), which doesn't exist for synthetic eval
 * fixtures and would just return the 0.10 default prior for every pair --
 * no real signal, and it would break the eval harness's own zero-DB
 * design (run.ts deliberately calls the pipeline directly with no DB/
 * Redis/cache in the loop, so only the agent pipeline itself can move the
 * numbers between runs).
 */
export async function runAgentDebatePipelineWithConflict(input: DecisionAgentInput): Promise<{
  output: AgentDebateOutput;
  processingTimeMs: number;
  usage: { inputTokens: number; outputTokens: number };
  conflict: BaseConflictResult;
}> {
  const startedAt = Date.now();

  const { research, icp, intent, risk, usage } = await runStagesResearchThroughRisk(input);

  const conflict = computeBaseConflict({
    icpScore: icp.score,
    intentScore: intent.score,
    riskSafetyScore: 100 - risk.time_waste_probability,
  });

  const judgePrompt = fillPlaceholders(JUDGE_AGENT_PROMPT, input, { research, icp, intent, risk });
  const augmentedPrompt = `${judgePrompt}\n\nDETERMINISTIC CONFLICT ANALYSIS (computed from the agents' own scores, not a model guess -- use this to inform, not replace, your own qualitative "conflicts" field):\n${JSON.stringify(conflict)}`;

  const judge = await callAgent(
    systemPromptFor("judge", input.companyContext),
    augmentedPrompt,
    JUDGE_TOOL,
    judgeAgentOutputSchema,
    2560,
    usage,
  );

  const output = agentDebateOutputSchema.parse({ research, icp, intent, risk, judge });
  return { output, processingTimeMs: Date.now() - startedAt, usage, conflict };
}
