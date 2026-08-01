import { describe, expect, it, vi, beforeEach } from "vitest";

const getRolloutConfig = vi.fn();
const getTeamOverride = vi.fn();
const upsertRolloutConfig = vi.fn();
const upsertTeamOverrideRepo = vi.fn();
vi.mock("./shadow-rollout.repository.js", () => ({
  getRolloutConfig,
  getTeamOverride,
  upsertRolloutConfig,
  upsertTeamOverride: upsertTeamOverrideRepo,
}));

const { previewShadowSampling, resolveShadowSampling, updateRolloutConfig, upsertTeamOverride } = await import(
  "./shadow-rollout.service.js"
);

function config(overrides: { enabled?: boolean; globalPercent?: number } = {}) {
  return { id: "cfg_1", key: "SHADOW_ROLLOUT", enabled: true, globalPercent: 50, version: 1, updatedBy: "user_1", updatedAt: new Date(), createdAt: new Date(), ...overrides };
}

function override(overrides: Partial<{ percent: number; reason: string | null; expiresAt: Date | null }> = {}) {
  return {
    id: "ov_1",
    teamId: "team_1",
    percent: 100,
    version: 1,
    reason: null,
    expiresAt: null,
    updatedBy: "user_1",
    updatedAt: new Date(),
    createdAt: new Date(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getRolloutConfig.mockResolvedValue(null);
  getTeamOverride.mockResolvedValue(null);
});

describe("previewShadowSampling / resolveShadowSampling", () => {
  it("fail-closed: sampled is false when no config row exists yet", async () => {
    const preview = await previewShadowSampling("prospect_1", "team_1");
    expect(preview.enabled).toBe(false);
    expect(preview.sampled).toBe(false);
  });

  it("resolveShadowSampling mirrors previewShadowSampling.sampled", async () => {
    getRolloutConfig.mockResolvedValue(config({ enabled: true, globalPercent: 100 }));
    const resolved = await resolveShadowSampling("prospect_1", "team_1");
    expect(resolved).toBe(true);
  });

  it("false when enabled is false, regardless of a 100% global percent", async () => {
    getRolloutConfig.mockResolvedValue(config({ enabled: false, globalPercent: 100 }));
    const preview = await previewShadowSampling("prospect_1", "team_1");
    expect(preview.sampled).toBe(false);
  });

  it("a team override wins over the global percent when present and unexpired", async () => {
    getRolloutConfig.mockResolvedValue(config({ enabled: true, globalPercent: 0 }));
    getTeamOverride.mockResolvedValue(override({ percent: 100, expiresAt: null }));

    const preview = await previewShadowSampling("prospect_1", "team_1");

    expect(preview.effectivePercent).toBe(100);
    expect(preview.sampled).toBe(true);
    expect(preview.override).toEqual({ teamId: "team_1", percent: 100, reason: null, expiresAt: null });
  });

  it("falls back to the global percent when no override exists", async () => {
    getRolloutConfig.mockResolvedValue(config({ enabled: true, globalPercent: 100 }));
    getTeamOverride.mockResolvedValue(null);

    const preview = await previewShadowSampling("prospect_1", "team_1");

    expect(preview.effectivePercent).toBe(100);
    expect(preview.override).toBeNull();
  });

  it("an expired override is ignored, falling back to the global percent", async () => {
    getRolloutConfig.mockResolvedValue(config({ enabled: true, globalPercent: 0 }));
    getTeamOverride.mockResolvedValue(override({ percent: 100, expiresAt: new Date("2020-01-01T00:00:00Z") }));

    const preview = await previewShadowSampling("prospect_1", "team_1");

    expect(preview.override).toBeNull();
    expect(preview.effectivePercent).toBe(0);
    expect(preview.sampled).toBe(false);
  });

  it("an unexpired override (expiresAt in the future) is honored", async () => {
    getRolloutConfig.mockResolvedValue(config({ enabled: true, globalPercent: 0 }));
    const future = new Date(Date.now() + 60_000);
    getTeamOverride.mockResolvedValue(override({ percent: 100, expiresAt: future }));

    const preview = await previewShadowSampling("prospect_1", "team_1");

    expect(preview.override?.percent).toBe(100);
    expect(preview.sampled).toBe(true);
  });

  it("passes reason and expiresAt through to the preview response", async () => {
    getRolloutConfig.mockResolvedValue(config());
    const future = new Date("2026-12-31T00:00:00Z");
    getTeamOverride.mockResolvedValue(override({ percent: 25, reason: "Customer validation", expiresAt: future }));

    const preview = await previewShadowSampling("prospect_1", "team_1");

    expect(preview.override).toEqual({
      teamId: "team_1",
      percent: 25,
      reason: "Customer validation",
      expiresAt: future.toISOString(),
    });
  });

  it("bucket is the real, deterministic shadowBucket value (0/100 boundary, not mocked)", async () => {
    getRolloutConfig.mockResolvedValue(config({ enabled: true, globalPercent: 100 }));
    const preview = await previewShadowSampling("prospect_1", "team_1");
    expect(preview.bucket).toBeGreaterThanOrEqual(0);
    expect(preview.bucket).toBeLessThan(100);
  });
});

describe("updateRolloutConfig", () => {
  beforeEach(() => {
    upsertRolloutConfig.mockResolvedValue(config());
  });

  it("returns real {before, after} pairs", async () => {
    getRolloutConfig.mockResolvedValue(config({ globalPercent: 10 }));
    upsertRolloutConfig.mockResolvedValue(config({ globalPercent: 20 }));

    const result = await updateRolloutConfig({ enabled: true, globalPercent: 20 }, "user_1");

    expect(result.before?.globalPercent).toBe(10);
    expect(result.after.globalPercent).toBe(20);
  });

  it.each([-1, 101, 1.5, NaN, Infinity])("rejects an invalid globalPercent (%s) with VALIDATION_ERROR", async (bad) => {
    await expect(updateRolloutConfig({ enabled: true, globalPercent: bad }, "user_1")).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(upsertRolloutConfig).not.toHaveBeenCalled();
  });
});

describe("upsertTeamOverride", () => {
  beforeEach(() => {
    upsertTeamOverrideRepo.mockResolvedValue(override());
  });

  it("returns real {before, after} pairs", async () => {
    getTeamOverride.mockResolvedValue(null);
    upsertTeamOverrideRepo.mockResolvedValue(override({ percent: 50 }));

    const result = await upsertTeamOverride("team_1", { percent: 50 }, "user_1");

    expect(result.before).toBeNull();
    expect(result.after.percent).toBe(50);
  });

  it("normalizes an omitted reason/expiresAt to null before calling the repository", async () => {
    await upsertTeamOverride("team_1", { percent: 50 }, "user_1");

    expect(upsertTeamOverrideRepo).toHaveBeenCalledWith("team_1", { percent: 50, reason: null, expiresAt: null }, "user_1");
  });

  it.each([-1, 101, 1.5, NaN, Infinity])("rejects an invalid percent (%s) with VALIDATION_ERROR", async (bad) => {
    await expect(upsertTeamOverride("team_1", { percent: bad }, "user_1")).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(upsertTeamOverrideRepo).not.toHaveBeenCalled();
  });
});
