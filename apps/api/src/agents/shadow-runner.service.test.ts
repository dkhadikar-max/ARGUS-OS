import { describe, expect, it, vi, beforeEach } from "vitest";
import type { AgentDebateOutput, Verdict } from "@argus/shared";
import { logger } from "../lib/logger.js";

const evaluateMock = vi.fn();
vi.mock("./decision-engine.js", () => ({ evaluate: evaluateMock }));

const prisma = { shadowDecision: { create: vi.fn() } };
vi.mock("@argus/database", () => ({ prisma }));

const increment = vi.fn();
const timing = vi.fn();
vi.mock("../lib/datadog.js", () => ({ increment, timing }));

vi.mock("../config/env.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../config/env.js")>();
  return { env: { ...actual.env } };
});

const { runShadowDecision } = await import("./shadow-runner.service.js");
const { env } = await import("../config/env.js");

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
  env.SHADOW_SAMPLE_RATE_PERCENT = 0;
  prisma.shadowDecision.create.mockResolvedValue({ id: "shadow_1" });
});

describe("runShadowDecision", () => {
  it("SHADOW_MODE_ENABLED false -- evaluate() and persistence never called, regardless of sample rate", async () => {
    env.SHADOW_MODE_ENABLED = false;
    env.SHADOW_SAMPLE_RATE_PERCENT = 100;

    await runShadowDecision(baseInput());

    expect(evaluateMock).not.toHaveBeenCalled();
    expect(prisma.shadowDecision.create).not.toHaveBeenCalled();
  });

  it("SHADOW_MODE_ENABLED true, SHADOW_SAMPLE_RATE_PERCENT 0 -- still never called (sampling gates independently of the kill switch)", async () => {
    env.SHADOW_MODE_ENABLED = true;
    env.SHADOW_SAMPLE_RATE_PERCENT = 0;

    await runShadowDecision(baseInput());

    expect(evaluateMock).not.toHaveBeenCalled();
    expect(prisma.shadowDecision.create).not.toHaveBeenCalled();
  });

  it("both gates open -- evaluate() is called once with the real pack/input/identity", async () => {
    env.SHADOW_MODE_ENABLED = true;
    env.SHADOW_SAMPLE_RATE_PERCENT = 100;
    evaluateMock.mockResolvedValue(shadowResult());

    await runShadowDecision(baseInput());

    expect(evaluateMock).toHaveBeenCalledTimes(1);
    const [pack, input, identity] = evaluateMock.mock.calls[0]!;
    expect(pack.id).toBeDefined();
    expect(input).toBeDefined();
    expect(identity).toEqual({ teamId: "team_1", userId: "user_1", prospectId: "prospect_1", prospectName: "Sarah Chen" });
  });

  it("success path -- persists correct FKs, derived verdict (scoreToVerdict, not output.judge.verdict), and never touches result.graph", async () => {
    env.SHADOW_MODE_ENABLED = true;
    env.SHADOW_SAMPLE_RATE_PERCENT = 100;
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
    env.SHADOW_SAMPLE_RATE_PERCENT = 100;
    evaluateMock.mockRejectedValue(new Error("real provider failure"));
    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => logger);

    await expect(runShadowDecision(baseInput())).resolves.toBeUndefined();

    expect(prisma.shadowDecision.create).not.toHaveBeenCalled();
    expect(increment).toHaveBeenCalledWith("shadow.decision.error", { reason: "evaluate_threw" });
    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({ decisionId: "dec_1", teamId: "team_1", prospectId: "prospect_1" }),
      "Shadow Runner: evaluate() failed; live decision unaffected",
    );
  });

  it("persistence throws -- resolves cleanly, logs + increments persist_failed", async () => {
    env.SHADOW_MODE_ENABLED = true;
    env.SHADOW_SAMPLE_RATE_PERCENT = 100;
    evaluateMock.mockResolvedValue(shadowResult());
    prisma.shadowDecision.create.mockRejectedValue(new Error("db down"));
    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => logger);

    await expect(runShadowDecision(baseInput())).resolves.toBeUndefined();

    expect(increment).toHaveBeenCalledWith("shadow.decision.error", { reason: "persist_failed" });
    expect(warnSpy).toHaveBeenCalledWith(expect.objectContaining({ decisionId: "dec_1" }), "Shadow Runner: persistence failed; shadow result discarded");
  });

  it("metrics fire the right number of times on success -- timing once, count once, one disagreement.count per real category", async () => {
    env.SHADOW_MODE_ENABLED = true;
    env.SHADOW_SAMPLE_RATE_PERCENT = 100;
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
    env.SHADOW_SAMPLE_RATE_PERCENT = 100;
    evaluateMock.mockResolvedValue(shadowResult({ verdict: "YES", confidence: 80, weighted_score: 78, controllerAction: "stop" }));

    await runShadowDecision(baseInput({ liveControllerAction: "stop" }));

    expect(increment).not.toHaveBeenCalledWith("shadow.disagreement.count", expect.anything());
  });

  it("live side has no real controller action (cache hit / legacy pipeline) -- persisted controllerComparisonApplicable is false, no controller_action_mismatch even though actions differ", async () => {
    env.SHADOW_MODE_ENABLED = true;
    env.SHADOW_SAMPLE_RATE_PERCENT = 100;
    evaluateMock.mockResolvedValue(shadowResult({ verdict: "YES", confidence: 80, weighted_score: 78, controllerAction: "invoke_capability", controllerTargetCapability: "risk" }));

    await runShadowDecision(baseInput({ liveControllerAction: null, liveControllerTargetCapability: null }));

    const data = prisma.shadowDecision.create.mock.calls[0]![0].data;
    expect(data.controllerComparisonApplicable).toBe(false);
    expect(data.disagreementCategories).not.toContain("controller_action_mismatch");
  });
});
