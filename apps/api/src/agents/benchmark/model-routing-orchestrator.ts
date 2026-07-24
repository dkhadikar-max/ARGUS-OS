import {
  agentDebateOutputSchema,
  researchAgentOutputSchema,
  icpAgentOutputSchema,
  intentAgentOutputSchema,
  riskAgentOutputSchema,
  judgeAgentOutputSchema,
  type AgentDebateOutput,
} from "@argus/shared";
import { CLAUDE_MODEL } from "../claude-client.js";
import { RESEARCH_AGENT_PROMPT, ICP_AGENT_PROMPT, INTENT_AGENT_PROMPT, RISK_AGENT_PROMPT, JUDGE_AGENT_PROMPT } from "../prompts.js";
import {
  callAgent,
  fillPlaceholders,
  systemPromptFor,
  RESEARCH_TOOL,
  ICP_TOOL,
  INTENT_TOOL,
  RISK_TOOL,
  JUDGE_TOOL,
  type DecisionAgentInput,
  type TokenUsageAccumulator,
} from "../orchestrator.js";

/**
 * v4 roadmap Phase 14 (docs/ARCHITECTURE_V4.md, "Dynamic Model Routing"
 * benchmark) -- runs the same Research -> ICP+Intent -> Risk -> Judge
 * dependency graph as runAgentDebate, but lets each stage's model be
 * independently overridden. Standalone, unwired benchmark candidate --
 * mirrors single-call-orchestrator.ts / pipeline-with-conflict-orchestrator.ts's
 * pattern of reusing callAgent/fillPlaceholders/systemPromptFor/the real tool
 * schemas rather than duplicating agent logic.
 *
 * Per-agent, not "all agents at once": the user's own plan explicitly wants
 * Research/ICP/Intent/Risk benchmarked independently against Sonnet (keeping
 * Judge fixed on Sonnet, since it's the synthesis/reasoning stage), so a
 * winning combination isn't assumed to be "all Haiku except Judge" -- it
 * could be e.g. Research+Intent on Haiku, ICP+Risk staying on Sonnet.
 */
export const HAIKU_MODEL = "claude-haiku-4-5";

export interface AgentModelOverrides {
  research?: string;
  icp?: string;
  intent?: string;
  risk?: string;
  judge?: string;
}

export async function runAgentDebateWithModelRouting(
  input: DecisionAgentInput,
  models: AgentModelOverrides,
): Promise<{ output: AgentDebateOutput; processingTimeMs: number; usage: TokenUsageAccumulator }> {
  const startedAt = Date.now();
  const usage: TokenUsageAccumulator = { inputTokens: 0, outputTokens: 0 };

  const research = await callAgent(
    systemPromptFor("research", input.companyContext),
    fillPlaceholders(RESEARCH_AGENT_PROMPT, input, {}),
    RESEARCH_TOOL,
    researchAgentOutputSchema,
    2048,
    usage,
    models.research ?? CLAUDE_MODEL,
  );

  const [icp, intent] = await Promise.all([
    callAgent(
      systemPromptFor("icp", input.companyContext),
      fillPlaceholders(ICP_AGENT_PROMPT, input, { research }),
      ICP_TOOL,
      icpAgentOutputSchema,
      1536,
      usage,
      models.icp ?? CLAUDE_MODEL,
    ),
    callAgent(
      systemPromptFor("intent", input.companyContext),
      fillPlaceholders(INTENT_AGENT_PROMPT, input, { research }),
      INTENT_TOOL,
      intentAgentOutputSchema,
      1536,
      usage,
      models.intent ?? CLAUDE_MODEL,
    ),
  ]);

  const risk = await callAgent(
    systemPromptFor("risk", input.companyContext),
    fillPlaceholders(RISK_AGENT_PROMPT, input, { research, icp, intent }),
    RISK_TOOL,
    riskAgentOutputSchema,
    2560,
    usage,
    models.risk ?? CLAUDE_MODEL,
  );

  const judge = await callAgent(
    systemPromptFor("judge", input.companyContext),
    fillPlaceholders(JUDGE_AGENT_PROMPT, input, { research, icp, intent, risk }),
    JUDGE_TOOL,
    judgeAgentOutputSchema,
    2560,
    usage,
    models.judge ?? CLAUDE_MODEL,
  );

  const output = agentDebateOutputSchema.parse({ research, icp, intent, risk, judge });
  return { output, processingTimeMs: Date.now() - startedAt, usage };
}
