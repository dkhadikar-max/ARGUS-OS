import { describe, expect, it, vi, beforeEach } from "vitest";

const getShadowMetricsSummary = vi.fn();
vi.mock("../../agents/shadow-metrics.service.js", () => ({ getShadowMetricsSummary }));

const getShadowCircuitBreakerState = vi.fn();
vi.mock("../../agents/shadow-runner.service.js", () => ({ getShadowCircuitBreakerState }));

const countShadowErrorsSince = vi.fn();
vi.mock("../../agents/shadow-error-log.js", () => ({ countShadowErrorsSince }));

const getRolloutConfig = vi.fn();
const listTeamOverrides = vi.fn();
const deleteTeamOverride = vi.fn();
const listRolloutAuditEntries = vi.fn();
vi.mock("../../agents/shadow-rollout.repository.js", () => ({
  getRolloutConfig,
  listTeamOverrides,
  deleteTeamOverride,
  listRolloutAuditEntries,
}));

const updateRolloutConfig = vi.fn();
const upsertTeamOverride = vi.fn();
const previewShadowSampling = vi.fn();
vi.mock("../../agents/shadow-rollout.service.js", () => ({ updateRolloutConfig, upsertTeamOverride, previewShadowSampling }));

vi.mock("../../config/env.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../config/env.js")>();
  return { env: { ...actual.env } };
});

const listShadowDecisionsRepo = vi.fn();
const getShadowDecisionByIdRepo = vi.fn();
const getLastShadowDecisionAtRepo = vi.fn();
vi.mock("./admin.repository.js", () => ({
  listShadowDecisions: listShadowDecisionsRepo,
  getShadowDecisionById: getShadowDecisionByIdRepo,
  getLastShadowDecisionAt: getLastShadowDecisionAtRepo,
}));

const {
  getShadowMetrics,
  listShadowDecisions,
  getShadowDecisionDetail,
  getShadowHealth,
  getShadowRollout,
  updateShadowRolloutConfig,
  upsertShadowRolloutTeamOverride,
  deleteShadowRolloutTeamOverride,
  getShadowRolloutAudit,
  previewShadowRollout,
} = await import("./admin.service.js");
const { env } = await import("../../config/env.js");

beforeEach(() => {
  vi.clearAllMocks();
  env.SHADOW_MODE_ENABLED = true;
});

describe("getShadowMetrics", () => {
  it("passes teamId/sinceDays straight through to getShadowMetricsSummary", async () => {
    getShadowMetricsSummary.mockResolvedValue({
      totalShadowDecisions: 0,
      verdictAgreementRate: 0,
      avgConfidenceDelta: 0,
      p50ConfidenceDelta: 0,
      avgCostUsd: 0,
      totalCostUsd: 0,
      disagreementBreakdown: [],
      volumeByDay: [],
    });

    await getShadowMetrics({ teamId: "team_1", sinceDays: 14 });

    expect(getShadowMetricsSummary).toHaveBeenCalledWith("team_1", 14);
  });

  it("sets scope.teamId to null when query omits teamId", async () => {
    getShadowMetricsSummary.mockResolvedValue({
      totalShadowDecisions: 0,
      verdictAgreementRate: 0,
      avgConfidenceDelta: 0,
      p50ConfidenceDelta: 0,
      avgCostUsd: 0,
      totalCostUsd: 0,
      disagreementBreakdown: [],
      volumeByDay: [],
    });

    const result = await getShadowMetrics({ sinceDays: 7 } as never);

    expect(getShadowMetricsSummary).toHaveBeenCalledWith(undefined, 7);
    expect(result.scope).toEqual({ teamId: null, sinceDays: 7 });
  });
});

