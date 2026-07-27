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
    const result = await getCachedDebateOutput("prospect_1", "team_1", 1, "legacy");
    expect(result).toBeNull();
    expect(redis.get).toHaveBeenCalledWith("decision:prospect_1:team_1:1:legacy");
  });

  it("parses a cached value using the Bible §9.2 key format, extended with the runtime path", async () => {
    redis.get.mockResolvedValue(JSON.stringify(sampleOutput));
    const result = await getCachedDebateOutput("prospect_1", "team_1", "none", "legacy");
    expect(redis.get).toHaveBeenCalledWith("decision:prospect_1:team_1:none:legacy");
    expect(result).toEqual(sampleOutput);
  });

  it("treats a corrupt cache entry as a miss instead of throwing", async () => {
    redis.get.mockResolvedValue("{not valid json");
    const result = await getCachedDebateOutput("prospect_1", "team_1", 1, "legacy");
    expect(result).toBeNull();
  });

  // Bug fix (Critical #1): this is the actual scenario that was broken --
  // an Execution Runtime v1 write must never be visible to a legacy-path
  // read for the same prospect+team+icpVersion, and vice versa.
  it("isolates legacy and execution-runtime-v1 cache entries for the same prospect+team+icpVersion", async () => {
    await getCachedDebateOutput("prospect_1", "team_1", 1, "legacy");
    await getCachedDebateOutput("prospect_1", "team_1", 1, "execution-runtime-v1");
    const [legacyKey] = redis.get.mock.calls[0] as [string];
    const [runtimeKey] = redis.get.mock.calls[1] as [string];
    expect(legacyKey).not.toBe(runtimeKey);
    expect(legacyKey).toBe("decision:prospect_1:team_1:1:legacy");
    expect(runtimeKey).toBe("decision:prospect_1:team_1:1:execution-runtime-v1");
  });
});

describe("setCachedDebateOutput", () => {
  it("stores JSON with a 24h TTL (Bible §9.2), keyed by runtime path", async () => {
    await setCachedDebateOutput("prospect_1", "team_1", 2, "legacy", sampleOutput as never);
    expect(redis.set).toHaveBeenCalledWith(
      "decision:prospect_1:team_1:2:legacy",
      JSON.stringify(sampleOutput),
      "EX",
      86400,
    );
  });

  it("writes execution-runtime-v1 output under a different key than legacy would use", async () => {
    await setCachedDebateOutput("prospect_1", "team_1", 2, "execution-runtime-v1", sampleOutput as never);
    expect(redis.set).toHaveBeenCalledWith(
      "decision:prospect_1:team_1:2:execution-runtime-v1",
      JSON.stringify(sampleOutput),
      "EX",
      86400,
    );
  });
});

describe("invalidateDecisionCache", () => {
  it("deletes every icpVersion+runtime-keyed entry for this prospect+team", async () => {
    redis.keys.mockResolvedValue([
      "decision:prospect_1:team_1:1:legacy",
      "decision:prospect_1:team_1:2:execution-runtime-v1",
    ]);
    await invalidateDecisionCache("prospect_1", "team_1");
    expect(redis.keys).toHaveBeenCalledWith("decision:prospect_1:team_1:*");
    expect(redis.del).toHaveBeenCalledWith(
      "decision:prospect_1:team_1:1:legacy",
      "decision:prospect_1:team_1:2:execution-runtime-v1",
    );
  });

  it("does not call del when there's nothing to invalidate", async () => {
    redis.keys.mockResolvedValue([]);
    await invalidateDecisionCache("prospect_1", "team_1");
    expect(redis.del).not.toHaveBeenCalled();
  });
});
