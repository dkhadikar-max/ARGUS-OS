import { z } from "zod";
import { outcomeTypeSchema, verdictSchema } from "./enums.js";

// Bible §10.3 — POST /api/v1/outcomes request body
export const createOutcomeRequestSchema = z.object({
  decisionId: z.string(),
  type: outcomeTypeSchema,
  value: z.number().nullable().optional(),
  timeToOutcomeDays: z.number().int().nonnegative().nullable().optional(),
  feedback: z.string().nullable().optional(),
});
export type CreateOutcomeRequest = z.infer<typeof createOutcomeRequestSchema>;

export const createOutcomeResponseSchema = z.object({
  id: z.string(),
  decisionId: z.string(),
  type: outcomeTypeSchema,
  value: z.number().nullable(),
  timeToOutcomeDays: z.number().int().nullable(),
  feedback: z.string().nullable(),
  loggedAt: z.string().datetime(),
  learningApplied: z.boolean(),
  patternUpdated: z.string().nullable(),
});
export type CreateOutcomeResponse = z.infer<typeof createOutcomeResponseSchema>;

// Bible §10.3 — GET /api/v1/outcomes query parameters
export const listOutcomesQuerySchema = z.object({
  userId: z.string().optional(),
  teamId: z.string(),
  type: outcomeTypeSchema.optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  verdict: verdictSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});
export type ListOutcomesQuery = z.infer<typeof listOutcomesQuerySchema>;

const verdictAggregationSchema = z.object({
  count: z.number().int().nonnegative(),
  meetingRate: z.number().min(0).max(1),
  avgTimeToMeeting: z.number().nullable(),
});

// Bible §4.4 Manager Morgan persona: "Decision accuracy score per rep" /
// "Filter by rep, see decision history" -- one row per team member who has
// generated at least one decision, using the exact same weighted
// STRONG_YES/YES meeting-rate proxy as the team-wide `accuracy.score` below,
// just scoped to that rep's own decisions.
const repAccuracySchema = z.object({
  userId: z.string(),
  name: z.string(),
  totalDecisions: z.number().int().nonnegative(),
  score: z.number().min(0).max(1).nullable(),
});

export const listOutcomesResponseSchema = z.object({
  data: z.array(
    z.object({
      id: z.string(),
      decisionId: z.string(),
      type: outcomeTypeSchema,
      verdict: verdictSchema,
      confidence: z.number().min(0).max(100),
      prospectName: z.string(),
      prospectTitle: z.string().nullable(),
      companyName: z.string().nullable(),
      timeToOutcomeDays: z.number().int().nullable(),
      loggedAt: z.string().datetime(),
    }),
  ),
  pagination: z.object({
    total: z.number().int().nonnegative(),
    limit: z.number().int(),
    offset: z.number().int(),
    hasMore: z.boolean(),
  }),
  aggregations: z.object({
    byVerdict: z.record(verdictSchema, verdictAggregationSchema.optional()),
  }),
  // Not itself part of §10.3's documented response (verified against the
  // Bible's own worked example) -- an additive field for §18 DSH-3's
  // "Accuracy score display". `mode` reuses Appendix F's own "learning/
  // calibrating/mature" tiers by team decision count; `score` is the
  // weighted meeting-rate across STRONG_YES/YES outcomes (a "the AI said
  // yes, did it convert" proxy), null when there isn't at least one such
  // outcome logged yet -- an honest "not enough data" rather than a
  // fabricated number.
  accuracy: z.object({
    totalDecisions: z.number().int().nonnegative(),
    mode: z.enum(["learning", "calibrating", "mature"]),
    score: z.number().min(0).max(1).nullable(),
    byRep: z.array(repAccuracySchema),
  }),
});
export type ListOutcomesResponse = z.infer<typeof listOutcomesResponseSchema>;
