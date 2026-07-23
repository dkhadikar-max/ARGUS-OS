import {
  AppError,
  agentDebateOutputSchema,
  researchAgentOutputSchema,
  icpAgentOutputSchema,
  intentAgentOutputSchema,
  riskAgentOutputSchema,
  judgeAgentOutputSchema,
  type AgentDebateOutput,
  type ResearchAgentOutput,
  type IcpAgentOutput,
  type IntentAgentOutput,
  type RiskAgentOutput,
} from "@argus/shared";
import type { ZodType } from "zod";
import { CLAUDE_MODEL } from "./claude-client.js";
import { logger } from "../lib/logger.js";
import {
  MASTER_SYSTEM_PROMPT,
  RESEARCH_AGENT_PROMPT,
  ICP_AGENT_PROMPT,
  INTENT_AGENT_PROMPT,
  RISK_AGENT_PROMPT,
  JUDGE_AGENT_PROMPT,
} from "./prompts.js";
import type { ToolSchema } from "./providers/types.js";
import type { LLMProvider } from "./providers/llm-provider.interface.js";
import { ClaudeProvider } from "./providers/claude-provider.js";

// v4 roadmap Phase 1: the only LLM call site in the pipeline goes through
// this interface now, not a direct Anthropic SDK call -- see
// providers/llm-provider.interface.ts for why (and why there's still only
// one implementation).
const llmProvider: LLMProvider = new ClaudeProvider();

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
  /** Free-text profile of the SELLER's own company (Team.companyContext) --
   *  not a Bible §8 placeholder, so it's appended to the system prompt at
   *  call time (see runAgentDebate) rather than injected into the
   *  verbatim §8.2-§8.7 templates in prompts.ts. Only affects the judge
   *  agent's drafted messages; nothing else in the debate needs it. */
  companyContext: string | null;
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

/** The prior stages' *real*, already schema-validated output, keyed by the
 *  same `{{..._output}}` tokens §8.4-§8.7 reference. Previously (single
 *  mega-call) there was no prior JSON to inject -- Claude produced every
 *  section in one response, so these were resolved to a self-reference note
 *  instead ("the risk section you produce in this same JSON response").
 *  Splitting the debate into a real pipeline means each stage now genuinely
 *  has its predecessors' finished, validated output to read, closing a
 *  latent self-consistency gap: e.g. the Judge agent now reviews the Risk
 *  agent's actual finalized assessment, not its own not-yet-written draft of
 *  what it expected Risk to say. */
interface StageOutputs {
  research?: ResearchAgentOutput;
  icp?: IcpAgentOutput;
  intent?: IntentAgentOutput;
  risk?: RiskAgentOutput;
}

const STAGE_OUTPUT_MAP: Record<string, keyof StageOutputs> = {
  "{{research_output}}": "research",
  "{{icp_output}}": "icp",
  "{{intent_output}}": "intent",
  "{{risk_output}}": "risk",
};

