import { agentDebateOutputSchema, type AgentDebateOutput } from "@argus/shared";
import { CLAUDE_MODEL } from "../claude-client.js";
import {
  MASTER_SYSTEM_PROMPT,
  RESEARCH_AGENT_PROMPT,
  ICP_AGENT_PROMPT,
  INTENT_AGENT_PROMPT,
  RISK_AGENT_PROMPT,
  JUDGE_AGENT_PROMPT,
} from "../prompts.js";
import { RESEARCH_TOOL, ICP_TOOL, INTENT_TOOL, RISK_TOOL, JUDGE_TOOL, callAgent, type DecisionAgentInput } from "../orchestrator.js";
import type { ToolSchema } from "../providers/types.js";

/**
 * v4 roadmap Phase 9 -- Candidate 2 for the architecture benchmark
 * (standalone, not used by the live decision path). Reconstructs the
 * original Bible §8.1 design this session moved away from: all 5 agents +
 * judge in one Claude call, using the exact same verbatim §8.2-§8.7 prompt
 * text as the live pipeline (imported from prompts.ts, not re-typed).
 *
 * Deliberately NOT a literal revert to the original code, which used a
 * naive 4096-token ceiling split evenly across 5 sections -- that's what
 * caused both the original 62-70s latency *and* separately would truncate
 * given what's since been learned about real per-section content volume
 * (Research alone routinely needs 1,000-1,500 tokens). This uses a
 * generous combined ceiling and the same conciseness instruction already
 * proven to control verbosity in the pipeline, so the comparison is fair
 * rather than a strawman.
 */

const SINGLE_CALL_TOOL_NAME = "submit_full_debate";

const SINGLE_CALL_TOOL: ToolSchema = {
  name: SINGLE_CALL_TOOL_NAME,
  description: "Submit the complete 5-agent debate (research, icp, intent, risk, judge) in one response.",
  input_schema: {
    type: "object",
    properties: {
      research: RESEARCH_TOOL.input_schema,
      icp: ICP_TOOL.input_schema,
      intent: INTENT_TOOL.input_schema,
      risk: RISK_TOOL.input_schema,
      judge: JUDGE_TOOL.input_schema,
    },
    required: ["research", "icp", "intent", "risk", "judge"],
  },
};

// Generous but not unbounded: real per-stage volumes measured this session
// (Research ~1,000-1,500, ICP/Intent ~600-750 each, Risk ~900-1,500, Judge
// ~800-1,000) sum to roughly 4,200-5,450 -- 7,000 leaves real headroom
// without inviting the same truncation the pipeline split was built to fix.
const SINGLE_CALL_MAX_TOKENS = 7000;

function buildCombinedUserPrompt(input: DecisionAgentInput): string {
  // Each agent's own verbatim <agent>...</agent> block, with its own
  // {{placeholder}} tokens resolved the same way orchestrator.ts's
  // fillPlaceholders does -- but since this is one call, prior-stage
  // {{..._output}} tokens can't resolve to real JSON (nothing has run yet).
  // Matches the original v3 single-call design's own resolution: a plain
  // note that the section is produced in this same response, not a guess
  // at content that doesn't exist yet.
  const selfReferenceNote = (label: string) => `${label}\n"(produced in this same response -- see the ${label.replace(/[{}]/g, "")} section you are about to write below)"`;

  function resolvePlaceholders(template: string): string {
    return template
      .replace("{{prospect_data}}", `{{prospect_data}}\n${JSON.stringify(input.prospectData ?? null)}`)
      .replace("{{team_icp}}", `{{team_icp}}\n${JSON.stringify(input.teamIcp ?? null)}`)
      .replace("{{company_memory}}", `{{company_memory}}\n${JSON.stringify(input.companyMemory ?? null)}`)
      .replace("{{intent_signals}}", `{{intent_signals}}\n${JSON.stringify(input.intentSignals ?? null)}`)
      .replace("{{historical_engagement}}", `{{historical_engagement}}\n${JSON.stringify(input.historicalEngagement ?? null)}`)
      .replace("{{team_history}}", `{{team_history}}\n${JSON.stringify(input.teamHistory ?? null)}`)
      .replace("{{user_preferences}}", `{{user_preferences}}\n${JSON.stringify(input.userPreferences ?? null)}`)
      .replace("{{team_patterns}}", `{{team_patterns}}\n${JSON.stringify(input.teamPatterns ?? null)}`)
      .replace("{{research_output}}", selfReferenceNote("{{research_output}}"))
      .replace("{{icp_output}}", selfReferenceNote("{{icp_output}}"))
      .replace("{{intent_output}}", selfReferenceNote("{{intent_output}}"))
      .replace("{{risk_output}}", selfReferenceNote("{{risk_output}}"));
  }

  return [
    resolvePlaceholders(RESEARCH_AGENT_PROMPT),
    resolvePlaceholders(ICP_AGENT_PROMPT),
    resolvePlaceholders(INTENT_AGENT_PROMPT),
    resolvePlaceholders(RISK_AGENT_PROMPT),
    resolvePlaceholders(JUDGE_AGENT_PROMPT),
  ].join("\n\n");
}

function buildSystemPrompt(companyContext: string | null): string {
  const parts = [MASTER_SYSTEM_PROMPT];
  if (companyContext) {
    parts.push(
      `\n\nABOUT THE SELLER'S COMPANY (use this to make drafted messages specific, not generic):\n${companyContext}`,
    );
  }
  parts.push(
    `\n\nNOTE: Complete all 5 agents (research, icp, intent, risk, judge) in this single response and submit them together via the tool provided.`,
  );
  parts.push(
    `\n\nCONCISENESS: Keep every text field (summary, description, evidence, reasoning, etc.) to one tight sentence. Do not pad toward the token limit; stop once every section's required fields are complete.`,
  );
  return parts.join("");
}

export async function runAgentDebateSingleCall(
  input: DecisionAgentInput,
): Promise<{ output: AgentDebateOutput; processingTimeMs: number; usage: { inputTokens: number; outputTokens: number } }> {
  const startedAt = Date.now();
  const usage = { inputTokens: 0, outputTokens: 0 };

  const result = await callAgent(
    buildSystemPrompt(input.companyContext),
    buildCombinedUserPrompt(input),
    SINGLE_CALL_TOOL,
    agentDebateOutputSchema,
    SINGLE_CALL_MAX_TOKENS,
    usage,
  );

  return { output: result, processingTimeMs: Date.now() - startedAt, usage };
}
