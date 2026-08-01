import { describe, expect, it, vi, beforeEach } from "vitest";
import { AppError, type AgentDebateOutput, type Verdict } from "@argus/shared";
import { logger } from "../lib/logger.js";

const evaluateMock = vi.fn();
vi.mock("./decision-engine.js", () => ({ evaluate: evaluateMock }));

const prisma = { shadowDecision: { create: vi.fn() } };
vi.mock("@argus/database", () => ({ prisma }));

const increment = vi.fn();
const timing = vi.fn();
vi.mock("../lib/datadog.js", () => ({ increment, timing }));

const recordShadowError = vi.fn();
vi.mock("./shadow-error-log.js", () => ({ recordShadowError }));

const resolveShadowSampling = vi.fn();
vi.mock("./shadow-rollout.service.js", () => ({ resolveShadowSampling }));

// Only relevant to the "independent circuit breaker wiring" tests below --
// every other test in this file bypasses the real provider chain entirely
// via the evaluate() mock above, so this has no effect on them. Mocked
// here (not left real) so exercising createShadowLlmProvider()'s real,
// unmocked CircuitBreakerProvider never risks a real Anthropic network
// call.
const claudeProviderCall = vi.fn();
vi.mock("./providers/claude-provider.js", () => ({
  // A `function` (not arrow) implementation -- vitest's mock needs to be
  // usable with `new` here, since the real ClaudeProvider is constructed
  // with `new ClaudeProvider()`.
  ClaudeProvider: vi.fn().mockImplementation(function ClaudeProvider() {
    return { call: claudeProviderCall };
  }),
}));

vi.mock("../config/env.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../config/env.js")>();
  return { env: { ...actual.env } };
});

const { runShadowDecision, createShadowLlmProvider, getShadowCircuitBreakerState } = await import("./shadow-runner.service.js");
const { env } = await import("../config/env.js");
// Real, unmocked module -- shadow-runner.service.js exercises its actual
// counter; reset between tests since it's process-level module state.
const { __resetShadowConcurrencyForTests } = await import("./shadow-concurrency.js");

function agentDebateOutput(overrides: { verdict?: Verdict; confidence?: number; weighted_score?: number } = {}): AgentDebateOutput {
  return {
    research: { summary: "s", data_points: [], unfair_advantages: [], hidden_risks: [], confidence: 80, data_gaps: [] },
    icp: { score: 80, criteria_evaluated: [], overall_assessment: "ok", edge_cases: [], confidence: 80 },
    intent: { score: 70, signals: [], trajectory: "stable", false_intent_flags: [], confidence: 75 },
    risk: { score: 10, risks: [], red_flags: [], time_waste_probability: 10, mitigation_strategies: [], confidence: 80 },
    judge: {
      verdict: overrides.verdict ?? "YES",
      confidence: overrides.confidence ?? 80,
      weighted_score: overrides.weighted_score ?? 78, // 78 -> scoreToVerdict -> YES (70-89 band)
      agent_consensus: "high",
      conflicts: [],
      reasoning: "ok",
      key_evidence: [],
      message: { linkedin: null, email: null, tone: "professional", personalization_hooks: [] },
      recommended_action: "message_now",
      confidence_explanation: "ok",
    },
  };
}

function baseInput(overrides: Partial<Parameters<typeof runShadowDecision>[0]> = {}) {
  return {
    decisionId: "dec_1",
    teamId: "team_1",
    userId: "user_1",
    prospectId: "prospect_1", // arbitrary -- tests use sample rate 0/100 for determinism, never a fractional rate
    prospectName: "Sarah Chen",
    context: {} as never,
    liveOutput: agentDebateOutput(),
    liveVerdict: "YES" as const,
    liveProcessingTimeMs: 3000,
    liveUsage: { inputTokens: 1000, outputTokens: 500 },
    liveControllerAction: "stop" as string | null,
    liveControllerTargetCapability: null as string | null,
    ...overrides,
  };
}

