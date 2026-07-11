import { describe, expect, it, vi, beforeEach } from "vitest";
import type { CreateOutcomeRequest } from "@argus/shared";
import type { AuthContext } from "../../middleware/auth.js";

const repo = {
  findDecisionForOutcome: vi.fn(),
  createOutcomeRecord: vi.fn(),
  getTeamOutcomesForVerdict: vi.fn(),
  upsertCompanyMemoryPatternForVerdict: vi.fn(),
  listOutcomes: vi.fn(),
  getVerdictAggregations: vi.fn(),
  countDecisionsForTeam: vi.fn(),
};

vi.mock("./outcome.repository.js", () => repo);

const publishTeamEvent = vi.fn();
vi.mock("../../lib/pubsub.js", () => ({ publishTeamEvent }));

const invalidateDecisionCache = vi.fn();
vi.mock("../../lib/decision-cache.js", () => ({ invalidateDecisionCache }));

const track = vi.fn();
vi.mock("../../lib/analytics.js", () => ({ track }));

const recordAudit = vi.fn();
vi.mock("../../lib/audit.js", () => ({ recordAudit }));

const { createOutcome, listOutcomesForTeam } = await import("./outcome.service.js");

const auth: AuthContext = { type: "user", userId: "user_1", teamId: "team_1", planTier: "FREE" };

const request: CreateOutcomeRequest = {
  decisionId: "dec_1",
  type: "MEETING_BOOKED",
  timeToOutcomeDays: 1,
  feedback: "Sarah was engaged.",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createOutcome", () => {
  it("throws FORBIDDEN for API-key auth with no userId", async () => {
    const apiKeyAuth: AuthContext = { type: "api_key", teamId: "team_1", planTier: "FREE", apiKeyId: "key_1" };
    await expect(createOutcome(request, apiKeyAuth)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("throws NOT_FOUND when the decision doesn't exist", async () => {
    repo.findDecisionForOutcome.mockResolvedValue(null);
    await expect(createOutcome(request, auth)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("throws DECISION_STALE when an outcome is already logged", async () => {
    repo.findDecisionForOutcome.mockResolvedValue({ id: "dec_1", verdict: "YES", outcome: { id: "out_1" } });
    await expect(createOutcome(request, auth)).rejects.toMatchObject({ code: "DECISION_STALE" });
  });

  it("logs the outcome and recomputes the Company Memory pattern (Bible §10.3)", async () => {
    repo.findDecisionForOutcome.mockResolvedValue({
      id: "dec_1",
      verdict: "STRONG_YES",
      outcome: null,
      prospectId: "prospect_1",
    });
    repo.createOutcomeRecord.mockResolvedValue({
      id: "out_1",
      decisionId: "dec_1",
      type: "MEETING_BOOKED",
      value: null,
      timeToOutcomeDays: 1,
      feedback: "Sarah was engaged.",
      loggedAt: new Date("2026-07-11T09:15:00Z"),
    });
    repo.getTeamOutcomesForVerdict.mockResolvedValue([
      { type: "MEETING_BOOKED" },
      { type: "NO_RESPONSE" },
    ]);
    repo.upsertCompanyMemoryPatternForVerdict.mockResolvedValue(undefined);

    const result = await createOutcome(request, auth);

    expect(result.learningApplied).toBe(true);
    expect(result.patternUpdated).toContain("STRONG_YES");
    expect(result.patternUpdated).toContain("50%"); // 1 of 2 outcomes is a meeting
    expect(repo.upsertCompanyMemoryPatternForVerdict).toHaveBeenCalledWith(
      "team_1",
      "STRONG_YES",
      expect.objectContaining({ verdict: "STRONG_YES" }),
    );
    expect(publishTeamEvent).toHaveBeenCalledWith(
      "team_1",
      expect.objectContaining({ type: "outcome.logged" }),
    );
    expect(invalidateDecisionCache).toHaveBeenCalledWith("prospect_1", "team_1");
    expect(track).toHaveBeenCalledWith(
      "user_1",
      expect.objectContaining({
        name: "outcome_logged",
        properties: expect.objectContaining({ decision_id: "dec_1", outcome_type: "MEETING_BOOKED", feedback_provided: true }),
      }),
    );
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: "outcome",
        entityId: "out_1",
        action: "created",
        actorId: "user_1",
      }),
    );
  });
});

describe("listOutcomesForTeam", () => {
  it("computes per-verdict meeting rate and average time-to-meeting", async () => {
    repo.listOutcomes.mockResolvedValue({
      rows: [
        {
          id: "out_1",
          decisionId: "dec_1",
          type: "MEETING_BOOKED",
          timeToOutcomeDays: 2,
          loggedAt: new Date("2026-07-11T09:15:00Z"),
          decision: { verdict: "STRONG_YES", confidence: 94, prospect: { name: "Sarah Chen", title: "VP Eng", companyName: "DataFlow" } },
        },
      ],
      total: 1,
    });
    repo.getVerdictAggregations.mockResolvedValue([
      { type: "MEETING_BOOKED", timeToOutcomeDays: 2, decision: { verdict: "STRONG_YES" } },
      { type: "NO_RESPONSE", timeToOutcomeDays: null, decision: { verdict: "STRONG_YES" } },
    ]);
    repo.countDecisionsForTeam.mockResolvedValue(75);

    const result = await listOutcomesForTeam({ teamId: "team_1", limit: 20, offset: 0 });

    expect(result.aggregations.byVerdict.STRONG_YES).toEqual({
      count: 2,
      meetingRate: 0.5,
      avgTimeToMeeting: 2,
    });
    expect(result.pagination).toEqual({ total: 1, limit: 20, offset: 0, hasMore: false });
    expect(result.accuracy).toEqual({ totalDecisions: 75, mode: "calibrating", score: 0.5 });
  });

  it("returns a null accuracy score when there's no STRONG_YES/YES outcome yet, without fabricating a number", async () => {
    repo.listOutcomes.mockResolvedValue({ rows: [], total: 0 });
    repo.getVerdictAggregations.mockResolvedValue([
      { type: "NO_RESPONSE", timeToOutcomeDays: null, decision: { verdict: "PASS" } },
    ]);
    repo.countDecisionsForTeam.mockResolvedValue(10);

    const result = await listOutcomesForTeam({ teamId: "team_1", limit: 20, offset: 0 });

    expect(result.accuracy).toEqual({ totalDecisions: 10, mode: "learning", score: null });
  });

  it("weights STRONG_YES/YES accuracy by each bucket's own sample size", async () => {
    repo.listOutcomes.mockResolvedValue({ rows: [], total: 0 });
    repo.getVerdictAggregations.mockResolvedValue([
      // STRONG_YES: 1/1 meeting (100%); YES: 1/9 meetings (~11%) -- a naive
      // unweighted average of the two rates would be ~56%, not correct here.
      { type: "MEETING_BOOKED", timeToOutcomeDays: 1, decision: { verdict: "STRONG_YES" } },
      { type: "MEETING_BOOKED", timeToOutcomeDays: 1, decision: { verdict: "YES" } },
      ...Array.from({ length: 8 }, () => ({ type: "NO_RESPONSE" as const, timeToOutcomeDays: null, decision: { verdict: "YES" as const } })),
    ]);
    repo.countDecisionsForTeam.mockResolvedValue(200);

    const result = await listOutcomesForTeam({ teamId: "team_1", limit: 20, offset: 0 });

    expect(result.accuracy.score).toBeCloseTo(0.2); // (1 + 1) meetings / (1 + 9) total
    expect(result.accuracy.mode).toBe("calibrating"); // Bible's own "50-200" is inclusive of 200
  });
});