describe("listShadowDecisions", () => {
  function repoRow(overrides: Record<string, unknown> = {}) {
    return {
      id: "sd_1",
      teamId: "team_1",
      team: { name: "DataFlow Inc." },
      decisionId: "dec_1",
      prospectId: "prospect_1",
      verdict: "WAIT",
      confidence: 52,
      reasoning: "shadow reasoning",
      verdictAgreement: false,
      confidenceDelta: 3,
      disagreementCategories: ["verdict_mismatch"],
      inferenceCostUsd: 0.1,
      processingTimeMs: 90000,
      createdAt: new Date("2026-07-30T12:00:00Z"),
      decision: {
        verdict: "PASS",
        confidence: 54,
        reasoning: "live reasoning",
        recommendedAction: "wait_for_signal",
        createdAt: new Date("2026-07-30T11:58:00Z"),
      },
      ...overrides,
    };
  }

  it("flattens a repository row into the response shape, including teamName and liveDecision", async () => {
    listShadowDecisionsRepo.mockResolvedValue({ rows: [repoRow()], total: 1 });

    const result = await listShadowDecisions({ limit: 20, offset: 0 } as never);

    expect(result.data[0]).toEqual({
      id: "sd_1",
      teamId: "team_1",
      teamName: "DataFlow Inc.",
      decisionId: "dec_1",
      prospectId: "prospect_1",
      shadowVerdict: "WAIT",
      shadowConfidence: 52,
      shadowReasoning: "shadow reasoning",
      liveDecision: {
        verdict: "PASS",
        confidence: 54,
        reasoning: "live reasoning",
        recommendedAction: "wait_for_signal",
        createdAt: "2026-07-30T11:58:00.000Z",
      },
      verdictAgreement: false,
      confidenceDelta: 3,
      disagreementCategories: ["verdict_mismatch"],
      inferenceCostUsd: 0.1,
      processingTimeMs: 90000,
      createdAt: "2026-07-30T12:00:00.000Z",
    });
  });

  it("computes pagination.hasMore correctly at the boundary", async () => {
    listShadowDecisionsRepo.mockResolvedValue({ rows: [repoRow()], total: 1 });
    const exact = await listShadowDecisions({ limit: 20, offset: 0 } as never);
    expect(exact.pagination.hasMore).toBe(false); // offset(0) + rows(1) === total(1)

    listShadowDecisionsRepo.mockResolvedValue({ rows: [repoRow()], total: 5 });
    const more = await listShadowDecisions({ limit: 1, offset: 0 } as never);
    expect(more.pagination.hasMore).toBe(true); // 0 + 1 < 5
  });
});

describe("getShadowDecisionDetail", () => {
  function repoDetail(overrides: Record<string, unknown> = {}) {
    return {
      id: "sd_1",
      teamId: "team_1",
      team: { name: "DataFlow Inc." },
      prospectId: "prospect_1",
      decisionId: "dec_1",
      executionId: "exec_1",
      packId: "sales-lead-qualification-v1",
      model: "claude-sonnet-4-6",
      verdict: "WAIT",
      confidence: 52,
      weightedScore: 48.5,
      reasoning: "shadow reasoning",
      recommendedAction: "wait_for_signal",
      agentConsensus: "high",
      agentOutputs: { judge: { verdict: "WAIT" } },
      executionTrace: { requestId: "exec_1" },
      controllerAction: "stop",
      controllerTargetCapability: null,
      controllerReasons: ["real reason"],
      processingTimeMs: 93000,
      inputTokens: 5000,
      outputTokens: 900,
      inferenceCostUsd: 0.08,
      verdictAgreement: false,
      confidenceDelta: 2,
      controllerComparisonApplicable: true,
      disagreementCategories: ["verdict_mismatch"],
      createdAt: new Date("2026-07-30T12:00:00Z"),
      decision: {
        verdict: "PASS",
        confidence: 54,
        weightedScore: 38,
        reasoning: "live reasoning",
        recommendedAction: "pass_and_move_on",
        agentConsensus: "high",
        agentOutputs: { judge: { verdict: "PASS" } },
        processingTimeMs: 91000,
        inputTokens: 4900,
        outputTokens: 870,
        inferenceCostUsd: 0.09,
        evidence: [{ id: "ev_1", type: "FIRMOGRAPHIC", data: { signal: "Series B", relevance: "funding stage" }, confidence: 90 }],
        createdAt: new Date("2026-07-30T11:58:00Z"),
      },
      ...overrides,
    };
  }

  it("returns null when the repository finds no row", async () => {
    getShadowDecisionByIdRepo.mockResolvedValue(null);

    const result = await getShadowDecisionDetail("nonexistent");

    expect(result).toBeNull();
  });

  it("maps a full repository row into the detail response shape, including both sides' full agentOutputs/executionTrace", async () => {
    getShadowDecisionByIdRepo.mockResolvedValue(repoDetail());

    const result = await getShadowDecisionDetail("sd_1");

    expect(result).toEqual({
      id: "sd_1",
      teamId: "team_1",
      teamName: "DataFlow Inc.",
      prospectId: "prospect_1",
      decisionId: "dec_1",
      executionId: "exec_1",
      packId: "sales-lead-qualification-v1",
      model: "claude-sonnet-4-6",
      liveDecision: {
        verdict: "PASS",
        confidence: 54,
        weightedScore: 38,
        reasoning: "live reasoning",
        recommendedAction: "pass_and_move_on",
        agentConsensus: "high",
        agentOutputs: { judge: { verdict: "PASS" } },
        processingTimeMs: 91000,
        inputTokens: 4900,
        outputTokens: 870,
        inferenceCostUsd: 0.09,
        evidence: [{ id: "ev_1", type: "FIRMOGRAPHIC", signal: "Series B", relevance: "funding stage", confidence: 90 }],
        createdAt: "2026-07-30T11:58:00.000Z",
      },
      shadowDecision: {
        verdict: "WAIT",
        confidence: 52,
        weightedScore: 48.5,
        reasoning: "shadow reasoning",
        recommendedAction: "wait_for_signal",
        agentConsensus: "high",
        agentOutputs: { judge: { verdict: "WAIT" } },
        executionTrace: { requestId: "exec_1" },
        controllerAction: "stop",
        controllerTargetCapability: null,
        controllerReasons: ["real reason"],
        processingTimeMs: 93000,
        inputTokens: 5000,
        outputTokens: 900,
        inferenceCostUsd: 0.08,
        createdAt: "2026-07-30T12:00:00.000Z",
      },
      comparison: {
        verdictAgreement: false,
        confidenceDelta: 2,
        controllerComparisonApplicable: true,
        disagreementCategories: ["verdict_mismatch"],
      },
    });
  });

  it("falls back to empty strings for evidence with malformed or missing data, without throwing", async () => {
    getShadowDecisionByIdRepo.mockResolvedValue(
      repoDetail({
        decision: {
          ...repoDetail().decision,
          evidence: [
            { id: "ev_bad", type: "FIRMOGRAPHIC", data: null, confidence: 50 },
            { id: "ev_partial", type: "FIRMOGRAPHIC", data: { signal: "only signal" }, confidence: 60 },
          ],
        },
      }),
    );

    const result = await getShadowDecisionDetail("sd_1");

    expect(result?.liveDecision.evidence).toEqual([
      { id: "ev_bad", type: "FIRMOGRAPHIC", signal: "", relevance: "", confidence: 50 },
      { id: "ev_partial", type: "FIRMOGRAPHIC", signal: "only signal", relevance: "", confidence: 60 },
    ]);
  });
});