function shadowResult(overrides: { verdict?: Verdict; confidence?: number; weighted_score?: number; controllerAction?: string; controllerTargetCapability?: string | null } = {}) {
  return {
    output: agentDebateOutput(overrides),
    processingTimeMs: 4000,
    usage: { inputTokens: 1200, outputTokens: 600 },
    executionId: "exec_1",
    graph: { decisionId: "dec_1", states: new Map() }, // must never be persisted -- see the graph-exclusion test below
    controllerDecision: { action: overrides.controllerAction ?? "stop", targetCapability: overrides.controllerTargetCapability, reasons: ["real reason"] },
    executionTrace: { requestId: "exec_1", packId: "sales-lead-qualification-v1", model: "claude-sonnet-4-6", controllerDecisions: [], executedNodes: [], skippedNodes: [], synthesizerOutput: {}, timings: [], costs: [] },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  env.SHADOW_MODE_ENABLED = false;
  resolveShadowSampling.mockResolvedValue(false); // real default -- no rollout config row means fail-closed
  // Generous enough that none of the pre-existing tests below trip these
  // new gates incidentally -- only the dedicated "concurrency limiting"/
  // "timeout" describe blocks override them to something tight.
  env.SHADOW_MAX_CONCURRENT = 10;
  env.SHADOW_TIMEOUT_MS = 60000;
  __resetShadowConcurrencyForTests();
  prisma.shadowDecision.create.mockResolvedValue({ id: "shadow_1" });
});

