import { describe, expect, it, vi, beforeEach } from "vitest";

const getHistoricalPairDisagreementRates = vi.fn();
vi.mock("./pair-frequency.repository.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./pair-frequency.repository.js")>();
  return { ...actual, getHistoricalPairDisagreementRates };
});

const { calculateSurpriseForPairs, calculateConflictSurprise } = await import("./conflict-surprise.js");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("calculateSurpriseForPairs", () => {
  it("only produces a surprise entry for pairs that are currently disagreeing", () => {
    // icp/intent both positive (no disagreement); icp/risk disagree (icp positive, risk negative).
    const { pairSurprises } = calculateSurpriseForPairs(
      { icpScore: 90, intentScore: 85, riskSafetyScore: 20 },
      { icp_intent: 0.1, icp_risk: 0.1, intent_risk: 0.1 },
    );

    expect(pairSurprises).toHaveLength(2); // icp_risk and intent_risk both disagree with the safety score
    expect(pairSurprises.map((p) => p.pair.join("_"))).toEqual(expect.arrayContaining(["icp_risk", "intent_risk"]));
  });

  it("computes surprise as 1 - historicalRate, higher when the pair rarely disagrees", () => {
    const { pairSurprises } = calculateSurpriseForPairs(
      { icpScore: 90, intentScore: 20, riskSafetyScore: 60 },
      { icp_intent: 0.05, icp_risk: 0.1, intent_risk: 0.1 },
    );

    const icpIntent = pairSurprises.find((p) => p.pair.join("_") === "icp_intent");
    expect(icpIntent?.surprise).toBeCloseTo(0.95);
    expect(icpIntent?.severity).toBe("high");
  });

  it("falls back to the 0.10 prior when a pair is missing from historicalRates", () => {
    const { pairSurprises } = calculateSurpriseForPairs({ icpScore: 90, intentScore: 20, riskSafetyScore: 60 }, {});

    const icpIntent = pairSurprises.find((p) => p.pair.join("_") === "icp_intent");
    expect(icpIntent?.historicalRate).toBe(0.1);
  });
});

describe("calculateConflictSurprise", () => {
  it("combines base conflict with historical surprise and sets needsDebate when maxSurprise is high", async () => {
    getHistoricalPairDisagreementRates.mockResolvedValue({ icp_intent: 0.05, icp_risk: 0.1, intent_risk: 0.1 });

    const result = await calculateConflictSurprise("team_1", {
      icpScore: 90,
      intentScore: 20,
      riskSafetyScore: 60,
    });

    expect(result.directional).toBe(true);
    expect(result.maxSurprise).toBeCloseTo(0.95);
    expect(result.needsDebate).toBe(true);
    expect(result.severity).toBe("critical");
  });

  it("reports low severity and needsDebate false when all agents agree", async () => {
    getHistoricalPairDisagreementRates.mockResolvedValue({ icp_intent: 0.1, icp_risk: 0.1, intent_risk: 0.1 });

    const result = await calculateConflictSurprise("team_1", {
      icpScore: 82,
      intentScore: 80,
      riskSafetyScore: 78,
    });

    expect(result.directional).toBe(false);
    expect(result.pairSurprises).toHaveLength(0);
    expect(result.needsDebate).toBe(false);
    expect(result.severity).toBe("low");
  });
});
