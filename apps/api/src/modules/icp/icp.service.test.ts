import { describe, expect, it, vi, beforeEach } from "vitest";
import type { AuthContext } from "../../middleware/auth.js";
import type { UpdateIcpRequest } from "@argus/shared";

const repo = {
  getIcp: vi.fn(),
  upsertIcp: vi.fn(),
  getDecisionsSince: vi.fn(),
  appendIcpHistoryEntry: vi.fn(),
};
vi.mock("./icp.repository.js", () => repo);

const recordAudit = vi.fn();
vi.mock("../../lib/audit.js", () => ({ recordAudit }));

const { getIcpForTeam, updateIcpForTeam, computeVersionAccuracy } = await import("./icp.service.js");

const adminAuth: AuthContext = { type: "user", userId: "user_1", role: "ADMIN", teamId: "team_1", planTier: "PRO" };
const sdrAuth: AuthContext = { type: "user", userId: "user_2", role: "SDR", teamId: "team_1", planTier: "PRO" };

beforeEach(() => {
  vi.clearAllMocks();
  // vi.clearAllMocks() resets call history but not mockResolvedValue's own
  // configured return value, so without an explicit default here a later
  // test can silently inherit whatever repo.getIcp last resolved to in an
  // earlier test in this same file (real flakiness this file's own
  // updateIcpForTeam tests hit before this default existed). Tests that
  // care about a prior ICP version set this explicitly.
  repo.getIcp.mockResolvedValue(undefined);
});

describe("getIcpForTeam", () => {
  it("returns an empty-but-valid shape when the team has no ICP yet", async () => {
    repo.getIcp.mockResolvedValue(null);
    const result = await getIcpForTeam(adminAuth);
    expect(result).toEqual({ teamId: "team_1", criteria: [], version: 0, updatedAt: null });
  });

  it("returns the saved ICP", async () => {
    repo.getIcp.mockResolvedValue({
      criteria: [{ field: "companySize", operator: "gte", value: 50, weight: 1 }],
      version: 3,
      updatedAt: new Date("2026-07-11T09:00:00Z"),
    });

    const result = await getIcpForTeam(adminAuth);

    expect(result.version).toBe(3);
    expect(result.updatedAt).toBe("2026-07-11T09:00:00.000Z");
  });
});

