import { judgeAgentOutputSchema, type JudgeAgentOutput } from "@argus/shared";
import { callAgent, buildStagePrompt, type DecisionAgentInput, type StageOutputs, type TokenUsageAccumulator } from "./orchestrator.js";
import type { LLMProvider } from "./providers/llm-provider.interface.js";
import type { DecisionPack } from "./decision-pack.js";
import type { ExecutionContext } from "./reasoning-capability.js";

// v5.0 scaffolding, Increment 2 -- Judge as a named, swappable abstraction
// rather than a permanent inline special case in decision-engine.ts. Same
// treatment StageExecutor gave the other 4 stages in Increment 1: one real
// implementation today, but decision-engine.ts depends on the interface,
// not on callAgent directly, so a future different synthesis mechanism
// (a different pack's own judge logic, a non-LLM synthesizer) doesn't
// require redesigning DecisionEngine. Judge stays outside the capability
// system: it depends on all 4 prior stage outputs combined in a specific
// way, not a single-input capability in the same shape as the other 4 --
// see reasoning-capability.ts's own module comment for the same reasoning
// applied there.

export interface DecisionSynthesisInput {
  input: DecisionAgentInput;
  /** All 4 real stage outputs -- Judge needs them combined, unlike the
   *  other 4 capabilities, which each only need their own dependencies. */
  stageOutputs: StageOutputs;
}

export interface DecisionSynthesisResult {
  output: JudgeAgentOutput;
  usage: TokenUsageAccumulator;
  durationMs: number;
}

export interface DecisionSynthesizer {
  synthesize(input: DecisionSynthesisInput, ctx: ExecutionContext): Promise<DecisionSynthesisResult>;
}

/** The one real implementation: calls the exact same callAgent +
 *  buildStagePrompt + judgeAgentOutputSchema + pack.stageTools.judge that
 *  execution-runtime.ts already calls for Judge today -- not a
 *  reimplementation, same pattern as createCallAgentStageExecutor. */
export function createCallAgentDecisionSynthesizer(pack: DecisionPack, provider?: LLMProvider): DecisionSynthesizer {
  return {
    async synthesize({ input, stageOutputs }, ctx) {
      void ctx; // not yet consulted -- see ExecutionContext's own comment on scope
      const usage: TokenUsageAccumulator = { inputTokens: 0, outputTokens: 0 };
      const startedAt = Date.now();
      const prompt = buildStagePrompt("judge", pack.stagePrompts.judge, input, stageOutputs);
      const output = provider
        ? await callAgent(prompt.system, prompt.userPrompt, pack.stageTools.judge, judgeAgentOutputSchema, 2560, usage, undefined, provider)
        : await callAgent(prompt.system, prompt.userPrompt, pack.stageTools.judge, judgeAgentOutputSchema, 2560, usage);
      return { output, usage, durationMs: Date.now() - startedAt };
    },
  };
}
