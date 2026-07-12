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

const TOOL_NAME = "submit_decision";

// Mirrors agentDebateOutputSchema (packages/shared/src/schemas/agents.ts)
// field-for-field. Live-tested against a real Claude call: asking the model
// to freeform JSON per the <output_format> blocks in prompts.ts was found to
// be unreliable in practice (e.g. it renamed risk.risks to risk.flags and
// dropped judge.weighted_score/agent_consensus/key_evidence entirely, even
// though the prompt explicitly lists them). Passing this as a forced tool
// call makes the API enforce the shape at decode time instead of hoping the
// model follows natural-language instructions.
const DECISION_TOOL_SCHEMA = {
  name: TOOL_NAME,
  description: "Submit the combined 5-agent debate output for this prospect.",
  input_schema: {
    type: "object",
    properties: {
      research: {
        type: "object",
        properties: {
          summary: { type: "string" },
          data_points: {
            type: "array",
            items: {
              type: "object",
              properties: {
                type: { type: "string", enum: ["firmographic", "demographic", "technographic", "intent", "risk"] },
                signal: { type: "string" },
                relevance: { type: "string" },
              },
              required: ["type", "signal", "relevance"],
            },
          },
          unfair_advantages: { type: "array", items: { type: "string" } },
          hidden_risks: { type: "array", items: { type: "string" } },
          confidence: { type: "number" },
          data_gaps: { type: "array", items: { type: "string" } },
        },
        required: ["summary", "data_points", "unfair_advantages", "hidden_risks", "confidence", "data_gaps"],
      },
      icp: {
        type: "object",
        properties: {
          score: { type: "number" },
          criteria_evaluated: {
            type: "array",
            items: {
              type: "object",
              properties: {
                criterion: { type: "string" },
                weight: { type: "number" },
                match: { type: "number", enum: [0, 0.5, 1] },
                evidence: { type: "string" },
                reasoning: { type: "string" },
              },
              required: ["criterion", "weight", "match", "evidence", "reasoning"],
            },
          },
          overall_assessment: { type: "string" },
          edge_cases: { type: "array", items: { type: "string" } },
          confidence: { type: "number" },
        },
        required: ["score", "criteria_evaluated", "overall_assessment", "edge_cases", "confidence"],
      },
      intent: {
        type: "object",
        properties: {
          score: { type: "number" },
          signals: {
            type: "array",
            items: {
              type: "object",
              properties: {
                signal: { type: "string" },
                raw_score: { type: "number" },
                weighted_score: { type: "number" },
                recency_days: { type: "number" },
                reasoning: { type: "string" },
              },
              required: ["signal", "raw_score", "weighted_score", "recency_days", "reasoning"],
            },
          },
          trajectory: { type: "string", enum: ["increasing", "stable", "decreasing", "unknown"] },
          false_intent_flags: { type: "array", items: { type: "string" } },
          confidence: { type: "number" },
        },
        required: ["score", "signals", "trajectory", "false_intent_flags", "confidence"],
      },
      risk: {
        type: "object",
        properties: {
          score: { type: "number" },
          risks: {
            type: "array",
            items: {
              type: "object",
              properties: {
                category: { type: "string" },
                severity: { type: "string", enum: ["dealbreaker", "moderate", "minor"] },
                description: { type: "string" },
                evidence: { type: "string" },
                mitigation: { type: "string" },
              },
              required: ["category", "severity", "description", "evidence", "mitigation"],
            },
          },
          red_flags: { type: "array", items: { type: "string" } },
          time_waste_probability: { type: "number" },
          mitigation_strategies: { type: "array", items: { type: "string" } },
          confidence: { type: "number" },
        },
        required: ["score", "risks", "red_flags", "time_waste_probability", "mitigation_strategies", "confidence"],
      },
      judge: {
        type: "object",
        properties: {
          verdict: { type: "string", enum: ["STRONG_YES", "YES", "WAIT", "PASS", "HARD_PASS"] },
          confidence: { type: "number" },
          weighted_score: { type: "number" },
          agent_consensus: { type: "string", enum: ["high", "medium", "low"] },
          conflicts: { type: "array", items: { type: "string" } },
          reasoning: { type: "string" },
          key_evidence: { type: "array", items: { type: "string" } },
          message: {
            type: "object",
            properties: {
              linkedin: { type: "string" },
              email: { type: ["string", "null"] },
              tone: { type: "string", enum: ["professional", "casual", "bold", "friendly"] },
              personalization_hooks: { type: "array", items: { type: "string" } },
            },
            required: ["linkedin", "email", "tone", "personalization_hooks"],
          },
          recommended_action: { type: "string", enum: ["message_now", "research_more", "wait_for_signal", "pass_and_move_on"] },
          confidence_explanation: { type: "string" },
        },
        required: [
          "verdict",
          "confidence",
          "weighted_score",
          "agent_consensus",
          "conflicts",
          "reasoning",
          "key_evidence",
          "message",
          "recommended_action",
          "confidence_explanation",
        ],
      },
    },
    required: ["research", "icp", "intent", "risk", "judge"],
  },
} as const;

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
        tools: [DECISION_TOOL_SCHEMA],
        tool_choice: { type: "tool", name: TOOL_NAME },
      });

      const toolUseBlock = response.content.find((block) => block.type === "tool_use");
      const parsed =
        toolUseBlock && toolUseBlock.type === "tool_use"
          ? toolUseBlock.input
          : (() => {
              // Fallback for a plain-text response (shouldn't happen with
              // tool_choice forcing the tool, but extractJson's ```-fence
              // stripping is cheap insurance against an unexpected shape).
              const textBlock = response.content.find((block) => block.type === "text");
              if (!textBlock || textBlock.type !== "text") {
                throw new Error("Claude response contained neither a tool_use nor a text block");
              }
              return extractJson(textBlock.text);
            })();

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
