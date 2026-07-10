import { describe, expect, it, vi, beforeEach } from "vitest";

const redis = { get: vi.fn(), set: vi.fn(), keys: vi.fn(), del: vi.fn() };
vi.mock("./redis.js", () => ({ redis }));

const { getCachedDebateOutput, setCachedDebateOutput, invalidateDecisionCache } = await import(
  "./decision-cache.js"
);

const sampleOutput = {
  research: { summary: "s", data_points: [], unfair_advantages: [], hidden_risks: [], confidence: 80, data_gaps: [] },
  icp: { score: 80, criteria_evaluated: [], overall_assessment: "", edge_cases: [], confidence: 80 },
  intent: { score: 70, signals: [], trajectory: "stable", false_intent_flags: [], confidence: 75 },
  risk: { score: 10, risks: [], red_flags: [], time_waste_probability: 10, mitigation_strategies: [], confidence: 80 },
  judge: {
    verdict: "YES",
    confidence: 82,
    weighted_score: 78,
    agent_consensus: "high",
    conflicts: [],
    reasoning: "r",
    key_evidence: [],
    message: { linkedin: "hi", email: null, tone: "professional", personalization_hooks: [] },
    recommended_action: "message_now",
    confidence_explanation: "e",
  },
} as const;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getCachedDebateOutput", () => {
  it("returns null on a cache miss without calling JSON.parse on undefined", async () => {
    redis.get.mockResolvedValue(null);
    const result = await getCachedDebateOutput("prospect_1", "team_1", 1);
    expect(result).toBeNull();
    expect(redis.get).toHaveBeenCalledWith("decision:prospect_1:team_1:1");
  });

  it("parses a cached value using the Bible §9.2 key format", async () => {
    redis.get.mockResolvedValue(JSON.stringify(sampleOutput));
    const result = await getCachedDebateOutput("prospect_1", "team_1", "none");
    expect(redis.get).toHaveBeenCalledWith("decision:prospect_1:team_1:none");
    expect(result).toEqual(sampleOutput);
  });

  it("treats a corrupt cache entry as a miss instead of throwing", async () => {
    redis.get.mockResolvedValue("{not valid json");
    const result = await getCachedDebateOutput("prospect_1", "team_1", 1);
    expect(result).toBeNull();
  });
});

describe("setCachedDebateOutput", () => {
  it("stores JSON with a 24h TTL (Bible §9.2)", async () => {
    await setCachedDebateOutput("prospect_1", "team_1", 2, sampleOutput as never);
    expect(redis.set).toHaveBeenCalledWith(
      "decision:prospect_1:team_1:2",
      JSON.stringify(sampleOutput),
      "EX",
      86400,
    );
  });
});

describe("invalidateDecisionCache", () => {
  it("deletes every icpVersion-keyed entry for this prospect+team", async () => {
    redis.keys.mockResolvedValue(["decision:prospect_1:team_1:1", "decision:prospect_1:team_1:2"]);
    await invalidateDecisionCache("prospect_1", "team_1");
    expect(redis.keys).toHaveBeenCalledWith("decision:prospect_1:team_1:*");
    expect(redis.del).toHaveBeenCalledWith(
      "decision:prospect_1:team_1:1",
      "decision:prospect_1:team_1:2",
    );
  });

  it("does not call del when there's nothing to invalidate", async () => {
    redis.keys.mockResolvedValue([]);
    await invalidateDecisionCache("prospect_1", "team_1");
    expect(redis.del).not.toHaveBeenCalled();
  });
});