function overrideRow(overrides: Partial<{ teamId: string; expiresAt: Date | null }> = {}) {
  return { teamId: "team_1", team: { name: "Team" }, percent: 100, version: 1, reason: null, expiresAt: null, updatedAt: new Date(), updatedBy: "user_1", ...overrides };
}

describe("getShadowHealth", () => {
  beforeEach(() => {
    getLastShadowDecisionAtRepo.mockResolvedValue(null);
    getShadowCircuitBreakerState.mockReturnValue("closed");
    countShadowErrorsSince.mockReturnValue(0);
    getRolloutConfig.mockResolvedValue({ enabled: true, globalPercent: 5, version: 1 });
    listTeamOverrides.mockResolvedValue([]);
    getShadowMetricsSummary.mockResolvedValue({
      totalShadowDecisions: 0,
      verdictAgreementRate: 0,
      avgConfidenceDelta: 0,
      p50ConfidenceDelta: 0,
      avgCostUsd: 0,
      totalCostUsd: 0,
      disagreementBreakdown: [],
      volumeByDay: [],
    });
  });

  it("combines env flags, the DB rollout config, live circuit breaker state, the error log, and the 24h metrics window into one response", async () => {
    env.SHADOW_MODE_ENABLED = true;
    getRolloutConfig.mockResolvedValue({ enabled: true, globalPercent: 5, version: 1 });
    getShadowCircuitBreakerState.mockReturnValue("open");
    countShadowErrorsSince.mockReturnValue(3);
    getLastShadowDecisionAtRepo.mockResolvedValue(new Date("2026-07-31T12:00:00Z"));
    getShadowMetricsSummary.mockResolvedValue({
      totalShadowDecisions: 42,
      verdictAgreementRate: 0.9,
      avgConfidenceDelta: -1,
      p50ConfidenceDelta: -1,
      avgCostUsd: 0.01,
      totalCostUsd: 0.42,
      disagreementBreakdown: [],
      volumeByDay: [],
    });

    const result = await getShadowHealth({});

    expect(result).toEqual({
      scope: { teamId: null },
      enabled: true,
      globalPercent: 5,
      activeOverrideCount: 0,
      circuitBreakerState: "open",
      lastDecisionAt: "2026-07-31T12:00:00.000Z",
      verdictAgreementRate24h: 0.9,
      totalShadowDecisions24h: 42,
      recentErrorCount1h: 3,
    });
    expect(getShadowMetricsSummary).toHaveBeenCalledWith(undefined, 1);
    expect(countShadowErrorsSince).toHaveBeenCalledWith(60 * 60 * 1000);
  });

  it("enabled is false when the env kill switch is on but the DB rollout config is disabled", async () => {
    env.SHADOW_MODE_ENABLED = true;
    getRolloutConfig.mockResolvedValue({ enabled: false, globalPercent: 50, version: 1 });

    const result = await getShadowHealth({});

    expect(result.enabled).toBe(false);
  });

  it("enabled is false when the DB rollout config is enabled but the env kill switch is off", async () => {
    env.SHADOW_MODE_ENABLED = false;
    getRolloutConfig.mockResolvedValue({ enabled: true, globalPercent: 50, version: 1 });

    const result = await getShadowHealth({});

    expect(result.enabled).toBe(false);
  });

  it("enabled is false and globalPercent is 0 when no rollout config row exists yet (fail-closed)", async () => {
    env.SHADOW_MODE_ENABLED = true;
    getRolloutConfig.mockResolvedValue(null);

    const result = await getShadowHealth({});

    expect(result.enabled).toBe(false);
    expect(result.globalPercent).toBe(0);
  });

  it("globalPercent is always the real global percent, never a team's resolved effective percent -- even when the query is scoped to a team with a 100% override", async () => {
    getRolloutConfig.mockResolvedValue({ enabled: true, globalPercent: 5, version: 1 });
    listTeamOverrides.mockResolvedValue([overrideRow({ teamId: "team_1", expiresAt: null })]);

    const result = await getShadowHealth({ teamId: "team_1" });

    expect(result.globalPercent).toBe(5);
  });

  it("activeOverrideCount counts unexpired overrides across ALL teams, not scoped to query.teamId", async () => {
    listTeamOverrides.mockResolvedValue([
      overrideRow({ teamId: "team_1", expiresAt: null }),
      overrideRow({ teamId: "team_2", expiresAt: null }),
    ]);

    const result = await getShadowHealth({ teamId: "team_1" });

    expect(result.activeOverrideCount).toBe(2);
  });

  it("activeOverrideCount excludes expired overrides", async () => {
    listTeamOverrides.mockResolvedValue([
      overrideRow({ teamId: "team_1", expiresAt: null }),
      overrideRow({ teamId: "team_2", expiresAt: new Date("2020-01-01T00:00:00Z") }),
    ]);

    const result = await getShadowHealth({});

    expect(result.activeOverrideCount).toBe(1);
  });

  it("lastDecisionAt is null (not a fabricated date) when no shadow decisions exist yet", async () => {
    getLastShadowDecisionAtRepo.mockResolvedValue(null);

    const result = await getShadowHealth({});

    expect(result.lastDecisionAt).toBeNull();
  });

  it("scope.teamId is null when the query omits teamId, and the real value passed through when given", async () => {
    const omitted = await getShadowHealth({});
    expect(omitted.scope.teamId).toBeNull();

    const withTeam = await getShadowHealth({ teamId: "team_1" });
    expect(withTeam.scope.teamId).toBe("team_1");
    expect(getLastShadowDecisionAtRepo).toHaveBeenCalledWith("team_1");
    expect(getShadowMetricsSummary).toHaveBeenCalledWith("team_1", 1);
  });
});