describe("updateIcpForTeam", () => {
  const validRequest: UpdateIcpRequest = {
    criteria: [
      { field: "companySize", operator: "gte", value: 50, weight: 0.6 },
      { field: "industry", operator: "equals", value: "SaaS", weight: 0.4 },
    ],
  };

  it("rejects non-admin roles with FORBIDDEN", async () => {
    await expect(updateIcpForTeam(sdrAuth, validRequest)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(repo.upsertIcp).not.toHaveBeenCalled();
  });

  it("rejects criteria whose weights don't sum to ~1", async () => {
    const invalid: UpdateIcpRequest = {
      criteria: [{ field: "companySize", operator: "gte", value: 50, weight: 0.3 }],
    };
    await expect(updateIcpForTeam(adminAuth, invalid)).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(repo.upsertIcp).not.toHaveBeenCalled();
  });

  it("allows an empty criteria array (clearing the ICP) without a weight-sum check", async () => {
    repo.upsertIcp.mockResolvedValue({ criteria: [], version: 1, updatedAt: new Date("2026-07-11T09:00:00Z") });
    await expect(updateIcpForTeam(adminAuth, { criteria: [] })).resolves.toMatchObject({ version: 1 });
  });

  it("upserts, bumps version via the repository, and writes an audit entry", async () => {
    repo.upsertIcp.mockResolvedValue({
      criteria: validRequest.criteria,
      version: 2,
      updatedAt: new Date("2026-07-11T09:00:00Z"),
    });

    const result = await updateIcpForTeam(adminAuth, validRequest);

    expect(repo.upsertIcp).toHaveBeenCalledWith("team_1", validRequest.criteria);
    expect(result).toEqual({
      teamId: "team_1",
      criteria: validRequest.criteria,
      version: 2,
      updatedAt: "2026-07-11T09:00:00.000Z",
    });
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: "icp",
        entityId: "team_1",
        action: "updated",
        actorId: "user_1",
      }),
    );
  });

  it("doesn't snapshot icpHistory on a team's very first-ever ICP save (no prior version to retire)", async () => {
    repo.getIcp.mockResolvedValue(undefined); // no existing ICPDefinition row
    repo.upsertIcp.mockResolvedValue({ criteria: validRequest.criteria, version: 1, updatedAt: new Date() });

    await updateIcpForTeam(adminAuth, validRequest);

    expect(repo.getDecisionsSince).not.toHaveBeenCalled();
    expect(repo.appendIcpHistoryEntry).not.toHaveBeenCalled();
  });

  it("snapshots the outgoing version's own retrospective accuracy into icpHistory when replacing an existing ICP (Bible §10.5 icpAccuracy)", async () => {
    const outgoingCriteria = [{ field: "companySize", operator: "gte" as const, value: 50, weight: 1 }];
    const activatedAt = new Date("2026-07-01T00:00:00Z");
    repo.getIcp.mockResolvedValue({ version: 3, criteria: outgoingCriteria, updatedAt: activatedAt });
    repo.upsertIcp.mockResolvedValue({ criteria: validRequest.criteria, version: 4, updatedAt: new Date() });
    repo.getDecisionsSince.mockResolvedValue([
      { verdict: "STRONG_YES", outcome: { type: "MEETING_BOOKED" } },
      { verdict: "YES", outcome: { type: "NO_RESPONSE" } },
      { verdict: "YES", outcome: { type: "MEETING_BOOKED" } },
    ]);

    await updateIcpForTeam(adminAuth, validRequest);

    expect(repo.getDecisionsSince).toHaveBeenCalledWith("team_1", activatedAt);
    expect(repo.appendIcpHistoryEntry).toHaveBeenCalledWith(
      "team_1",
      expect.objectContaining({
        version: 3,
        criteria: outgoingCriteria,
        accuracy: 2 / 3, // 2 of 3 STRONG_YES/YES-with-outcome decisions converted to a meeting
        sampleSize: 3,
        activatedAt: activatedAt.toISOString(),
      }),
    );
  });

  // Below the minimum sample size, the retired version's accuracy is
  // recorded as null (not a misleading 100%/0%) -- same floor applied to
  // the live `current` accuracy, applied here too so a version retired
  // after only 1-2 scored decisions doesn't permanently bake a fake
  // "definitive" number into icpHistory.
  it("snapshots a null accuracy when the outgoing version never reached the minimum sample size", async () => {
    const outgoingCriteria = [{ field: "companySize", operator: "gte" as const, value: 50, weight: 1 }];
    const activatedAt = new Date("2026-07-01T00:00:00Z");
    repo.getIcp.mockResolvedValue({ version: 3, criteria: outgoingCriteria, updatedAt: activatedAt });
    repo.upsertIcp.mockResolvedValue({ criteria: validRequest.criteria, version: 4, updatedAt: new Date() });
    repo.getDecisionsSince.mockResolvedValue([{ verdict: "STRONG_YES", outcome: { type: "MEETING_BOOKED" } }]);

    await updateIcpForTeam(adminAuth, validRequest);

    expect(repo.appendIcpHistoryEntry).toHaveBeenCalledWith(
      "team_1",
      expect.objectContaining({ accuracy: null, sampleSize: 0 }),
    );
  });
});

describe("computeVersionAccuracy", () => {
  it("returns null when no STRONG_YES/YES decision has a logged outcome yet", () => {
    expect(
      computeVersionAccuracy([
        { verdict: "WAIT", outcome: { type: "MEETING_BOOKED" } },
        { verdict: "STRONG_YES", outcome: null },
      ]),
    ).toBeNull();
  });

  // A single (or double) scored decision reads as a definitive 100%/0%
  // accuracy with nothing distinguishing it from a mature, well-sampled
  // version -- withheld entirely below this floor rather than shown.
  it("returns null below the minimum sample size, even with a real scoreable decision", () => {
    expect(
      computeVersionAccuracy([
        { verdict: "STRONG_YES", outcome: { type: "MEETING_BOOKED" } },
        { verdict: "YES", outcome: { type: "OPPORTUNITY_CREATED" } },
      ]),
    ).toBeNull();
  });

  it("computes the fraction of STRONG_YES/YES-with-outcome decisions that converted to a meeting, once at the minimum sample size", () => {
    const result = computeVersionAccuracy([
      { verdict: "STRONG_YES", outcome: { type: "MEETING_BOOKED" } },
      { verdict: "YES", outcome: { type: "OPPORTUNITY_CREATED" } },
      { verdict: "YES", outcome: { type: "NO_RESPONSE" } },
      { verdict: "PASS", outcome: { type: "CLOSED_WON" } }, // not a positive prediction -- excluded
    ]);
    expect(result?.accuracy).toBeCloseTo(2 / 3);
    expect(result?.sampleSize).toBe(3);
  });
});
