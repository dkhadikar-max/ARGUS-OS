import { describe, expect, it, vi, beforeEach } from "vitest";
import type { AuthContext } from "../../middleware/auth.js";
import type { UpdateIcpRequest } from "@argus/shared";

const repo = { getIcp: vi.fn(), upsertIcp: vi.fn() };
vi.mock("./icp.repository.js", () => repo);

const recordAudit = vi.fn();
vi.mock("../../lib/audit.js", () => ({ recordAudit }));

const { getIcpForTeam, updateIcpForTeam } = await import("./icp.service.js");

const adminAuth: AuthContext = { type: "user", userId: "user_1", role: "ADMIN", teamId: "team_1", planTier: "PRO" };
const sdrAuth: AuthContext = { type: "user", userId: "user_2", role: "SDR", teamId: "team_1", planTier: "PRO" };

beforeEach(() => {
  vi.clearAllMocks();
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
});
