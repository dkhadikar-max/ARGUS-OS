import { describe, expect, it, vi, beforeEach } from "vitest";
import type { AuthContext } from "../../middleware/auth.js";
import type { PolicyRule, UpdatePolicyRequest } from "@argus/shared";

const repo = {
  getPolicy: vi.fn(),
  upsertPolicy: vi.fn(),
  recordPolicyVersion: vi.fn(),
  getPolicyVersionHistory: vi.fn(),
  getPolicyVersion: vi.fn(),
};
vi.mock("./policy.repository.js", () => repo);

const recordAudit = vi.fn();
vi.mock("../../lib/audit.js", () => ({ recordAudit }));

const {
  getPolicyForTeam,
  updatePolicyForTeam,
  evaluatePolicyRules,
  getPolicyVersionHistoryForTeam,
  rollbackPolicyForTeam,
} = await import("./policy.service.js");

const adminAuth: AuthContext = { type: "user", userId: "user_1", role: "ADMIN", teamId: "team_1", planTier: "PRO" };
const sdrAuth: AuthContext = { type: "user", userId: "user_2", role: "SDR", teamId: "team_1", planTier: "PRO" };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getPolicyForTeam", () => {
  it("returns an empty-but-valid shape when the team has no policy yet", async () => {
    repo.getPolicy.mockResolvedValue(null);
    const result = await getPolicyForTeam(adminAuth);
    expect(result).toEqual({ teamId: "team_1", rules: [], version: 0, updatedAt: null });
  });

  it("returns the saved policy", async () => {
    repo.getPolicy.mockResolvedValue({
      rules: [{ field: "confidence", operator: "lte", value: 40, action: "FLAG", message: "Low confidence" }],
      version: 2,
      updatedAt: new Date("2026-07-12T09:00:00Z"),
    });

    const result = await getPolicyForTeam(adminAuth);

    expect(result.version).toBe(2);
    expect(result.updatedAt).toBe("2026-07-12T09:00:00.000Z");
  });
});

describe("updatePolicyForTeam", () => {
  const request: UpdatePolicyRequest = {
    rules: [{ field: "verdict", operator: "equals", value: "HARD_PASS", action: "BLOCK", message: "Do not contact" }],
  };

  it("rejects non-admin roles with FORBIDDEN", async () => {
    await expect(updatePolicyForTeam(sdrAuth, request)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(repo.upsertPolicy).not.toHaveBeenCalled();
  });

  it("upserts, bumps version via the repository, and writes an audit entry", async () => {
    repo.upsertPolicy.mockResolvedValue({
      rules: request.rules,
      version: 2,
      updatedAt: new Date("2026-07-12T09:00:00Z"),
    });
    repo.recordPolicyVersion.mockResolvedValue({ id: "v1" });

    const result = await updatePolicyForTeam(adminAuth, request);

    expect(repo.upsertPolicy).toHaveBeenCalledWith("team_1", request.rules);
    expect(result).toEqual({
      teamId: "team_1",
      rules: request.rules,
      version: 2,
      updatedAt: "2026-07-12T09:00:00.000Z",
    });
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: "policy", entityId: "team_1", action: "updated", actorId: "user_1" }),
    );
  });

  it("snapshots the new version into PolicyVersion alongside the upsert", async () => {
    repo.upsertPolicy.mockResolvedValue({ rules: request.rules, version: 3, updatedAt: new Date() });
    repo.recordPolicyVersion.mockResolvedValue({ id: "v1" });

    await updatePolicyForTeam(adminAuth, request);

    expect(repo.recordPolicyVersion).toHaveBeenCalledWith("team_1", 3, request.rules, "user_1");
  });

  it("does not fail the request if the version snapshot insert fails (best-effort)", async () => {
    repo.upsertPolicy.mockResolvedValue({ rules: request.rules, version: 2, updatedAt: new Date() });
    repo.recordPolicyVersion.mockRejectedValue(new Error("db hiccup"));

    const result = await updatePolicyForTeam(adminAuth, request);

    expect(result.version).toBe(2);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "version_snapshot_failed" }),
    );
    // The real "updated" audit entry still fires too -- the failure is
    // additive information, not a replacement for the normal audit trail.
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "updated" }));
  });
});

