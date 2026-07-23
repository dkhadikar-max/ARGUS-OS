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
  createActionTaken: vi.fn(),
  updateMessageDraft: vi.fn(),
};

vi.mock("./decision.repository.js", () => repo);

const runAgentDebate = vi.fn();
vi.mock("../../agents/orchestrator.js", () => ({ runAgentDebate }));

const publishTeamEvent = vi.fn();
vi.mock("../../lib/pubsub.js", () => ({ publishTeamEvent }));

const getCachedDebateOutput = vi.fn();
const setCachedDebateOutput = vi.fn();
vi.mock("../../lib/decision-cache.js", () => ({ getCachedDebateOutput, setCachedDebateOutput }));

const track = vi.fn();
vi.mock("../../lib/analytics.js", () => ({ track }));

const enrichProspect = vi.fn();
vi.mock("../../lib/enrichment/enrichment.service.js", () => ({ enrichProspect }));

const recordAudit = vi.fn();
vi.mock("../../lib/audit.js", () => ({ recordAudit }));

const resolveSlackTeamByArgusTeamId = vi.fn();
vi.mock("../integrations/integration.service.js", () => ({ resolveSlackTeamByArgusTeamId }));

const postSlackMessage = vi.fn();
vi.mock("../../lib/slack-client.js", () => ({ postSlackMessage }));

const getPolicy = vi.fn();
vi.mock("../policy/policy.repository.js", () => ({ getPolicy }));

const getRecentOverrideCounts = vi.fn();
vi.mock("../outcomes/outcome.repository.js", () => ({ getRecentOverrideCounts }));

const getTeam = vi.fn();
vi.mock("../teams/team.repository.js", () => ({ getTeam }));