describe("getShadowRollout", () => {
  it("flattens the config and team overrides into the response shape, unpacking the team name", async () => {
    getRolloutConfig.mockResolvedValue({ enabled: true, globalPercent: 10, version: 3 });
    listTeamOverrides.mockResolvedValue([
      {
        teamId: "team_1",
        team: { name: "DataFlow Inc." },
        percent: 100,
        version: 2,
        reason: "Customer validation",
        expiresAt: null,
        updatedAt: new Date("2026-07-31T12:00:00Z"),
        updatedBy: "user_1",
      },
    ]);

    const result = await getShadowRollout();

    expect(result).toEqual({
      enabled: true,
      globalPercent: 10,
      version: 3,
      teamOverrides: [
        {
          teamId: "team_1",
          teamName: "DataFlow Inc.",
          percent: 100,
          version: 2,
          reason: "Customer validation",
          expiresAt: null,
          updatedAt: "2026-07-31T12:00:00.000Z",
          updatedBy: "user_1",
        },
      ],
    });
  });

  it("defaults to disabled/0%/version 0 when no config row exists yet", async () => {
    getRolloutConfig.mockResolvedValue(null);
    listTeamOverrides.mockResolvedValue([]);

    const result = await getShadowRollout();

    expect(result).toEqual({ enabled: false, globalPercent: 0, version: 0, teamOverrides: [] });
  });
});