describe("getPolicyVersionHistoryForTeam", () => {
  it("rejects non-admin roles with FORBIDDEN", async () => {
    await expect(getPolicyVersionHistoryForTeam(sdrAuth)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("maps repository rows into the response shape, newest first (as returned by the repository)", async () => {
    repo.getPolicyVersionHistory.mockResolvedValue([
      { version: 2, rules: [], createdAt: new Date("2026-07-13T00:00:00Z"), createdBy: "user_1" },
      { version: 1, rules: [], createdAt: new Date("2026-07-12T00:00:00Z"), createdBy: "user_1" },
    ]);

    const result = await getPolicyVersionHistoryForTeam(adminAuth);

    expect(result.teamId).toBe("team_1");
    expect(result.versions.map((v) => v.version)).toEqual([2, 1]);
  });
});

describe("rollbackPolicyForTeam", () => {
  it("throws NOT_FOUND when the requested version doesn't exist for this team", async () => {
    repo.getPolicyVersion.mockResolvedValue(null);

    await expect(rollbackPolicyForTeam(adminAuth, 99)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(repo.upsertPolicy).not.toHaveBeenCalled();
  });

  it("re-saves the historical version's rules through the normal update path (new version number, old rules)", async () => {
    const historicalRules = [
      { field: "verdict" as const, operator: "equals" as const, value: "PASS", action: "FLAG" as const, message: "old rule" },
    ];
    repo.getPolicyVersion.mockResolvedValue({ version: 1, rules: historicalRules, createdAt: new Date(), createdBy: "user_1" });
    repo.upsertPolicy.mockResolvedValue({ rules: historicalRules, version: 4, updatedAt: new Date() });
    repo.recordPolicyVersion.mockResolvedValue({ id: "v4" });

    const result = await rollbackPolicyForTeam(adminAuth, 1);

    expect(repo.upsertPolicy).toHaveBeenCalledWith("team_1", historicalRules);
    expect(result.version).toBe(4); // a NEW version, not literally "1"
  });
});

describe("evaluatePolicyRules", () => {
  const context = { verdict: "HARD_PASS", confidence: 25, prospectTitle: "Chief Financial Officer" };

  it("returns no flags when no rule matches", () => {
    const rules: PolicyRule[] = [
      { field: "confidence", operator: "gte", value: 90, action: "FLAG", message: "n/a" },
    ];
    expect(evaluatePolicyRules(rules, context)).toEqual([]);
  });

  it("matches 'equals' on verdict", () => {
    const rules: PolicyRule[] = [
      { field: "verdict", operator: "equals", value: "HARD_PASS", action: "BLOCK", message: "Do not contact" },
    ];
    expect(evaluatePolicyRules(rules, context)).toEqual([
      { field: "verdict", action: "BLOCK", message: "Do not contact" },
    ]);
  });

  it("matches 'lte' and 'gte' on confidence", () => {
    expect(
      evaluatePolicyRules(
        [{ field: "confidence", operator: "lte", value: 30, action: "FLAG", message: "Low confidence" }],
        context,
      ),
    ).toHaveLength(1);
    expect(
      evaluatePolicyRules(
        [{ field: "confidence", operator: "gte", value: 30, action: "FLAG", message: "n/a" }],
        context,
      ),
    ).toEqual([]);
  });

  it("matches 'contains' case-insensitively on prospect.title", () => {
    const rules: PolicyRule[] = [
      { field: "prospect.title", operator: "contains", value: "chief financial", action: "REQUIRE_APPROVAL", message: "CFO requires approval" },
    ];
    expect(evaluatePolicyRules(rules, context)).toEqual([
      { field: "prospect.title", action: "REQUIRE_APPROVAL", message: "CFO requires approval" },
    ]);
  });

  it("matches 'in' against an array of values", () => {
    const rules: PolicyRule[] = [
      { field: "verdict", operator: "in", value: ["PASS", "HARD_PASS"], action: "FLAG", message: "Low-fit verdict" },
    ];
    expect(evaluatePolicyRules(rules, context)).toEqual([
      { field: "verdict", action: "FLAG", message: "Low-fit verdict" },
    ]);
  });

  it("returns one flag per matching rule when multiple rules match", () => {
    const rules: PolicyRule[] = [
      { field: "verdict", operator: "equals", value: "HARD_PASS", action: "BLOCK", message: "Do not contact" },
      { field: "confidence", operator: "lte", value: 50, action: "FLAG", message: "Low confidence" },
    ];
    expect(evaluatePolicyRules(rules, context)).toHaveLength(2);
  });

  it("never matches a field this decision has no value for (prospectTitle: null)", () => {
    const rules: PolicyRule[] = [
      { field: "prospect.title", operator: "contains", value: "cfo", action: "FLAG", message: "n/a" },
    ];
    expect(evaluatePolicyRules(rules, { ...context, prospectTitle: null })).toEqual([]);
  });
});