const { createDecision, getDecision, overrideDecision, recordAction, shareDecision, editMessageDraft } = await import(
  "./decision.service.js"
);

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
  getCachedDebateOutput.mockResolvedValue(null); // default: cache miss
  // Default: enrichment ran but changed nothing (e.g. no companyDomain, or
  // already fresh) — tests that care about enrichment override this.
  enrichProspect.mockImplementation((prospect) =>
    Promise.resolve({ prospect, apollo: null, clearbit: null }),
  );
  getPolicy.mockResolvedValue(null); // default: team has no policy rules configured
  // default: below the guardrail's own minimum sample size, so it never
  // fires unless a test explicitly sets a larger window.
  getRecentOverrideCounts.mockResolvedValue({ total: 0, overridden: 0 });
  getTeam.mockResolvedValue({ companyContext: null }); // default: no company context set
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
    runAgentDebate.mockResolvedValue({
      output: agentDebateOutput,
      processingTimeMs: 3200,
      usage: { inputTokens: 4000, outputTokens: 2000 },
    });
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
      prospect: {
        id: "prospect_1",
        name: "Sarah Chen",
        title: "VP Engineering",
        companyName: "DataFlow Inc.",
        linkedInUrl: "https://linkedin.com/in/sarahchen",
      },
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
    expect(publishTeamEvent).toHaveBeenCalledWith(
      "team_1",
      expect.objectContaining({ type: "decision.created" }),
    );
    expect(setCachedDebateOutput).toHaveBeenCalledWith(
      "prospect_1",
      "team_1",
      "none",
      agentDebateOutput,
    );
    expect(track).toHaveBeenCalledWith(
      "user_1",
      expect.objectContaining({
        name: "verdict_generated",
        properties: expect.objectContaining({ decision_id: "dec_1", verdict: "STRONG_YES" }),
      }),
    );
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: "decision",
        entityId: "dec_1",
        action: "created",
        actorId: "user_1",
      }),
    );
  });

  // Judge legitimately drafts no message at all (recommended_action:
  // "pass_and_move_on") -- MessageDraft.body is a non-nullable DB column,
  // so this must resolve to `message: null` rather than passing a null body
  // through to createDecisionRecord.
  it("omits the message draft entirely when the judge recommends no outreach", async () => {
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
    runAgentDebate.mockResolvedValue({
      output: {
        ...agentDebateOutput,
        judge: {
          ...agentDebateOutput.judge,
          verdict: "HARD_PASS",
          recommended_action: "pass_and_move_on",
          message: { linkedin: null, email: null, tone: "professional", personalization_hooks: [] },
        },
      },
      processingTimeMs: 3200,
      usage: { inputTokens: 4000, outputTokens: 2000 },
    });
    repo.createDecisionRecord.mockResolvedValue({ id: "dec_1" });
    repo.findDecisionById.mockResolvedValue({
      id: "dec_1",
      verdict: "HARD_PASS",
      confidence: 94,
      reasoning: "Not a fit.",
      recommendedAction: "pass_and_move_on",
      processingTimeMs: 3200,
      createdAt: new Date("2026-07-10T14:32:00Z"),
      updatedAt: new Date("2026-07-10T14:32:00Z"),
      evidence: [],
      messageDrafts: [],
      outcome: null,
      override: null,
      prospect: {
        id: "prospect_1",
        name: "Sarah Chen",
        title: "VP Engineering",
        companyName: "DataFlow Inc.",
        linkedInUrl: "https://linkedin.com/in/sarahchen",
      },
    });

    await createDecision(request, auth);

    expect(repo.createDecisionRecord).toHaveBeenCalledWith(expect.objectContaining({ message: null }));
  });

  // The judge omits a linkedin draft but still has an email one -- falls
  // back to it (and labels the channel EMAIL, not the originally-requested
  // LINKEDIN) rather than treating "no linkedin" as "no message at all".
  it("falls back to the other channel's draft when the requested one is null", async () => {
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
    runAgentDebate.mockResolvedValue({
      output: {
        ...agentDebateOutput,
        judge: {
          ...agentDebateOutput.judge,
          message: { linkedin: null, email: "Hi Sarah,", tone: "professional", personalization_hooks: [] },
        },
      },
      processingTimeMs: 3200,
      usage: { inputTokens: 4000, outputTokens: 2000 },
    });
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
      evidence: [],
      messageDrafts: [{ channel: "EMAIL", body: "Hi Sarah,", tone: "professional", personalizationHooks: [] }],
      outcome: null,
      override: null,
      prospect: {
        id: "prospect_1",
        name: "Sarah Chen",
        title: "VP Engineering",
        companyName: "DataFlow Inc.",
        linkedInUrl: "https://linkedin.com/in/sarahchen",
      },
    });

    await createDecision(request, auth);

    expect(repo.createDecisionRecord).toHaveBeenCalledWith(
      expect.objectContaining({ message: { channel: "EMAIL", body: "Hi Sarah,", tone: "professional", personalizationHooks: [] } }),
    );
  });

  it("evaluates the team's policy rules against the verdict/confidence and surfaces the resulting flags (Policy v2.1 L4 Policy Engine)", async () => {
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
    // agentDebateOutput's judge.confidence is 94 -- this rule should match.
    getPolicy.mockResolvedValue({
      rules: [{ field: "confidence", operator: "gte", value: 90, action: "FLAG", message: "Very high confidence -- double-check evidence" }],
      version: 1,
    });
    runAgentDebate.mockResolvedValue({
      output: agentDebateOutput,
      processingTimeMs: 3200,
      usage: { inputTokens: 4000, outputTokens: 2000 },
    });
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
      policyFlags: [{ field: "confidence", action: "FLAG", message: "Very high confidence -- double-check evidence" }],
      evidence: [],
      messageDrafts: [],
      outcome: null,
      override: null,
      prospect: {
        id: "prospect_1",
        name: "Sarah Chen",
        title: "VP Engineering",
        companyName: "DataFlow Inc.",
        linkedInUrl: "https://linkedin.com/in/sarahchen",
      },
    });

    const result = await createDecision(request, auth);

    expect(getPolicy).toHaveBeenCalledWith("team_1");
    expect(repo.createDecisionRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        policyFlags: [{ field: "confidence", action: "FLAG", message: "Very high confidence -- double-check evidence" }],
      }),
    );
    expect(result.policyFlags).toEqual([
      { field: "confidence", action: "FLAG", message: "Very high confidence -- double-check evidence" },
    ]);
  });

  it("adds Apollo/Clearbit-sourced evidence when enrichment finds data (Bible §18 AI-2)", async () => {
    const enrichedProspect = {
      id: "prospect_1",
      name: "Sarah Chen",
      title: "VP Engineering",
      companyName: "DataFlow Inc.",
      companyDomain: "dataflow.io",
      linkedInUrl: request.prospect.linkedInUrl,
      companySize: "87",
      companyIndustry: "information technology & services",
      companyFunding: "$24,000,000",
      rawProfile: null,
      enrichedData: { apollo: {}, clearbit: null },
    };
    repo.upsertProspect.mockResolvedValue({ ...enrichedProspect, companySize: null, companyIndustry: null, companyFunding: null });
    enrichProspect.mockResolvedValue({
      prospect: enrichedProspect,
      apollo: { industry: "information technology & services", estimatedNumEmployees: 87, totalFunding: 24_000_000, latestFundingRoundDate: null },
      clearbit: null,
    });
    repo.getActiveIcp.mockResolvedValue(null);
    repo.getCompanyMemory.mockResolvedValue(null);
    repo.getUserPreferences.mockResolvedValue(null);
    repo.getProspectDecisionHistory.mockResolvedValue([]);
    repo.getTeamOutcomeHistory.mockResolvedValue([]);
    runAgentDebate.mockResolvedValue({
      output: agentDebateOutput,
      processingTimeMs: 3200,
      usage: { inputTokens: 4000, outputTokens: 2000 },
    });
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
      evidence: [],
      messageDrafts: [],
      outcome: null,
      override: null,
      prospect: enrichedProspect,
    });

    await createDecision(request, auth);

    expect(enrichProspect).toHaveBeenCalledWith(expect.objectContaining({ id: "prospect_1" }));
    expect(repo.createDecisionRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        evidence: expect.arrayContaining([
          expect.objectContaining({
            type: "FIRMOGRAPHIC",
            source: "APOLLO",
            data: expect.objectContaining({ relevance: "Company firmographics from Apollo.io" }),
          }),
        ]),
      }),
    );
  });

  it("adds a DEMOGRAPHIC evidence entry when Apollo's person match finds seniority/email data (Bible §18 AI-2)", async () => {
    const enrichedProspect = {
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
      enrichedData: { apollo: null, clearbit: null, person: {} },
    };
    repo.upsertProspect.mockResolvedValue(enrichedProspect);
    enrichProspect.mockResolvedValue({
      prospect: enrichedProspect,
      apollo: null,
      clearbit: null,
      person: { title: "VP Engineering", seniority: "vp", email: "sarah@dataflow.io", emailStatus: "verified" },
    });
    repo.getActiveIcp.mockResolvedValue(null);
    repo.getCompanyMemory.mockResolvedValue(null);
    repo.getUserPreferences.mockResolvedValue(null);
    repo.getProspectDecisionHistory.mockResolvedValue([]);
    repo.getTeamOutcomeHistory.mockResolvedValue([]);
    runAgentDebate.mockResolvedValue({
      output: agentDebateOutput,
      processingTimeMs: 3200,
      usage: { inputTokens: 4000, outputTokens: 2000 },
    });
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
      evidence: [],
      messageDrafts: [],
      outcome: null,
      override: null,
      prospect: enrichedProspect,
    });

    await createDecision(request, auth);

    expect(repo.createDecisionRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        evidence: expect.arrayContaining([
          expect.objectContaining({
            type: "DEMOGRAPHIC",
            source: "APOLLO",
            data: expect.objectContaining({
              signal: "Seniority: vp · Email verified",
              relevance: "Verified person-level details from Apollo.io",
            }),
          }),
        ]),
      }),
    );
  });

  it("skips the Claude call entirely on a cache hit (Bible §18 AI-5)", async () => {
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
    repo.getActiveIcp.mockResolvedValue({ version: 3, criteria: {} });
    repo.getCompanyMemory.mockResolvedValue(null);
    repo.getUserPreferences.mockResolvedValue(null);
    repo.getProspectDecisionHistory.mockResolvedValue([]);
    repo.getTeamOutcomeHistory.mockResolvedValue([]);
    getCachedDebateOutput.mockResolvedValue(agentDebateOutput);
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
      evidence: [],
      messageDrafts: [],
      outcome: null,
      override: null,
      prospect: {
        id: "prospect_1",
        name: "Sarah Chen",
        title: "VP Engineering",
        companyName: "DataFlow Inc.",
        linkedInUrl: "https://linkedin.com/in/sarahchen",
      },
    });

    await createDecision(request, auth);

    expect(getCachedDebateOutput).toHaveBeenCalledWith("prospect_1", "team_1", 3);
    expect(runAgentDebate).not.toHaveBeenCalled();
    expect(setCachedDebateOutput).not.toHaveBeenCalled();
    // A cache hit still creates its own Decision row -- each request is
    // its own auditable event even when the AI analysis is reused.
    expect(repo.createDecisionRecord).toHaveBeenCalled();
  });

  it("includes the full agent debate breakdown when options.includeDebate is true (Bible §6.5)", async () => {
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
    runAgentDebate.mockResolvedValue({
      output: agentDebateOutput,
      processingTimeMs: 3200,
      usage: { inputTokens: 4000, outputTokens: 2000 },
    });
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
      evidence: [],
      messageDrafts: [],
      outcome: null,
      override: null,
      agentOutputs: agentDebateOutput,
      prospect: {
        id: "prospect_1",
        name: "Sarah Chen",
        title: "VP Engineering",
        companyName: "DataFlow Inc.",
        linkedInUrl: "https://linkedin.com/in/sarahchen",
      },
    });

    const result = await createDecision(
      { ...request, options: { ...request.options, includeDebate: true } },
      auth,
    );

    expect(result.debate).toEqual(agentDebateOutput);
  });

  it("omits the debate field when options.includeDebate is false (default)", async () => {
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
    runAgentDebate.mockResolvedValue({
      output: agentDebateOutput,
      processingTimeMs: 3200,
      usage: { inputTokens: 4000, outputTokens: 2000 },
    });
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
      evidence: [],
      messageDrafts: [],
      outcome: null,
      override: null,
      agentOutputs: agentDebateOutput,
      prospect: {
        id: "prospect_1",
        name: "Sarah Chen",
        title: "VP Engineering",
        companyName: "DataFlow Inc.",
        linkedInUrl: "https://linkedin.com/in/sarahchen",
      },
    });

    const result = await createDecision(request, auth);

    expect(result.debate).toBeUndefined();
  });
});

