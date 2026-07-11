import { describe, expect, it, vi, beforeEach } from "vitest";

const repo = {
  getActiveDecisionsForUser: vi.fn(),
  countPriorDecisionsByProspect: vi.fn(),
};

vi.mock("./queue.repository.js", () => repo);

const { getQueueForUser } = await import("./queue.service.js");

beforeEach(() => {
  vi.clearAllMocks();
  repo.countPriorDecisionsByProspect.mockResolvedValue([]);
});

function decisionFixture(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "dec_1",
    prospectId: "prospect_1",
    verdict: "STRONG_YES",
    confidence: 90,
    recommendedAction: "message_now",
    reasoning: "Great fit. Hiring engineers.",
    createdAt: new Date(),
    prospect: { name: "Sarah Chen", title: "VP Eng", companyName: "DataFlow", linkedInUrl: "https://linkedin.com/in/sarahchen" },
    messageDrafts: [{ body: "Hi Sarah — saw your recent post" }],
    evidence: [],
    ...overrides,
  };
}

describe("getQueueForUser", () => {
  it("ranks STRONG_YES above PASS regardless of insertion order (Bible §18 BCK-5)", async () => {
    repo.getActiveDecisionsForUser.mockResolvedValue([
      decisionFixture({ id: "dec_pass", verdict: "PASS", confidence: 60 }),
      decisionFixture({ id: "dec_strong", verdict: "STRONG_YES", confidence: 90 }),
    ]);

    const queue = await getQueueForUser("user_1", "team_1");

    expect(queue.items[0]?.decisionId).toBe("dec_strong");
    expect(queue.items[0]?.rank).toBe(1);
    expect(queue.items[1]?.decisionId).toBe("dec_pass");
  });

  it("labels a prospect with prior decisions as a re-engagement", async () => {
    repo.getActiveDecisionsForUser.mockResolvedValue([decisionFixture()]);
    repo.countPriorDecisionsByProspect.mockResolvedValue([{ prospectId: "prospect_1", _count: { _all: 3 } }]);

    const queue = await getQueueForUser("user_1", "team_1");

    expect(queue.items[0]?.lastActivity).toBe("Re-engagement");
    expect(queue.stats.reEngagements).toBe(1);
  });

  it("includes the decision's raw createdAt timestamp for client-side recency sorting (Bible §18 DSH-2 filter/sort)", async () => {
    const createdAt = new Date("2026-07-10T08:00:00Z");
    repo.getActiveDecisionsForUser.mockResolvedValue([decisionFixture({ createdAt })]);

    const queue = await getQueueForUser("user_1", "team_1");

    expect(queue.items[0]?.createdAt).toBe(createdAt.toISOString());
  });

  it("maps recommendedAction to a human-readable suggestedAction", async () => {
    repo.getActiveDecisionsForUser.mockResolvedValue([
      decisionFixture({ recommendedAction: "wait_for_signal" }),
    ]);

    const queue = await getQueueForUser("user_1", "team_1");

    expect(queue.items[0]?.suggestedAction).toBe("Wait for signal");
  });

  it("aggregates stats matching Bible §10.4 shape", async () => {
    repo.getActiveDecisionsForUser.mockResolvedValue([
      decisionFixture({ id: "d1", verdict: "STRONG_YES" }),
      decisionFixture({ id: "d2", verdict: "YES", prospectId: "prospect_2" }),
      decisionFixture({ id: "d3", verdict: "HARD_PASS", prospectId: "prospect_3" }),
    ]);

    const queue = await getQueueForUser("user_1", "team_1");

    expect(queue.stats.total).toBe(3);
    expect(queue.stats.strongYes).toBe(1);
    expect(queue.stats.yes).toBe(1);
    expect(queue.stats.pass).toBe(1); // HARD_PASS counted under "pass" bucket
  });
});