describe("updateShadowRolloutConfig / upsertShadowRolloutTeamOverride / deleteShadowRolloutTeamOverride", () => {
  it("updateShadowRolloutConfig delegates straight through to the domain service", async () => {
    updateRolloutConfig.mockResolvedValue({ before: null, after: { enabled: true, globalPercent: 5 } });

    const result = await updateShadowRolloutConfig({ enabled: true, globalPercent: 5 }, "user_1");

    expect(updateRolloutConfig).toHaveBeenCalledWith({ enabled: true, globalPercent: 5 }, "user_1");
    expect(result).toEqual({ before: null, after: { enabled: true, globalPercent: 5 } });
  });

  it("upsertShadowRolloutTeamOverride delegates straight through to the domain service", async () => {
    upsertTeamOverride.mockResolvedValue({ before: null, after: { teamId: "team_1", percent: 100 } });

    const result = await upsertShadowRolloutTeamOverride("team_1", { percent: 100 }, "user_1");

    expect(upsertTeamOverride).toHaveBeenCalledWith("team_1", { percent: 100 }, "user_1");
    expect(result).toEqual({ before: null, after: { teamId: "team_1", percent: 100 } });
  });

  it("deleteShadowRolloutTeamOverride delegates straight through to the repository", async () => {
    deleteTeamOverride.mockResolvedValue({ count: 1 });

    await deleteShadowRolloutTeamOverride("team_1");

    expect(deleteTeamOverride).toHaveBeenCalledWith("team_1");
  });
});

describe("getShadowRolloutAudit", () => {
  function auditRow(overrides: Record<string, unknown> = {}) {
    return {
      id: "audit_1",
      entityType: "shadow_rollout_config",
      entityId: "global",
      action: "updated",
      actorId: "user_1",
      beforeState: { globalPercent: 5 },
      afterState: { globalPercent: 10 },
      createdAt: new Date("2026-07-31T12:00:00Z"),
      ...overrides,
    };
  }

  it("maps rows and computes nextBefore from the oldest row when a full page is returned", async () => {
    listRolloutAuditEntries.mockResolvedValue([
      auditRow({ id: "audit_1", createdAt: new Date("2026-07-31T12:00:00Z") }),
      auditRow({ id: "audit_2", createdAt: new Date("2026-07-31T11:00:00Z") }),
    ]);

    const result = await getShadowRolloutAudit({ limit: 2 });

    expect(result.entries).toHaveLength(2);
    expect(result.entries[0]).toEqual({
      id: "audit_1",
      entityType: "shadow_rollout_config",
      entityId: "global",
      action: "updated",
      actorId: "user_1",
      beforeState: { globalPercent: 5 },
      afterState: { globalPercent: 10 },
      createdAt: "2026-07-31T12:00:00.000Z",
    });
    expect(result.nextBefore).toBe("2026-07-31T11:00:00.000Z");
  });

  it("nextBefore is null when fewer rows than the limit are returned (last page)", async () => {
    listRolloutAuditEntries.mockResolvedValue([auditRow()]);

    const result = await getShadowRolloutAudit({ limit: 50 });

    expect(result.nextBefore).toBeNull();
  });

  it("passes the before cursor through to the repository as a real Date, only when given", async () => {
    listRolloutAuditEntries.mockResolvedValue([]);

    await getShadowRolloutAudit({ limit: 50 });
    expect(listRolloutAuditEntries).toHaveBeenCalledWith(50, undefined);

    await getShadowRolloutAudit({ limit: 50, before: "2026-07-31T12:00:00.000Z" });
    expect(listRolloutAuditEntries).toHaveBeenCalledWith(50, new Date("2026-07-31T12:00:00.000Z"));
  });
});

describe("previewShadowRollout", () => {
  it("delegates straight through to the domain service's previewShadowSampling", async () => {
    const preview = { enabled: true, globalPercent: 5, override: null, effectivePercent: 5, bucket: 42, sampled: false };
    previewShadowSampling.mockResolvedValue(preview);

    const result = await previewShadowRollout("prospect_1", "team_1");

    expect(previewShadowSampling).toHaveBeenCalledWith("prospect_1", "team_1");
    expect(result).toEqual(preview);
  });
});