describe("getDecision", () => {
  it("throws NOT_FOUND when the decision doesn't exist for this team", async () => {
    repo.findDecisionById.mockResolvedValue(null);
    await expect(getDecision("dec_missing", auth)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("always includes the full debate breakdown, since GET backs 'View More' / deep inspection (Bible §6.5)", async () => {
    repo.findDecisionById.mockResolvedValue({
      id: "dec_1",
      verdict: "STRONG_YES",
      confidence: 94,
      reasoning: "Strong across the board.",
      recommendedAction: "message_now",
      processingTimeMs: 3200,
      createdAt: new Date("2026-07-10T14:32:00Z"),
      updatedAt: new Date("2026-07-10T14:32:00Z"),
      evidence: [],
      messageDrafts: [],
      outcome: null,
      override: null,
      agentOutputs: agentDebateOutput,
      prospect: {
        id: "prospect_1",
        name: "Sarah Chen",
        title: "VP Engineering",
        companyName: "DataFlow Inc.",
        linkedInUrl: "https://linkedin.com/in/sarahchen",
      },
    });

    const result = await getDecision("dec_1", auth);

    expect(result.debate).toEqual(agentDebateOutput);
  });

  it("degrades to debate: null instead of throwing when agentOutputs is malformed", async () => {
    repo.findDecisionById.mockResolvedValue({
      id: "dec_1",
      verdict: "STRONG_YES",
      confidence: 94,
      reasoning: "Strong across the board.",
      recommendedAction: "message_now",
      processingTimeMs: 3200,
      createdAt: new Date("2026-07-10T14:32:00Z"),
      updatedAt: new Date("2026-07-10T14:32:00Z"),
      evidence: [],
      messageDrafts: [],
      outcome: null,
      override: null,
      agentOutputs: null, // e.g. a pre-existing row from before this field existed
      prospect: {
        id: "prospect_1",
        name: "Sarah Chen",
        title: "VP Engineering",
        companyName: "DataFlow Inc.",
        linkedInUrl: "https://linkedin.com/in/sarahchen",
      },
    });

    const result = await getDecision("dec_1", auth);

    expect(result.debate).toBeNull();
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
    expect(track).toHaveBeenCalledWith(
      "user_1",
      expect.objectContaining({
        name: "verdict_overridden",
        properties: { decision_id: "dec_1", original_verdict: "YES", new_verdict: "PASS", reason: "Already a customer" },
      }),
    );
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: "decision",
        entityId: "dec_1",
        action: "overridden",
        actorId: "user_1",
        beforeState: { verdict: "YES" },
        afterState: { verdict: "PASS", reason: "Already a customer" },
      }),
    );
  });

  describe("Override Rate Guardrail (Policy v2.1, not the Bible)", () => {
    beforeEach(() => {
      repo.findDecisionById.mockResolvedValue({ id: "dec_1", verdict: "YES", override: null });
      repo.createOverride.mockResolvedValue({
        id: "ovr_1",
        originalVerdict: "YES",
        newVerdict: "PASS",
        reason: null,
        createdAt: new Date("2026-07-10T14:35:00Z"),
      });
      resolveSlackTeamByArgusTeamId.mockResolvedValue({
        argusTeamId: "team_1",
        apiKey: "key",
        botToken: "xoxb-real-token",
        botUserId: "U1",
        alertChannelId: "C123",
      });
      postSlackMessage.mockResolvedValue(undefined);
    });

    it("alerts Slack and records an audit entry when this override crosses 40% with a large enough sample", async () => {
      // 8 of 20 already overridden (40%, not yet over); this 9th push it to
      // 45% -- exactly the crossing moment the guardrail should catch.
      getRecentOverrideCounts.mockResolvedValue({ total: 20, overridden: 9 });

      await overrideDecision("dec_1", { newVerdict: "PASS" }, auth);

      expect(postSlackMessage).toHaveBeenCalledWith(
        "xoxb-real-token",
        "C123",
        expect.stringContaining("45%"),
      );
      expect(recordAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: "policy_guardrail",
          entityId: "team_1",
          action: "override_rate_exceeded",
        }),
      );
    });

    it("does not trigger below the minimum sample size, even at 100% override rate", async () => {
      getRecentOverrideCounts.mockResolvedValue({ total: 3, overridden: 3 });

      await overrideDecision("dec_1", { newVerdict: "PASS" }, auth);

      expect(postSlackMessage).not.toHaveBeenCalled();
      expect(recordAudit).not.toHaveBeenCalledWith(
        expect.objectContaining({ entityType: "policy_guardrail" }),
      );
    });

    it("does not re-trigger on a later override once the team is already above 40% (fires once, on the crossing, not every time after)", async () => {
      // Already 10/20 (50%) before this override -- rate was already above
      // 40%, so this one isn't the crossing.
      getRecentOverrideCounts.mockResolvedValue({ total: 20, overridden: 10 });

      await overrideDecision("dec_1", { newVerdict: "PASS" }, auth);

      expect(postSlackMessage).not.toHaveBeenCalled();
    });

    it("does not trigger when the resulting rate is still at or below 40%", async () => {
      getRecentOverrideCounts.mockResolvedValue({ total: 20, overridden: 8 }); // 40% exactly

      await overrideDecision("dec_1", { newVerdict: "PASS" }, auth);

      expect(postSlackMessage).not.toHaveBeenCalled();
    });

    it("still succeeds even when the guardrail's own Slack alert fails (best-effort)", async () => {
      getRecentOverrideCounts.mockResolvedValue({ total: 20, overridden: 9 });
      postSlackMessage.mockRejectedValue(new Error("Slack is down"));

      await expect(overrideDecision("dec_1", { newVerdict: "PASS" }, auth)).resolves.toMatchObject({
        newVerdict: "PASS",
      });
    });

    it("still succeeds even when the guardrail check itself throws (e.g. a DB error)", async () => {
      getRecentOverrideCounts.mockRejectedValue(new Error("db unavailable"));

      await expect(overrideDecision("dec_1", { newVerdict: "PASS" }, auth)).resolves.toMatchObject({
        newVerdict: "PASS",
      });
    });
  });
});

