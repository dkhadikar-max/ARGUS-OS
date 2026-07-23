import { anthropic } from "../claude-client.js";
import type { LLMProvider, LLMCallParams, LLMCallResult } from "./llm-provider.interface.js";

/** The only LLMProvider implementation. Wraps exactly the same
 *  anthropic.messages.create() call orchestrator.ts made directly before
 *  this extraction -- same params, same tool-forcing, same response
 *  parsing. Zero behavior change; this is a pure extraction behind an
 *  interface, not a rewrite. */
export class ClaudeProvider implements LLMProvider {
  async call(params: LLMCallParams): Promise<LLMCallResult> {
    const response = await anthropic.messages.create({
      model: params.model,
      max_tokens: params.maxTokens,
      system: params.system,
      messages: [{ role: "user", content: params.userPrompt }],
      tools: [params.tool],
      tool_choice: { type: "tool", name: params.tool.name },
    });

    const toolUseBlock = response.content.find((block) => block.type === "tool_use");
    const textBlock = response.content.find((block) => block.type === "text");

    return {
      toolInput: toolUseBlock && toolUseBlock.type === "tool_use" ? toolUseBlock.input : null,
      textContent: textBlock && textBlock.type === "text" ? textBlock.text : null,
      stopReason: response.stop_reason,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    };
  }
}