function fillPlaceholders(template: string, input: DecisionAgentInput, priorOutputs: StageOutputs): string {
  return template.replace(/\{\{[a-z_]+\}\}/g, (token) => {
    const stageKey = STAGE_OUTPUT_MAP[token];
    if (stageKey) {
      return `${token}\n${JSON.stringify(priorOutputs[stageKey] ?? null)}`;
    }
    const key = PLACEHOLDER_MAP[token];
    if (!key) return token;
    return `${token}\n${JSON.stringify(input[key] ?? null)}`;
  });
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

// Bible §16.1 Risk #1's own accuracy-vs-speed tradeoff note aside: the
// original design ran all 5 agents + judge in one Claude call (§8.1) to
// "minimize token overhead and keep verdict behavior reproducible." Live
// measurement found that call taking 62-70s (max_tokens 4096, generation-
// time bound, not network) -- 8-9x the Bible's own <8s verdict-generation
// target and past its own <15s red-flag guardrail. §8.3-§8.7's own input
// blocks already describe a real dependency graph, not a single joint
// generation: Research has no dependencies; ICP and Intent each depend only
// on Research (not on each other); Risk depends on Research+ICP+Intent;
// Judge depends on all four. This runs that graph as an actual pipeline --
// Research, then ICP+Intent in parallel, then Risk, then Judge -- instead
// of one call pretending to be all five at once. Each stage is schema-
// validated (and retried) independently: a Risk-stage failure no longer
// discards or re-rolls the Research/ICP/Intent output that already
// succeeded, which is both faster to recover from and more consistent than
// the old whole-debate retry (which could silently produce a *different*
// Research/ICP/Intent output on retry even though those weren't why the
// first attempt failed).
const MAX_ATTEMPTS = 2;

// v4 roadmap Phase 2 (Decision Value) -- accumulates real token usage
// across every stage call (including failed/retried attempts, which still
// cost real API spend) so a decision's actual inference cost is knowable,
// not estimated. Passed in and mutated rather than returned, so callAgent's
// own return type (Promise<T>, unchanged) doesn't need to become a tuple at
// all 5 call sites in runAgentDebate.
interface TokenUsageAccumulator {
  inputTokens: number;
  outputTokens: number;
}

async function callAgent<T>(
  system: string,
  userPrompt: string,
  tool: ToolSchema,
  schema: ZodType<T>,
  maxTokens: number,
  usage: TokenUsageAccumulator,
): Promise<T> {
  let lastError: unknown;
  // Live tests found the pipeline's total decision latency (112-116s) came in
  // *slower* than the original single-call design (62-70s) it was meant to
  // beat -- unexpected, since only Research/ICP+Intent/Risk/Judge's own
  // generation time was assumed to matter. Logging each stage's wall time
  // here (not just failures, as before) is what turns "the pipeline is
  // somehow slower" into an actual per-stage breakdown on the next live call,
  // instead of another guess.
  const callStartedAt = Date.now();

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    // Hoisted so the catch block below can report stop_reason/usage even when
    // the failure is a schema-validation error thrown after the API call
    // succeeded -- this is exactly what would have made the two live Risk-
    // stage truncation failures (1536 tokens still too tight, twice in a
    // row) instantly diagnosable from the log line instead of requiring a
    // guess-and-redeploy cycle to confirm truncation was the actual cause.
    let stopReason: string | null = null;
    try {
      const providerResponse = await llmProvider.call({ model: CLAUDE_MODEL, maxTokens, system, userPrompt, tool });
      stopReason = providerResponse.stopReason;
      // Counted on every attempt, not just a successful one -- a failed/
      // retried attempt still consumed real tokens Anthropic bills for.
      usage.inputTokens += providerResponse.inputTokens;
      usage.outputTokens += providerResponse.outputTokens;

      const parsed =
        providerResponse.toolInput !== null
          ? providerResponse.toolInput
          : (() => {
              // Fallback for a plain-text response (shouldn't happen with
              // tool_choice forcing the tool, but extractJson's ```-fence
              // stripping is cheap insurance against an unexpected shape).
              if (providerResponse.textContent === null) {
                throw new Error(`${tool.name}: Claude response contained neither a tool_use nor a text block`);
              }
              return extractJson(providerResponse.textContent);
            })();

      const result = schema.parse(parsed);
      logger.info(
        {
          agent: tool.name,
          attempt,
          durationMs: Date.now() - callStartedAt,
          maxTokens,
          outputTokens: providerResponse.outputTokens,
          inputTokens: providerResponse.inputTokens,
        },
        "Agent stage succeeded",
      );
      return result;
    } catch (err) {
      lastError = err;
      logger.warn(
        { err, attempt, agent: tool.name, maxTokens, stopReason, truncated: stopReason === "max_tokens" },
        "Agent stage failed; retrying if attempts remain",
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

const RESEARCH_TOOL: ToolSchema = {
  name: "submit_research",
  description: "Submit the Research Agent's analysis of this prospect (Bible §8.3).",
  input_schema: {
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
};

const ICP_TOOL: ToolSchema = {
  name: "submit_icp",
  description: "Submit the ICP Agent's fit assessment of this prospect (Bible §8.4).",
  input_schema: {
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
};

const INTENT_TOOL: ToolSchema = {
  name: "submit_intent",
  description: "Submit the Intent Agent's buying-signal assessment of this prospect (Bible §8.5).",
  input_schema: {
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
};

const RISK_TOOL: ToolSchema = {
  name: "submit_risk",
  description: "Submit the Risk Agent's assessment of this prospect (Bible §8.6).",
  input_schema: {
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
};

const JUDGE_TOOL: ToolSchema = {
  name: "submit_judge",
  description: "Submit the Judge Agent's final verdict and message drafts for this prospect (Bible §8.7).",
  input_schema: {
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
          linkedin: { type: ["string", "null"] },
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
};

/**
 * Runs the 5-agent + judge debate as a real pipeline (Research → ICP+Intent
 * in parallel → Risk → Judge), each stage independently validated against
 * its own Bible §8.3-§8.7 schema, and returns the combined, Zod-validated
 * output. See the MAX_ATTEMPTS comment above for why this replaced the
 * original single-call design.
 */
export async function runAgentDebate(
  input: DecisionAgentInput,
): Promise<{ output: AgentDebateOutput; processingTimeMs: number; usage: { inputTokens: number; outputTokens: number } }> {
  const startedAt = Date.now();

  // Appended rather than spliced into MASTER_SYSTEM_PROMPT itself, which
  // stays verbatim Bible §8.2 text. companyContext existed as an addendum
  // before this pipeline split; the pipeline note is new but same pattern --
  // MASTER_SYSTEM_PROMPT's own "OUTPUT FORMAT" section still describes the
  // old combined 5-section shape (accurate context, just no longer this
  // call's actual task), so each stage is told what it's actually being
  // asked for this time instead of leaving that stale text uncontradicted.
  function systemPromptFor(stageName: string): string {
    const parts = [MASTER_SYSTEM_PROMPT];
    if (input.companyContext) {
      parts.push(
        `\n\nABOUT THE SELLER'S COMPANY (use this to make drafted messages specific, not generic):\n${input.companyContext}`,
      );
    }
    parts.push(
      `\n\nNOTE: This call is one stage of a multi-stage pipeline. Complete only the "${stageName}" agent below and submit it via the tool provided -- the other agents run as separate calls, not in this same response.`,
    );
    // Live-timed per-stage breakdown (real prospect, isolated request): every
    // stage decodes at the same ~46-52 tokens/sec, so there's no fixed
    // per-call tax to blame -- the pipeline's 5,361 combined output tokens on
    // the critical path (vs. ~3,000-3,360 for equivalent content in the old
    // single call) is why total latency (111s) came in slower than the
    // original design (62-70s) it replaced. Each stage, freed from sharing
    // one 4096-token ceiling across all 5 sections, writes a fuller
    // standalone response with no collective budget pressure to compress --
    // this instruction targets that directly (prose density per field, not
    // the Bible-mandated item counts like "8-12 data points" or "3-5 risks",
    // which stay untouched).
    parts.push(
      `\n\nCONCISENESS: Keep every text field (summary, description, evidence, reasoning, etc.) to one tight sentence -- no restating facts already established by an earlier agent's output provided above, reference them briefly instead of re-explaining them. Do not pad toward the token limit; stop once the required fields are complete.`,
    );
    return parts.join("");
  }

  const usage: TokenUsageAccumulator = { inputTokens: 0, outputTokens: 0 };

  // Live-tested against a real prospect: 1024/800-token budgets (a rough
  // even split of the old combined call's 4096 across 5 sections) truncated
  // Research's response mid-`data_points` array before it reached
  // `confidence`/`data_gaps`, failing schema validation on both attempts and
  // exhausting the stage's retries -- Research is explicitly asked for
  // "8-12 specific data points" (Bible §8.3), the most content-heavy
  // specialist stage. max_tokens is a ceiling, not a target, so being more
  // generous here costs nothing when a stage doesn't need it.
  const research = await callAgent(
    systemPromptFor("research"),
    fillPlaceholders(RESEARCH_AGENT_PROMPT, input, {}),
    RESEARCH_TOOL,
    researchAgentOutputSchema,
    2048,
    usage,
  );

  const [icp, intent] = await Promise.all([
    callAgent(
      systemPromptFor("icp"),
      fillPlaceholders(ICP_AGENT_PROMPT, input, { research }),
      ICP_TOOL,
      icpAgentOutputSchema,
      1536,
      usage,
    ),
    callAgent(
      systemPromptFor("intent"),
      fillPlaceholders(INTENT_AGENT_PROMPT, input, { research }),
      INTENT_TOOL,
      intentAgentOutputSchema,
      1536,
      usage,
    ),
  ]);

  // Live-tested twice against a real prospect: 1536 tokens (Risk's share of
  // the original even split) truncated mid-response on BOTH attempts, always
  // losing the same trailing fields (time_waste_probability/
  // mitigation_strategies/confidence) -- Risk asks for 3-5 risk objects, each
  // with 5 text fields (category/severity/description/evidence/mitigation),
  // which is easily as verbose as Judge's own output. Matching Judge's 2560
  // budget rather than guessing at another intermediate number.
  const risk = await callAgent(
    systemPromptFor("risk"),
    fillPlaceholders(RISK_AGENT_PROMPT, input, { research, icp, intent }),
    RISK_TOOL,
    riskAgentOutputSchema,
    2560,
    usage,
  );

  const judge = await callAgent(
    systemPromptFor("judge"),
    fillPlaceholders(JUDGE_AGENT_PROMPT, input, { research, icp, intent, risk }),
    JUDGE_TOOL,
    judgeAgentOutputSchema,
    2560,
    usage,
  );

  const output = agentDebateOutputSchema.parse({ research, icp, intent, risk, judge });
  return { output, processingTimeMs: Date.now() - startedAt, usage };
}