describe("recordAction", () => {
  it("throws FORBIDDEN for API-key auth with no userId", async () => {
    const apiKeyAuth: AuthContext = { type: "api_key", teamId: "team_1", planTier: "FREE", apiKeyId: "key_1" };
    await expect(
      recordAction("dec_1", { actionType: "MESSAGE_SENT" }, apiKeyAuth),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(repo.createActionTaken).not.toHaveBeenCalled();
  });

  it("throws NOT_FOUND when the decision doesn't exist for this team", async () => {
    repo.findDecisionById.mockResolvedValue(null);
    await expect(
      recordAction("dec_missing", { actionType: "MESSAGE_SENT" }, auth),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("throws DECISION_STALE when an action was already recorded", async () => {
    repo.findDecisionById.mockResolvedValue({ id: "dec_1", actionTaken: { id: "act_1" } });
    await expect(
      recordAction("dec_1", { actionType: "MESSAGE_SENT" }, auth),
    ).rejects.toMatchObject({ code: "DECISION_STALE" });
    expect(repo.createActionTaken).not.toHaveBeenCalled();
  });

  it("records the action and writes an audit entry", async () => {
    repo.findDecisionById.mockResolvedValue({ id: "dec_1", actionTaken: null });
    repo.createActionTaken.mockResolvedValue({
      id: "act_1",
      decisionId: "dec_1",
      actionType: "MESSAGE_COPIED",
      details: { channel: "LINKEDIN" },
      timestamp: new Date("2026-07-11T09:00:00Z"),
    });

    const result = await recordAction(
      "dec_1",
      { actionType: "MESSAGE_COPIED", details: { channel: "LINKEDIN" } },
      auth,
    );

    expect(repo.createActionTaken).toHaveBeenCalledWith({
      decisionId: "dec_1",
      actionType: "MESSAGE_COPIED",
      details: { channel: "LINKEDIN" },
    });
    expect(result).toEqual({
      id: "act_1",
      decisionId: "dec_1",
      actionType: "MESSAGE_COPIED",
      details: { channel: "LINKEDIN" },
      timestamp: "2026-07-11T09:00:00.000Z",
    });
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: "decision",
        entityId: "dec_1",
        action: "action_recorded",
        actorId: "user_1",
        afterState: { actionType: "MESSAGE_COPIED" },
      }),
    );
  });

  it("blocks MESSAGE_SENT/MESSAGE_COPIED when a BLOCK policy flag matched this decision (Policy v2.1 L4 Policy Engine)", async () => {
    repo.findDecisionById.mockResolvedValue({
      id: "dec_1",
      actionTaken: null,
      policyFlags: [{ field: "verdict", action: "BLOCK", message: "Do not contact HARD_PASS prospects" }],
    });

    await expect(recordAction("dec_1", { actionType: "MESSAGE_SENT" }, auth)).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
    expect(repo.createActionTaken).not.toHaveBeenCalled();
  });

  it("does not block non-message actions (e.g. SNOOZED) even when a BLOCK policy flag matched", async () => {
    repo.findDecisionById.mockResolvedValue({
      id: "dec_1",
      actionTaken: null,
      policyFlags: [{ field: "verdict", action: "BLOCK", message: "Do not contact" }],
    });
    repo.createActionTaken.mockResolvedValue({
      id: "act_1",
      decisionId: "dec_1",
      actionType: "SNOOZED",
      details: null,
      timestamp: new Date("2026-07-11T09:00:00Z"),
    });

    await expect(recordAction("dec_1", { actionType: "SNOOZED" }, auth)).resolves.toMatchObject({
      actionType: "SNOOZED",
    });
  });

  it("does not block a message action when only non-BLOCK flags (FLAG/REQUIRE_APPROVAL) matched", async () => {
    repo.findDecisionById.mockResolvedValue({
      id: "dec_1",
      actionTaken: null,
      policyFlags: [{ field: "confidence", action: "FLAG", message: "Low confidence" }],
    });
    repo.createActionTaken.mockResolvedValue({
      id: "act_1",
      decisionId: "dec_1",
      actionType: "MESSAGE_SENT",
      details: null,
      timestamp: new Date("2026-07-11T09:00:00Z"),
    });

    await expect(recordAction("dec_1", { actionType: "MESSAGE_SENT" }, auth)).resolves.toMatchObject({
      actionType: "MESSAGE_SENT",
    });
  });
});

describe("shareDecision", () => {
  it("throws FORBIDDEN for API-key auth with no userId", async () => {
    const apiKeyAuth: AuthContext = { type: "api_key", teamId: "team_1", planTier: "FREE", apiKeyId: "key_1" };
    await expect(shareDecision("dec_1", apiKeyAuth)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(postSlackMessage).not.toHaveBeenCalled();
  });

  it("throws NOT_FOUND when the decision doesn't exist for this team", async () => {
    repo.findDecisionById.mockResolvedValue(null);
    await expect(shareDecision("dec_missing", auth)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("throws a clear VALIDATION_ERROR when the team hasn't connected Slack", async () => {
    repo.findDecisionById.mockResolvedValue({
      id: "dec_1",
      verdict: "STRONG_YES",
      confidence: 94,
      reasoning: "Strong fit.",
      prospect: { name: "Sarah Chen", title: "VP Eng", companyName: "DataFlow" },
    });
    resolveSlackTeamByArgusTeamId.mockResolvedValue(null);

    await expect(shareDecision("dec_1", auth)).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(postSlackMessage).not.toHaveBeenCalled();
  });

  it("posts a summary to the team's alert channel and writes an audit entry", async () => {
    repo.findDecisionById.mockResolvedValue({
      id: "dec_1",
      verdict: "STRONG_YES",
      confidence: 94,
      reasoning: "Strong fit.",
      prospect: { name: "Sarah Chen", title: "VP Eng", companyName: "DataFlow" },
    });
    resolveSlackTeamByArgusTeamId.mockResolvedValue({
      argusTeamId: "team_1",
      apiKey: "key",
      botToken: "xoxb-real-token",
      botUserId: "U1",
      alertChannelId: "C123",
    });
    postSlackMessage.mockResolvedValue(undefined);

    const result = await shareDecision("dec_1", auth);

    expect(postSlackMessage).toHaveBeenCalledWith(
      "xoxb-real-token",
      "C123",
      expect.stringContaining("Sarah Chen"),
    );
    expect(result).toEqual({ shared: true, channelId: "C123" });
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: "decision", entityId: "dec_1", action: "shared", actorId: "user_1" }),
    );
  });

  it("wraps a real Slack posting failure (e.g. revoked token) as a typed, actionable error instead of an unhandled exception", async () => {
    repo.findDecisionById.mockResolvedValue({
      id: "dec_1",
      verdict: "STRONG_YES",
      confidence: 94,
      reasoning: "Strong fit.",
      prospect: { name: "Sarah Chen", title: "VP Eng", companyName: "DataFlow" },
    });
    resolveSlackTeamByArgusTeamId.mockResolvedValue({
      argusTeamId: "team_1",
      apiKey: "key",
      botToken: "xoxb-revoked-token",
      botUserId: "U1",
      alertChannelId: "C123",
    });
    postSlackMessage.mockRejectedValue(new Error("Slack chat.postMessage failed: token_revoked"));

    await expect(shareDecision("dec_1", auth)).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(recordAudit).not.toHaveBeenCalled();
  });
});

describe("editMessageDraft", () => {
  it("throws FORBIDDEN for API-key auth with no userId", async () => {
    const apiKeyAuth: AuthContext = { type: "api_key", teamId: "team_1", planTier: "FREE", apiKeyId: "key_1" };
    await expect(editMessageDraft("dec_1", { body: "New text" }, apiKeyAuth)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(repo.updateMessageDraft).not.toHaveBeenCalled();
  });

  it("throws NOT_FOUND when the decision doesn't exist for this team", async () => {
    repo.findDecisionById.mockResolvedValue(null);
    await expect(editMessageDraft("dec_missing", { body: "New text" }, auth)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("throws VALIDATION_ERROR when the decision has no message draft at all", async () => {
    repo.findDecisionById.mockResolvedValue({ id: "dec_1", messageDrafts: [] });
    await expect(editMessageDraft("dec_1", { body: "New text" }, auth)).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
    expect(repo.updateMessageDraft).not.toHaveBeenCalled();
  });

  it("captures the original body into editDiff on a first edit", async () => {
    repo.findDecisionById.mockResolvedValue({
      id: "dec_1",
      messageDrafts: [{ id: "draft_1", body: "Hi Sarah — original", wasEdited: false, editDiff: null }],
    });
    repo.updateMessageDraft.mockResolvedValue({
      id: "draft_1",
      body: "Hi Sarah — edited",
      wasEdited: true,
      editDiff: "Hi Sarah — original",
    });

    const result = await editMessageDraft("dec_1", { body: "Hi Sarah — edited" }, auth);

    expect(repo.updateMessageDraft).toHaveBeenCalledWith({
      draftId: "draft_1",
      body: "Hi Sarah — edited",
      editDiff: "Hi Sarah — original",
    });
    expect(result).toEqual({
      id: "draft_1",
      decisionId: "dec_1",
      body: "Hi Sarah — edited",
      wasEdited: true,
      editDiff: "Hi Sarah — original",
    });
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: "decision", entityId: "dec_1", action: "message_edited", actorId: "user_1" }),
    );
  });

  it("keeps editDiff pointing at the ORIGINAL text on a second edit, not the previous edit", async () => {
    repo.findDecisionById.mockResolvedValue({
      id: "dec_1",
      messageDrafts: [{ id: "draft_1", body: "Hi Sarah — first edit", wasEdited: true, editDiff: "Hi Sarah — original" }],
    });
    repo.updateMessageDraft.mockResolvedValue({
      id: "draft_1",
      body: "Hi Sarah — second edit",
      wasEdited: true,
      editDiff: "Hi Sarah — original",
    });

    await editMessageDraft("dec_1", { body: "Hi Sarah — second edit" }, auth);

    expect(repo.updateMessageDraft).toHaveBeenCalledWith({
      draftId: "draft_1",
      body: "Hi Sarah — second edit",
      editDiff: "Hi Sarah — original",
    });
  });
});
