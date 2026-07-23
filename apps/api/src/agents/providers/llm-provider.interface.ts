import type { ToolSchema } from "./types.js";

export interface LLMCallParams {
  model: string;
  maxTokens: number;
  system: string;
  userPrompt: string;
  tool: ToolSchema;
}

export interface LLMCallResult {
  toolInput: unknown | null;
  textContent: string | null;
  stopReason: string | null;
  inputTokens: number;
  outputTokens: number;
}

/**
 * v4 roadmap Phase 1: an interface boundary around "call an LLM with a
 * forced tool-use request and get a normalized response back," so a future
 * non-Claude provider would be a new class implementing this interface, not
 * a rewrite of callAgent()'s retry/validation logic in orchestrator.ts.
 *
 * Only ClaudeProvider exists. No adapter-selection logic, no per-provider
 * prompt formatting, no other provider -- per the explicit decision not to
 * build multi-provider support until there's a real need for it, not just
 * because a proposal document suggested it.
 */
export interface LLMProvider {
  call(params: LLMCallParams): Promise<LLMCallResult>;
}
