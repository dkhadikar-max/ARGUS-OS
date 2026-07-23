import { learningAgentOutputSchema, type LearningAgentOutput } from "@argus/shared";
import { anthropic, CLAUDE_MODEL } from "./claude-client.js";
import { LEARNING_AGENT_PROMPT } from "./prompts.js";
import { getTeamOutcomeHistory } from "../modules/decisions/decision.repository.js";
import { getIcp } from "../modules/icp/icp.repository.js";
import { upsertLearningInsights } from "../modules/memory/memory.repository.js";
import { createLearningRecommendation } from "../modules/learning-recommendations/learning-recommendation.repository.js";
import { logger } from "../lib/logger.js";

const TOOL_NAME = "submit_learning_report";

// Mirrors learningAgentOutputSchema field-for-field, same reasoning as
// orchestrator.ts's DECISION_TOOL_SCHEMA: forcing a tool call makes the API
// enforce the shape at decode time instead of hoping the model follows the
// prompt's <output_format> block verbatim.
const LEARNING_TOOL_SCHEMA = {
  name: TOOL_NAME,
  description: "Submit the learning report analyzing recent decisions and outcomes.",
  input_schema: {
    type: "object",
    properties: {
      accuracy_by_verdict: {
        type: "object",
        additionalProperties: { type: "number" },
        description: "e.g. { \"STRONG_YES\": 82, \"YES\": 65 }",
      },
      systematic_errors: { type: "array", items: { type: "string" } },
      patterns: {
        type: "array",
        items: {
          type: "object",
          properties: {
            pattern: { type: "string" },
            evidence: { type: "string" },
            confidence: { type: "number" },
            recommendation: { type: "string" },
          },
          required: ["pattern", "evidence", "confidence", "recommendation"],
        },
      },
      prompt_adjustments: {
        type: "array",
        items: {
          type: "object",
          properties: {
            agent: { type: "string" },
            current: { type: "string" },
            suggested: { type: "string" },
            reason: { type: "string" },
          },
          required: ["agent", "current", "suggested", "reason"],
        },
      },
      icp_recommendations: { type: "array", items: { type: "string" } },
      priority: { type: "string", enum: ["high", "medium", "low"] },
    },
    required: ["accuracy_by_verdict", "systematic_errors", "patterns", "prompt_adjustments", "icp_recommendations", "priority"],
  },
} as const;

function fillLearningPlaceholders(
  template: string,
  input: { recentDecisions: unknown; currentIcp: unknown },
): string {
  return template
    .replace("{{recent_decisions}}", `{{recent_decisions}}\n${JSON.stringify(input.recentDecisions)}`)
    .replace("{{current_icp}}", `{{current_icp}}\n${JSON.stringify(input.currentIcp)}`)
    // No per-team prompt-customization table exists in this codebase (agents/
    // prompts.ts is one shared set of constants for every team) -- an honest
    // note instead of fabricating stored "current prompts" data, so
    // prompt_adjustments recommendations are understood as applying globally.
    .replace(
      "{{current_prompts}}",
      "{{current_prompts}}\nPrompts are shared across every team in this deployment (apps/api/src/agents/prompts.ts) -- not yet per-team customizable. Treat any prompt_adjustments recommendation as applying to all teams, not just this one.",
    );
}

const MAX_ATTEMPTS = 2;

/**
 * v4 roadmap Phase 8 (Learning Wiring) -- surfaces this report's own
 * icp_recommendations/prompt_adjustments as individually actionable
 * LearningRecommendation rows, in addition to (not instead of) the
 * existing upsertLearningInsights call below. Best-effort: mirrors
 * outcome.service.ts's maybeRunLearningAgent pattern -- a failure here
 * must never fail the learning run that's already succeeded and already
 * stored its report.
 *
 * Does NOT create ROUTING_THRESHOLD or RETRIEVER_WEIGHT recommendations --
 * learningAgentOutputSchema has no field for either (only
 * icp_recommendations and prompt_adjustments exist), and parsing free text
 * into structured threshold/weight numbers would be a guess, not a real
 * recommendation.
 */
async function createRecommendationsFromReport(teamId: string, output: LearningAgentOutput): Promise<void> {
  await Promise.all([
    ...output.icp_recommendations.map((recommendation) =>
      createLearningRecommendation({ teamId, targetSubsystem: "ICP", rationale: recommendation }),
    ),
    ...output.prompt_adjustments.map((adjustment) =>
      createLearningRecommendation({
        teamId,
        targetSubsystem: "PROMPTS",
        rationale: adjustment.reason,
        suggestedChange: adjustment,
      }),
    ),
  ]);
}

/**
 * Bible §8.8 Learning Agent: analyzes a team's recent decisions/outcomes and
 * produces a report of accuracy, systematic errors, and recommendations.
 * Never auto-applies anything -- prompt_adjustments and icp_recommendations
 * are for a human to review (the prompt's own "never change prompts without
 * human review in first 90 days" constraint) -- this only stores the report
 * on CompanyMemory.learningInsights for the Company Memory page to display.
 */
export async function runLearningAgent(teamId: string): Promise<LearningAgentOutput | null> {
  const [recentDecisions, icp] = await Promise.all([getTeamOutcomeHistory(teamId), getIcp(teamId)]);

  if (recentDecisions.length === 0) return null;

  const userPrompt = fillLearningPlaceholders(LEARNING_AGENT_PROMPT, {
    recentDecisions: recentDecisions.map((d) => ({
      verdict: d.verdict,
      confidence: d.confidence,
      weightedScore: d.weightedScore,
      outcome: d.outcome?.type ?? null,
    })),
    currentIcp: icp?.criteria ?? null,
  });

  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await anthropic.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 4096,
        messages: [{ role: "user", content: userPrompt }],
        tools: [LEARNING_TOOL_SCHEMA],
        tool_choice: { type: "tool", name: TOOL_NAME },
      });

      const toolUseBlock = response.content.find((block) => block.type === "tool_use");
      if (!toolUseBlock || toolUseBlock.type !== "tool_use") {
        throw new Error("Claude response contained no tool_use block");
      }

      const output = learningAgentOutputSchema.parse(toolUseBlock.input);
      await upsertLearningInsights(teamId, { ...output, generatedAt: new Date().toISOString() });

      await createRecommendationsFromReport(teamId, output).catch((err) => {
        logger.warn({ err, teamId }, "Learning recommendation creation failed; report itself still stored");
      });

      return output;
    } catch (err) {
      lastError = err;
      logger.warn({ err, attempt, teamId }, "Learning Agent run failed; retrying if attempts remain");
    }
  }

  logger.error({ err: lastError, teamId }, "Learning Agent run failed after exhausting retries");
  return null;
}
