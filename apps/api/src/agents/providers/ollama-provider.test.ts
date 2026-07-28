import { describe, expect, it, vi, afterEach } from "vitest";
import { OllamaProvider } from "./ollama-provider.js";
import type { LLMCallParams } from "./llm-provider.interface.js";

const sampleParams: LLMCallParams = {
  model: "qwen2.5:3b",
  maxTokens: 100,
  system: "s",
  userPrompt: "u",
  tool: { name: "submit_research", description: "d", input_schema: { type: "object", properties: {}, required: [] } },
};

function fakeOllamaResponse(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    ok: true,
    json: () =>
      Promise.resolve({
        message: { content: "", tool_calls: [{ function: { name: "submit_research", arguments: { ok: true } } }] },
        done_reason: "stop",
        prompt_eval_count: 10,
        eval_count: 5,
        ...overrides,
      }),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("OllamaProvider", () => {
  it("forces tool_choice so the model can't silently skip calling the tool (bug found 2026-07-28: qwen2.5:3b never called an unforced tool)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeOllamaResponse());
    vi.stubGlobal("fetch", fetchMock);
    const provider = new OllamaProvider();

    await provider.call(sampleParams);

    const body = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string) as Record<string, unknown>;
    expect(body.tool_choice).toBe("required");
    expect(body.model).toBe("qwen2.5:3b");
    expect((body.tools as Array<{ function: { name: string } }>)[0]?.function.name).toBe("submit_research");
  });

  it("parses a real tool_calls response into toolInput, including when arguments arrive as a JSON string (observed across Ollama versions)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(fakeOllamaResponse({ message: { content: "", tool_calls: [{ function: { name: "submit_research", arguments: '{"score":5}' } }] } })),
    );
    const provider = new OllamaProvider();

    const result = await provider.call(sampleParams);

    expect(result.toolInput).toEqual({ score: 5 });
    expect(result.stopReason).toBe("stop");
    expect(result.inputTokens).toBe(10);
    expect(result.outputTokens).toBe(5);
  });

  it("returns toolInput null when the model produced no tool_use block at all (the real qwen2.5:3b failure mode before the tool_choice fix)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeOllamaResponse({ message: { content: "some prose instead of a tool call" } })));
    const provider = new OllamaProvider();

    const result = await provider.call(sampleParams);

    expect(result.toolInput).toBeNull();
    expect(result.textContent).toBe("some prose instead of a tool call");
  });

  it("throws with the response body when Ollama returns a non-ok HTTP status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500, text: () => Promise.resolve("model not found") }));
    const provider = new OllamaProvider();

    await expect(provider.call(sampleParams)).rejects.toThrow(/500.*model not found/);
  });
});
