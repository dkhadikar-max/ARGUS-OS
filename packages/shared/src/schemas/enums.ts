import { z } from "zod";

// Bible §5.2, §9.1 Verdict enum — maps 1:1 to a weighted score band (§8.7):
// 90-100 STRONG_YES · 70-89 YES · 50-69 WAIT · 30-49 PASS · 0-29 HARD_PASS
export const verdictSchema = z.enum([
  "STRONG_YES",
  "YES",
  "WAIT",
  "PASS",
  "HARD_PASS",
]);
export type Verdict = z.infer<typeof verdictSchema>;

export const channelSchema = z.enum(["LINKEDIN", "EMAIL", "SLACK", "OTHER"]);
export type Channel = z.infer<typeof channelSchema>;

export const messageToneSchema = z.enum([
  "professional",
  "casual",
  "bold",
  "friendly",
]);
export type MessageTone = z.infer<typeof messageToneSchema>;

export const evidenceTypeSchema = z.enum([
  "FIRMOGRAPHIC",
  "DEMOGRAPHIC",
  "TECHNOGRAPHIC",
  "INTENT",
  "MARKET",
  "HISTORICAL",
  "DERIVED",
]);
export type EvidenceType = z.infer<typeof evidenceTypeSchema>;

export const evidenceSourceSchema = z.enum([
  "LINKEDIN",
  "APOLLO",
  "CLEARBIT",
  "CRM",
  "MANUAL",
  "INFERRED",
  "USER_INPUT",
]);
export type EvidenceSource = z.infer<typeof evidenceSourceSchema>;

// Bible §9.1 OutcomeType
export const outcomeTypeSchema = z.enum([
  "NO_RESPONSE",
  "REPLIED_NO_MEETING",
  "MEETING_BOOKED",
  "OPPORTUNITY_CREATED",
  "CLOSED_WON",
  "CLOSED_LOST",
  "DISQUALIFIED",
  "SNOOZED",
]);
export type OutcomeType = z.infer<typeof outcomeTypeSchema>;

// Bible §9.1 ActionType — the Action Graph's record of what the rep
// actually did in response to a verdict (§5.1/§5.2), distinct from Outcome
// (what resulted from it) and Override (a changed verdict).
export const actionTypeSchema = z.enum([
  "MESSAGE_SENT",
  "MESSAGE_COPIED",
  "CRM_UPDATED",
  "MEETING_BOOKED",
  "PASSED",
  "SNOOZED",
  "RESEARCHED_MORE",
]);
export type ActionType = z.infer<typeof actionTypeSchema>;

// Bible §10.7 Error Codes
export const errorCodeSchema = z.enum([
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "VALIDATION_ERROR",
  "RATE_LIMITED",
  "AI_UNAVAILABLE",
  "ENRICHMENT_FAILED",
  "DECISION_STALE",
  "TEAM_LIMIT_REACHED",
]);
export type ErrorCode = z.infer<typeof errorCodeSchema>;

export const ERROR_CODE_HTTP_STATUS: Record<ErrorCode, number> = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION_ERROR: 422,
  RATE_LIMITED: 429,
  AI_UNAVAILABLE: 503,
  ENRICHMENT_FAILED: 502,
  DECISION_STALE: 409,
  TEAM_LIMIT_REACHED: 403,
};

// Bible §8.7 verdict-to-weighted-score mapping — used by the Judge agent
// output validator and by the cold-start heuristic (Bible Appendix F).
export function scoreToVerdict(weightedScore: number): Verdict {
  if (weightedScore >= 90) return "STRONG_YES";
  if (weightedScore >= 70) return "YES";
  if (weightedScore >= 50) return "WAIT";
  if (weightedScore >= 30) return "PASS";
  return "HARD_PASS";
}
