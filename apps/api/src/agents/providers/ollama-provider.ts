import type { LLMProvider, LLMCallParams, LLMCallResult } from "./llm-provider.interface.js";

export const DEFAULT_OLLAMA_BASE_URL = "http://localhost:11434";

/** Real /api/show response shape (confirmed 2026-07-28, Ollama 0.32.4) --
 *  only the field this function reads is typed. */
interface OllamaShowResponse {
  capabilities?: string[];
}

/** Queries Ollama's own declared capabilities for a model -- a cheap,
 *  no-inference check (a single HTTP call, no generation) that can rule a
 *  model out before spending any real wall-clock time on it. Real,
 *  confirmed examples: gemma3:4b -> ["completion","vision"] (no tool
 *  support at all -- Ollama's /api/chat outright rejects a tools request
 *  for it with a 400); phi3:3.8b -> ["completion"] (same); llama3.2:3b ->
 *  ["completion","tools"]. Used by eval/likelihood-harness.ts's pre-flight
 *  check, but lives here (not in the harness) since it's Ollama API
 *  surface, same as OllamaProvider.call itself. */
export async function getModelCapabilities(model: string, baseUrl: string = DEFAULT_OLLAMA_BASE_URL): Promise<string[]> {
  const response = await fetch(`${baseUrl}/api/show`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model }),
  });
  if (!response.ok) {
    throw new Error(`Ollama /api/show returned ${response.status}: ${await response.text()}`);
  }
  const body = (await response.json()) as OllamaShowResponse;
  return body.capabilities ?? [];
}

/** Ollama's real /api/chat response shape, confirmed via a live smoke test
 *  against llama3.2:3b (2026-07-27) -- not assumed from Ollama's docs. Only
 *  the fields this provider actually reads are typed; everything else
 *  Ollama returns (total_duration, load_duration, etc.) is ignored. */
interface OllamaChatResponse {
  message: {
    content: string;
    tool_calls?: Array<{ function: { name: string; arguments: unknown } }>;
  };
  done_reason?: string;
  prompt_eval_count?: number;
  eval_count?: number;
}

/** eval/likelihood-harness.ts's zero-cost local provider (Action B, "Option
 *  2: Zero-Cost Path") -- second LLMProvider implementation alongside
 *  ClaudeProvider, same interface, so callAgent's retry/validation logic
 *  doesn't need to know or care which one it's talking to.
 *
 * Not wired into the live decision pipeline anywhere: orchestrator.ts's
 * module-level `llmProvider` singleton is still `new
 * CircuitBreakerProvider(new ClaudeProvider())`, untouched. This class is
 * only ever instantiated by eval scripts that explicitly pass it as
 * callAgent's `provider` override.
 *
 * Real, observed constraint (this dev machine, 7.7GB total RAM): a 3B model
 * takes ~39s to load into memory on first call and then generates at
 * roughly 4 tokens/sec on CPU. Ollama keeps a model resident in memory for
 * a few minutes after last use by default, so back-to-back calls to the
 * same model avoid re-paying the load cost -- but generation speed itself
 * is a real hardware ceiling, not something this provider can paper over. */
export class OllamaProvider implements LLMProvider {
  constructor(
    private readonly baseUrl: string = DEFAULT_OLLAMA_BASE_URL,
    // Generous: a single stage call can legitimately take several minutes
    // at ~4 tokens/sec once max_tokens climbs into the thousands (Risk's
    // budget is 2560). Timing out too early would misreport a slow-but-
    // working call as a provider failure.
    private readonly timeoutMs: number = 600_000,
  ) {}

  async call(params: LLMCallParams): Promise<LLMCallResult> {
    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: AbortSignal.timeout(this.timeoutMs),
      body: JSON.stringify({
        model: params.model,
        messages: [
          { role: "system", content: params.system },
          { role: "user", content: params.userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: params.tool.name,
              description: params.tool.description,
              parameters: params.tool.input_schema,
            },
          },
        ],
        // Bug found 2026-07-28: without forcing, qwen2.5:3b never called
        // the tool at all (0/4 real attempts across two runs) -- it wrote
        // prose instead, unlike llama3.2:3b which happened to call the
        // tool anyway most of the time without being forced. Verified via
        // a real curl call: the identical request without tool_choice got
        // no tool_calls from qwen2.5:3b; adding tool_choice:"required" made
        // it call the tool correctly. Every likelihood-harness run before
        // this fix (llama3.2:3b included) ran without this -- their
        // protocol-compliance numbers reflect the model's behavior with an
        // unforced request, not a forced one; not retroactively corrected.
        tool_choice: "required",
        stream: false,
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama /api/chat returned ${response.status}: ${await response.text()}`);
    }

    const body = (await response.json()) as OllamaChatResponse;
    const toolCall = body.message.tool_calls?.[0];
    // Observed real shape has `arguments` already parsed to an object, but
    // Ollama's OpenAI-compatibility layer has shipped both a string and an
    // object across versions -- this handles both rather than assuming the
    // one version tested here is the only one this will ever run against.
    const toolInput =
      toolCall === undefined
        ? null
        : typeof toolCall.function.arguments === "string"
          ? (JSON.parse(toolCall.function.arguments) as unknown)
          : toolCall.function.arguments;

    return {
      toolInput,
      textContent: body.message.content || null,
      stopReason: body.done_reason ?? null,
      inputTokens: body.prompt_eval_count ?? 0,
      outputTokens: body.eval_count ?? 0,
    };
  }
}
