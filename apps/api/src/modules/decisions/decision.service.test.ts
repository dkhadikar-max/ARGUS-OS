import { describe, expect, it, vi, beforeEach } from "vitest";
import { AppError, type CreateDecisionRequest } from "@argus/shared";
import type { AuthContext } from "../../middleware/auth.js";

const repo = {
  upsertProspect: vi.fn(),
  getActiveIcp: vi.fn(),
  getCompanyMemory: vi.fn(),
  getUserPreferences: vi.fn(),
  getProspectDecisionHistory: vi.fn(),
  getTeamOutcomeHistory: vi.fn(),
  createDecisionRecord: vi.fn(),
  findDecisionById: vi.fn(),
  createOverride: vi.fn(),
};

vi.mock("./decision.repository.js", () => repo);

const runAgentDebate = vi.fn();
vi.mock("../../agents/orchestrator.js", () => ({ runAgentDebate }));

const { createDecision, getDecision, overrideDecision } = await import("./decision.service.js");

const auth: AuthContext = { type: "user", userId: "user_1", teamId: "team_1", planTier: "FREE" };

const request: CreateDecisionRequest = {
  prospect: {
    linkedInUrl: "https://linkedin.com/in/sarahchen",
    name: "Sarah Chen",
    title: "VP Engineering",
    companyName: "DataFlow Inc.",
    companyDomain: "dataflow.io",
  },
  context: { source: "linkedin_sidebar", trigger: "profile_view", userId: "user_1", teamId: "team_1" },
  options: { generateMessage: true, messageChannel: "LINKEDIN", messageTone: "professional", includeDebate: false },
};

const agentDebateOutput = {
  research: {
    summary: "Solid fit.",
    data_points: [
      { type: "firmographic", signal: "Series B", relevance: "Ideal stage" },
      { type: "risk", signal: "No prior contact", relevance: "Cold outreach risk" },
    ],
    unfair_advantages: [],
    hidden_risks: [],
    confidence: 88,
    data_gaps: [],
  },
  icp: { score: 90, criteria_evaluated: [], overall_assessment: "Great", edge_cases: [], confidence: 90 },
  intent: { score: 80, signals: [], trajectory: "increasing", false_intent_flags: [], confidence: 85 },
  risk: { score: 10, risks: [], red_flags: [], time_waste_probability: 10, mitigation_strategies: [], confidence: 85 },
  judge: {
    verdict: "STRONG_YES",
    confidence: 94,
    weighted_score: 94,
    agent_consensus: "high",
    conflicts: [],
    reasoning: "Strong across the board.",
    key_evidence: ["Series B"],
    message: { linkedin: "Hi Sarah", email: null, tone: "professional", personalization_hooks: ["Series B"] },
    recommended_action: "message_now",
    confidence_explanation: "High quality data.",
  },
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createDecision", () => {
  it("maps the research agent's 'risk' data-point type to EvidenceType.DERIVED", async () => {
    repo.upsertProspect.mockResolvedValue({
      id: "prospect_1",
      name: "Sarah Chen",
      title: "VP Engineering",
      companyName: "DataFlow Inc.",
      companyDomain: "dataflow.io",
      linkedInUrl: request.prospect.linkedInUrl,
      companySize: null,
      companyIndustry: null,
      companyFunding: null,
      rawProfile: null,
      enrichedData: null,
    });
    repo.getActiveIcp.mockResolvedValue(null);
    repo.getCompanyMemory.mockResolvedValue(null);
    repo.getUserPreferences.mockResolvedValue(null);
    repo.getProspectDecisionHistory.mockResolvedValue([]);
    repo.getTeamOutcomeHistory.mockResolvedValue([]);
    runAgentDebate.mockResolvedValue({ output: agentDebateOutput, processingTimeMs: 3200 });
    repo.createDecisionRecord.mockResolvedValue({ id: "dec_1" });
    repo.findDecisionById.mockResolvedValue({
      id: "dec_1",
      verdict: "STRONG_YES",
      confidence: 94,
      reasoning: "Strong across the board.",
      recommendedAction: "message_now",
      processingTimeMs: 3200,
      createdAt: new Date("2026-07-10T14:32:00Z"),
      updatedAt: new Date("2026-07-10T14:32:00Z"),
      evidence: [
        { id: "ev_1", type: "FIRMOGRAPHIC", data: { signal: "Series B", relevance: "Ideal stage" }, confidence: 88 },
        { id: "ev_2", type: "DERIVED", data: { signal: "No prior contact", relevance: "Cold outreach risk" }, confidence: 88 },
      ],
      messageDrafts: [{ channel: "LINKEDIN", body: "Hi Sarah", tone: "professional", personalizationHooks: ["Series B"] }],
      outcome: null,
      override: null,
      prospect: { id: "prospect_1" },
    });

    const result = await createDecision(request, auth);

    expect(repo.createDecisionRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        evidence: [
          expect.objectContaining({ type: "FIRMOGRAPHIC" }),
          expect.objectContaining({ type: "DERIVED" }),
        ],
      }),
    );
    expect(result.verdict).toBe("STRONG_YES");
    expect(result.evidence).toHaveLength(2);
  });
});

describe("getDecision", () => {
  it("throws NOT_FOUND when the decision doesn't exist for this team", async () => {
    repo.findDecisionById.mockResolvedValue(null);
    await expect(getDecision("dec_missing", auth)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("overrideDecision", () => {
  it("throws FORBIDDEN for API-key auth with no userId", async () => {
    const apiKeyAuth: AuthContext = { type: "api_key", teamId: "team_1", planTier: "FREE", apiKeyId: "key_1" };
    await expect(
      overrideDecision("dec_1", { newVerdict: "PASS" }, apiKeyAuth),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("throws DECISION_STALE when already overridden", async () => {
    repo.findDecisionById.mockResolvedValue({ id: "dec_1", verdict: "YES", override: { id: "ovr_1" } });
    await expect(
      overrideDecision("dec_1", { newVerdict: "PASS" }, auth),
    ).rejects.toMatchObject({ code: "DECISION_STALE" });
  });

  it("creates an override preserving the original verdict", async () => {
    repo.findDecisionById.mockResolvedValue({ id: "dec_1", verdict: "YES", override: null });
    repo.createOverride.mockResolvedValue({
      id: "ovr_1",
      originalVerdict: "YES",
      newVerdict: "PASS",
      reason: "Already a customer",
      createdAt: new Date("2026-07-10T14:35:00Z"),
    });

    const result = await overrideDecision("dec_1", { newVerdict: "PASS", reason: "Already a customer" }, auth);

    expect(result.originalVerdict).toBe("YES");
    expect(result.newVerdict).toBe("PASS");
    expect(repo.createOverride).toHaveBeenCalledWith(
      expect.objectContaining({ originalVerdict: "YES", newVerdict: "PASS" }),
    );
  });
});