describe("runShadowDecision", () => {
  it("SHADOW_MODE_ENABLED false -- evaluate() and persistence never called, regardless of sample rate", async () => {
    env.SHADOW_MODE_ENABLED = false;
    resolveShadowSampling.mockResolvedValue(true);

    await runShadowDecision(baseInput());

    expect(evaluateMock).not.toHaveBeenCalled();
    expect(prisma.shadowDecision.create).not.toHaveBeenCalled();
  });

  it("SHADOW_MODE_ENABLED true, resolveShadowSampling false -- still never called (rollout gate is independent of the kill switch)", async () => {
    env.SHADOW_MODE_ENABLED = true;
    resolveShadowSampling.mockResolvedValue(false);

    await runShadowDecision(baseInput());

    expect(evaluateMock).not.toHaveBeenCalled();
    expect(prisma.shadowDecision.create).not.toHaveBeenCalled();
  });

  it("both gates open -- evaluate() is called once with the real pack/input/identity", async () => {
    env.SHADOW_MODE_ENABLED = true;
    resolveShadowSampling.mockResolvedValue(true);
    evaluateMock.mockResolvedValue(shadowResult());

    await runShadowDecision(baseInput());

    expect(evaluateMock).toHaveBeenCalledTimes(1);
    const [pack, input, identity] = evaluateMock.mock.calls[0]!;
    expect(pack.id).toBeDefined();
    expect(input).toBeDefined();
    expect(identity).toEqual({ teamId: "team_1", userId: "user_1", prospectId: "prospect_1", prospectName: "Sarah Chen" });
  });

  it("resolveShadowSampling (Gate 3 Increment 1.8's DB-backed rollout gate) is called with the real prospectId and teamId", async () => {
    env.SHADOW_MODE_ENABLED = true;
    resolveShadowSampling.mockResolvedValue(true);
    evaluateMock.mockResolvedValue(shadowResult());

    await runShadowDecision(baseInput({ prospectId: "prospect_42", teamId: "team_7" }));

    expect(resolveShadowSampling).toHaveBeenCalledWith("prospect_42", "team_7");
  });

  it("success path -- persists correct FKs, derived verdict (scoreToVerdict, not output.judge.verdict), and never touches result.graph", async () => {
    env.SHADOW_MODE_ENABLED = true;
    resolveShadowSampling.mockResolvedValue(true);
    // weighted_score 25 -> scoreToVerdict -> HARD_PASS, but judge.verdict itself says "YES" (the real mislabeling bug this must NOT reproduce)
    evaluateMock.mockResolvedValue(shadowResult({ verdict: "YES", weighted_score: 25 }));

    await runShadowDecision(baseInput());

    expect(prisma.shadowDecision.create).toHaveBeenCalledTimes(1);
    const data = prisma.shadowDecision.create.mock.calls[0]![0].data;
    expect(data.decisionId).toBe("dec_1");
    expect(data.teamId).toBe("team_1");
    expect(data.userId).toBe("user_1");
    expect(data.prospectId).toBe("prospect_1");
    expect(data.executionId).toBe("exec_1");
    expect(data.verdict).toBe("HARD_PASS"); // derived, not the raw (wrong) "YES" judge label
    expect(data).not.toHaveProperty("graph");
    expect(JSON.stringify(data)).not.toContain("states"); // graph's own shape never leaked in via agentOutputs/executionTrace either
  });

  it("evaluate() throws -- resolves cleanly, never persists, logs + increments the right error reason", async () => {
    env.SHADOW_MODE_ENABLED = true;
    resolveShadowSampling.mockResolvedValue(true);
    evaluateMock.mockRejectedValue(new Error("real provider failure"));
    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => logger);

    await expect(runShadowDecision(baseInput())).resolves.toBeUndefined();

    expect(prisma.shadowDecision.create).not.toHaveBeenCalled();
    expect(increment).toHaveBeenCalledWith("shadow.decision.error", { reason: "evaluate_threw" });
    expect(recordShadowError).toHaveBeenCalledWith("evaluate_threw");
    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({ decisionId: "dec_1", teamId: "team_1", prospectId: "prospect_1" }),
      "Shadow Runner: evaluate() failed; live decision unaffected",
    );
  });

  it("evaluate() rejects with a breaker-open AppError -- records reason breaker_open, not evaluate_threw", async () => {
    env.SHADOW_MODE_ENABLED = true;
    resolveShadowSampling.mockResolvedValue(true);
    evaluateMock.mockRejectedValue(new AppError("AI_UNAVAILABLE", "Unable to generate a decision right now. Please retry shortly."));

    await expect(runShadowDecision(baseInput())).resolves.toBeUndefined();

    expect(prisma.shadowDecision.create).not.toHaveBeenCalled();
    expect(increment).toHaveBeenCalledWith("shadow.decision.error", { reason: "breaker_open" });
    expect(increment).not.toHaveBeenCalledWith("shadow.decision.error", { reason: "evaluate_threw" });
    expect(recordShadowError).toHaveBeenCalledWith("breaker_open");
  });

  it("persistence throws -- resolves cleanly, logs + increments persist_failed", async () => {
    env.SHADOW_MODE_ENABLED = true;
    resolveShadowSampling.mockResolvedValue(true);
    evaluateMock.mockResolvedValue(shadowResult());
    prisma.shadowDecision.create.mockRejectedValue(new Error("db down"));
    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => logger);

    await expect(runShadowDecision(baseInput())).resolves.toBeUndefined();

    expect(increment).toHaveBeenCalledWith("shadow.decision.error", { reason: "persist_failed" });
    expect(recordShadowError).toHaveBeenCalledWith("persist_failed");
    expect(warnSpy).toHaveBeenCalledWith(expect.objectContaining({ decisionId: "dec_1" }), "Shadow Runner: persistence failed; shadow result discarded");
  });

  it("metrics fire the right number of times on success -- timing once, count once, one disagreement.count per real category", async () => {
    env.SHADOW_MODE_ENABLED = true;
    resolveShadowSampling.mockResolvedValue(true);
    // live: YES/conf80/stop; shadow: WAIT (mismatch) at conf 80 (no delta) with a differing controller action -> 2 categories
    evaluateMock.mockResolvedValue(shadowResult({ verdict: "WAIT", confidence: 80, weighted_score: 55, controllerAction: "continue" }));

    await runShadowDecision(baseInput({ liveControllerAction: "stop" }));

    expect(timing).toHaveBeenCalledTimes(1);
    expect(timing).toHaveBeenCalledWith("shadow.decision.duration", expect.any(Number));
    expect(increment).toHaveBeenCalledWith("shadow.decision.count", { verdictAgreement: "false" });
    expect(increment).toHaveBeenCalledWith("shadow.disagreement.count", { category: "verdict_mismatch" });
    expect(increment).toHaveBeenCalledWith("shadow.disagreement.count", { category: "controller_action_mismatch" });
  });

  it("no disagreement categories -- shadow.disagreement.count is never called", async () => {
    env.SHADOW_MODE_ENABLED = true;
    resolveShadowSampling.mockResolvedValue(true);
    evaluateMock.mockResolvedValue(shadowResult({ verdict: "YES", confidence: 80, weighted_score: 78, controllerAction: "stop" }));

    await runShadowDecision(baseInput({ liveControllerAction: "stop" }));

    expect(increment).not.toHaveBeenCalledWith("shadow.disagreement.count", expect.anything());
  });

  it("live side has no real controller action (cache hit / legacy pipeline) -- persisted controllerComparisonApplicable is false, no controller_action_mismatch even though actions differ", async () => {
    env.SHADOW_MODE_ENABLED = true;
    resolveShadowSampling.mockResolvedValue(true);
    evaluateMock.mockResolvedValue(shadowResult({ verdict: "YES", confidence: 80, weighted_score: 78, controllerAction: "invoke_capability", controllerTargetCapability: "risk" }));

    await runShadowDecision(baseInput({ liveControllerAction: null, liveControllerTargetCapability: null }));

    const data = prisma.shadowDecision.create.mock.calls[0]![0].data;
    expect(data.controllerComparisonApplicable).toBe(false);
    expect(data.disagreementCategories).not.toContain("controller_action_mismatch");
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("concurrency limiting (Gate 3 Increment 1.5)", () => {
  it("at the concurrency limit -- evaluate() is not called for the dropped call, shadow.decision.dropped increments, resolves cleanly", async () => {
    env.SHADOW_MODE_ENABLED = true;
    resolveShadowSampling.mockResolvedValue(true);
    env.SHADOW_MAX_CONCURRENT = 1;
    const first = deferred<ReturnType<typeof shadowResult>>();
    evaluateMock.mockReturnValueOnce(first.promise); // never resolves within this test

    const p1 = runShadowDecision(baseInput()); // fired, not awaited -- occupies the only slot
    await Promise.resolve(); // let p1 reach and pass the concurrency check synchronously

    await runShadowDecision(baseInput()); // second call: must be dropped, must resolve immediately

    expect(evaluateMock).toHaveBeenCalledTimes(1);
    expect(increment).toHaveBeenCalledWith("shadow.decision.dropped", { reason: "concurrency_limit" });
    // A drop is capacity telemetry, not a failure -- must never be recorded
    // as a shadow error (would falsely inflate the Shadow Health card's
    // Errors count for something that isn't an error).
    expect(recordShadowError).not.toHaveBeenCalled();

    first.resolve(shadowResult()); // let the first call finish so nothing leaks past this test
    await p1;
  });

  it("a released slot (evaluate() resolved) allows a subsequent call through", async () => {
    env.SHADOW_MODE_ENABLED = true;
    resolveShadowSampling.mockResolvedValue(true);
    env.SHADOW_MAX_CONCURRENT = 1;
    evaluateMock.mockResolvedValueOnce(shadowResult());
    await runShadowDecision(baseInput());

    evaluateMock.mockResolvedValueOnce(shadowResult());
    await runShadowDecision(baseInput());

    expect(prisma.shadowDecision.create).toHaveBeenCalledTimes(2);
  });

  it("evaluate() throwing still releases its concurrency slot", async () => {
    env.SHADOW_MODE_ENABLED = true;
    resolveShadowSampling.mockResolvedValue(true);
    env.SHADOW_MAX_CONCURRENT = 1;
    evaluateMock.mockRejectedValueOnce(new Error("boom"));
    await runShadowDecision(baseInput());

    evaluateMock.mockResolvedValueOnce(shadowResult());
    await runShadowDecision(baseInput());

    expect(prisma.shadowDecision.create).toHaveBeenCalledTimes(1); // the second call succeeded
    expect(increment).toHaveBeenCalledWith("shadow.decision.error", { reason: "evaluate_threw" });
  });
});

describe("independent timeout (Gate 3 Increment 1.5)", () => {
  it("evaluate() slower than SHADOW_TIMEOUT_MS -- times out, records shadow.decision.error/timeout, never persists", async () => {
    env.SHADOW_MODE_ENABLED = true;
    resolveShadowSampling.mockResolvedValue(true);
    env.SHADOW_TIMEOUT_MS = 20;
    evaluateMock.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve(shadowResult()), 300)),
    );

    await runShadowDecision(baseInput());

    expect(increment).toHaveBeenCalledWith("shadow.decision.error", { reason: "timeout" });
    expect(recordShadowError).toHaveBeenCalledWith("timeout");
    expect(prisma.shadowDecision.create).not.toHaveBeenCalled();
  });

  it("evaluate() faster than SHADOW_TIMEOUT_MS -- succeeds normally, timeout reason never recorded", async () => {
    env.SHADOW_MODE_ENABLED = true;
    resolveShadowSampling.mockResolvedValue(true);
    env.SHADOW_TIMEOUT_MS = 5000;
    evaluateMock.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve(shadowResult()), 10)),
    );

    await runShadowDecision(baseInput());

    expect(prisma.shadowDecision.create).toHaveBeenCalledTimes(1);
    expect(increment).not.toHaveBeenCalledWith("shadow.decision.error", { reason: "timeout" });
  });

  it("a released slot after a timeout admits the next call (finally releases at the timeout boundary, not when the orphaned call eventually settles)", async () => {
    env.SHADOW_MODE_ENABLED = true;
    resolveShadowSampling.mockResolvedValue(true);
    env.SHADOW_MAX_CONCURRENT = 1;
    env.SHADOW_TIMEOUT_MS = 20;
    evaluateMock.mockImplementationOnce(
      () => new Promise((resolve) => setTimeout(() => resolve(shadowResult()), 5000)), // abandoned, left pending
    );
    await runShadowDecision(baseInput()); // times out

    evaluateMock.mockResolvedValueOnce(shadowResult());
    await runShadowDecision(baseInput()); // must not be dropped -- the slot from the timed-out call is already free

    expect(prisma.shadowDecision.create).toHaveBeenCalledTimes(1);
    expect(increment).not.toHaveBeenCalledWith("shadow.decision.dropped", expect.anything());
  });
});

