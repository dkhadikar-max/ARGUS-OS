import { AppError, agentDebateOutputSchema, type AgentDebateOutput } from "@argus/shared";
import { anthropic, CLAUDE_MODEL } from "./claude-client.js";
import { logger } from "../lib/logger.js";
import {
  MASTER_SYSTEM_PROMPT,
  RESEARCH_AGENT_PROMPT,
  ICP_AGENT_PROMPT,
  INTENT_AGENT_PROMPT,
  RISK_AGENT_PROMPT,
  JUDGE_AGENT_PROMPT,
} from "./prompts.js";

/** Inputs referenced by the `{{placeholder}}` tokens across §8.3-§8.7. */
export interface DecisionAgentInput {
  prospectData: unknown;
  teamIcp: unknown;
  companyMemory: unknown;
  intentSignals: unknown;
  historicalEngagement: unknown;
  teamHistory: unknown;
  userPreferences: unknown;
  teamPatterns: unknown;
}

const PLACEHOLDER_MAP: Record<string, keyof DecisionAgentInput> = {
  "{{prospect_data}}": "prospectData",
  "{{team_icp}}": "teamIcp",
  "{{company_memory}}": "companyMemory",
  "{{intent_signals}}": "intentSignals",
  "{{historical_engagement}}": "historicalEngagement",
  "{{team_history}}": "teamHistory",
  "{{user_preferences}}": "userPreferences",
  "{{team_patterns}}": "teamPatterns",
};

// §8.4-§8.7 write each agent as if it consumes the prior agent's finished
// JSON (e.g. the ICP agent takes `{{research_output}}`). Bible §8.1 instead
// runs all 5 agents in a single Claude call, so there is no prior JSON to
// inject — Claude produces every section of the one combined response
// itself. Substituting unrelated input data for these tokens would be
// actively misleading, so they're resolved to a self-reference note instead.
const SELF_REFERENCE_NOTE: Record<string, string> = {
  "{{research_output}}": "the \"research\" section you produce in this same JSON response",
  "{{icp_output}}": "the \"icp\" section you produce in this same JSON response",
  "{{intent_output}}": "the \"intent\" section you produce in this same JSON response",
  "{{risk_output}}": "the \"risk\" section you produce in this same JSON response",
};

function fillPlaceholders(template: string, input: DecisionAgentInput): string {
  return template.replace(/\{\{[a-z_]+\}\}/g, (token) => {
    const selfRef = SELF_REFERENCE_NOTE[token];
    if (selfRef) return selfRef;

    const key = PLACEHOLDER_MAP[token];
    if (!key) return token;
    return `${token}\n${JSON.stringify(input[key] ?? null)}`;
  });
}

function buildUserPrompt(input: DecisionAgentInput): string {
  return [
    RESEARCH_AGENT_PROMPT,
    ICP_AGENT_PROMPT,
    INTENT_AGENT_PROMPT,
    RISK_AGENT_PROMPT,
    JUDGE_AGENT_PROMPT,
  ]
    .map((template) => fillPlaceholders(template, input))
    .join("\n\n");
}

function extractJson(text: string): unknown {
  // §8.2 instructs Claude to return JSON with "no markdown fencing", but
  // models occasionally wrap output in ```json fences anyway — strip
  // defensively rather than failing a decision over formatting drift.
  const stripped = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  return JSON.parse(stripped);
}

const MAX_ATTEMPTS = 2;

/**
 * Runs the full 5-agent + judge debate in a single Claude call (Bible §8.1)
 * and returns the Zod-validated combined output. Retries once on malformed
 * JSON/schema drift before surfacing AI_UNAVAILABLE (Bible §10.7).
 */
export async function runAgentDebate(
  input: DecisionAgentInput,
): Promise<{ output: AgentDebateOutput; processingTimeMs: number }> {
  const startedAt = Date.now();
  const userPrompt = buildUserPrompt(input);

  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await anthropic.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 4096,
        system: MASTER_SYSTEM_PROMPT,
        messages: [{ role: "user", content: userPrompt }],
      });

      const textBlock = response.content.find((block) => block.type === "text");
      if (!textBlock || textBlock.type !== "text") {
        throw new Error("Claude response contained no text block");
      }

      const parsed = extractJson(textBlock.text);
      const output = agentDebateOutputSchema.parse(parsed);

      return { output, processingTimeMs: Date.now() - startedAt };
    } catch (err) {
      lastError = err;
      logger.warn(
        { err, attempt },
        "Agent debate attempt failed; retrying if attempts remain",
      );
    }
  }

  throw new AppError(
    "AI_UNAVAILABLE",
    "Unable to generate a decision right now. Please retry shortly.",
    undefined,
    { cause: lastError instanceof Error ? lastError.message : String(lastError) },
  );
}
