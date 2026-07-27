import { describe, expect, it, vi } from "vitest";
import { CircuitBreakerProvider } from "./circuit-breaker-provider.js";
import type { LLMCallParams, LLMProvider } from "./llm-provider.interface.js";
import { AppError } from "@argus/shared";

const sampleParams: LLMCallParams = {
  model: "claude-sonnet-4-6",
  maxTokens: 100,
  system: "s",
  userPrompt: "u",
  tool: { name: "submit_research", description: "d", input_schema: { type: "object", properties: {}, required: [] } },
};

function sampleResult() {
  return { toolInput: { ok: true }, textContent: null, stopReason: "tool_use", inputTokens: 10, outputTokens: 10 };
}

/** A fake, controllable clock -- real setTimeout-based tests for a 30s
 *  cooldown would be slow and flaky; this makes the passage of time
 *  deterministic and instant. */
function fakeClock(startAt = 0) {
  let now = startAt;
  return { now: () => now, advance: (ms: number) => { now += ms; } };
}

describe("CircuitBreakerProvider", () => {
  it("passes calls straight through to the real provider while closed", async () => {
    const inner: LLMProvider = { call: vi.fn().mockResolvedValue(sampleResult()) };
    const breaker = new CircuitBreakerProvider(inner);

    const result = await breaker.call(sampleParams);

    expect(result).toEqual(sampleResult());
    expect(inner.call).toHaveBeenCalledTimes(1);
    expect(breaker.getState()).toBe("closed");
  });

  it("opens after failureThreshold consecutive real failures, rejecting further calls WITHOUT calling the real provider", async () => {
    const inner: LLMProvider = { call: vi.fn().mockRejectedValue(new Error("network error")) };
    const breaker = new CircuitBreakerProvider(inner, { failureThreshold: 3 });

    await expect(breaker.call(sampleParams)).rejects.toThrow("network error");
    await expect(breaker.call(sampleParams)).rejects.toThrow("network error");
    await expect(breaker.call(sampleParams)).rejects.toThrow("network error");
    expect(breaker.getState()).toBe("open");
    expect(inner.call).toHaveBeenCalledTimes(3);

    await expect(breaker.call(sampleParams)).rejects.toMatchObject({ code: "AI_UNAVAILABLE" } satisfies Partial<AppError>);
    // The real provider was NOT called a 4th time -- this is the actual
    // fix: no wasted real network round trip once the breaker is open.
    expect(inner.call).toHaveBeenCalledTimes(3);
  });

  it("does not open before failureThreshold is reached, and a success resets the counter", async () => {
    const inner: LLMProvider = { call: vi.fn() };
    const breaker = new CircuitBreakerProvider(inner, { failureThreshold: 3 });
    (inner.call as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(new Error("e1"))
      .mockRejectedValueOnce(new Error("e2"))
      .mockResolvedValueOnce(sampleResult())
      .mockRejectedValueOnce(new Error("e3"))
      .mockRejectedValueOnce(new Error("e4"));

    await expect(breaker.call(sampleParams)).rejects.toThrow("e1");
    await expect(breaker.call(sampleParams)).rejects.toThrow("e2");
    await breaker.call(sampleParams); // real success -- resets consecutiveFailures to 0
    expect(breaker.getState()).toBe("closed");
    await expect(breaker.call(sampleParams)).rejects.toThrow("e3");
    await expect(breaker.call(sampleParams)).rejects.toThrow("e4");
    // Only 2 consecutive failures since the reset -- still closed, not 4.
    expect(breaker.getState()).toBe("closed");
  });

  it("moves to half_open once cooldownMs has elapsed, allowing exactly one real trial call", async () => {
    const clock = fakeClock();
    const inner: LLMProvider = { call: vi.fn().mockRejectedValue(new Error("network error")) };
    const breaker = new CircuitBreakerProvider(inner, { failureThreshold: 1, cooldownMs: 30_000, now: clock.now });

    await expect(breaker.call(sampleParams)).rejects.toThrow("network error");
    expect(breaker.getState()).toBe("open");

    clock.advance(15_000);
    expect(breaker.getState()).toBe("open"); // cooldown not elapsed yet

    clock.advance(15_001);
    expect(breaker.getState()).toBe("half_open");
  });

  it("closes and resets on a successful half_open trial call", async () => {
    const clock = fakeClock();
    const inner: LLMProvider = { call: vi.fn() };
    (inner.call as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("network error")).mockResolvedValueOnce(sampleResult());
    const breaker = new CircuitBreakerProvider(inner, { failureThreshold: 1, cooldownMs: 1_000, now: clock.now });

    await expect(breaker.call(sampleParams)).rejects.toThrow("network error");
    clock.advance(1_001);
    expect(breaker.getState()).toBe("half_open");

    const result = await breaker.call(sampleParams);

    expect(result).toEqual(sampleResult());
    expect(breaker.getState()).toBe("closed");
    // The real provider WAS called for the trial -- this is the recovery path.
    expect(inner.call).toHaveBeenCalledTimes(2);
  });

  it("reopens (restarting the cooldown) when the half_open trial call also fails", async () => {
    const clock = fakeClock();
    const inner: LLMProvider = { call: vi.fn().mockRejectedValue(new Error("still down")) };
    const breaker = new CircuitBreakerProvider(inner, { failureThreshold: 1, cooldownMs: 1_000, now: clock.now });

    await expect(breaker.call(sampleParams)).rejects.toThrow("still down");
    clock.advance(1_001);
    expect(breaker.getState()).toBe("half_open");

    await expect(breaker.call(sampleParams)).rejects.toThrow("still down");
    expect(breaker.getState()).toBe("open");

    // Cooldown restarted from THIS failure, not the original one.
    clock.advance(500);
    expect(breaker.getState()).toBe("open");
    clock.advance(501);
    expect(breaker.getState()).toBe("half_open");
  });

  it("never trips on a successful real call that merely carries no tool_use content (a schema-validation matter, not provider health)", async () => {
    // A "successful" LLMCallResult with nulls is still a real, non-throwing
    // call.callAgent (orchestrator.ts) is what decides that's a schema
    // failure -- CircuitBreakerProvider only ever sees provider.call()
    // itself throwing, never a schema outcome.
    const inner: LLMProvider = { call: vi.fn().mockResolvedValue({ toolInput: null, textContent: null, stopReason: "end_turn", inputTokens: 5, outputTokens: 5 }) };
    const breaker = new CircuitBreakerProvider(inner, { failureThreshold: 1 });

    await breaker.call(sampleParams);

    expect(breaker.getState()).toBe("closed");
  });
});