describe("independent circuit breaker wiring (Gate 3 Increment 1.5)", () => {
  it("evaluate() is called with shadow-specific synthesizer/stageExecutor, not left undefined", async () => {
    env.SHADOW_MODE_ENABLED = true;
    resolveShadowSampling.mockResolvedValue(true);
    evaluateMock.mockResolvedValue(shadowResult());

    await runShadowDecision(baseInput());

    const [, , , , options] = evaluateMock.mock.calls[0]!;
    expect(options).toBeDefined();
    expect(options.synthesizer).toBeDefined();
    expect(typeof options.synthesizer.synthesize).toBe("function");
    expect(options.stageExecutor).toBeDefined();
    expect(typeof options.stageExecutor.execute).toBe("function");
  });

  // Gate 3 Increment 1.6 -- the actual wiring-correctness proof for
  // shadow.circuit_breaker.state_change. The rest of this file mocks
  // evaluate() entirely, so it can never exercise shadowLlmProvider
  // through the real call chain; this test builds a fresh provider via
  // the exported factory and drives a real transition through the real
  // (unmocked) CircuitBreakerProvider, with ClaudeProvider mocked at the
  // top of this file so no real Anthropic network call is possible.
  it("createShadowLlmProvider wires onStateChange to shadow.circuit_breaker.state_change with the right {state} tag", async () => {
    claudeProviderCall.mockRejectedValue(new Error("network error"));
    const provider = createShadowLlmProvider();
    const sampleParams = {
      model: "claude-sonnet-4-6",
      maxTokens: 100,
      system: "s",
      userPrompt: "u",
      tool: { name: "submit_research", description: "d", input_schema: { type: "object" as const, properties: {}, required: [] } },
    };

    // Default failureThreshold (circuit-breaker-provider.ts's
    // DEFAULT_FAILURE_THRESHOLD) is 3 -- createShadowLlmProvider exposes
    // no override, so 3 real failures are needed to trip it.
    await expect(provider.call(sampleParams)).rejects.toThrow();
    await expect(provider.call(sampleParams)).rejects.toThrow();
    expect(increment).not.toHaveBeenCalledWith("shadow.circuit_breaker.state_change", expect.anything());
    await expect(provider.call(sampleParams)).rejects.toThrow();

    expect(increment).toHaveBeenCalledWith("shadow.circuit_breaker.state_change", { state: "open" });
  });

  // Gate 3 Increment 1.7 -- getShadowCircuitBreakerState() is the Shadow
  // Health card's data source for "Circuit breaker: Healthy/Open/...".
  it("getShadowCircuitBreakerState reflects the real, shared module-level singleton's state", () => {
    // Every other test in this file exercises evaluate() via evaluateMock,
    // never the real shadowLlmProvider singleton's own .call() -- it has
    // never been tripped, so this is a real "closed" read from the live
    // object, not a hardcoded stub.
    expect(getShadowCircuitBreakerState()).toBe("closed");
  });
});
