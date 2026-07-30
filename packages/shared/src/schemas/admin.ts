import { z } from "zod";
import { verdictSchema } from "./enums.js";

// Admin API Increment A -- Argus-internal, cross-tenant Shadow Mode
// monitoring (see apps/api/src/modules/admin/). teamId is optional on
// every query here: omitted means "aggregate/list across ALL teams",
// which is the whole point of this surface -- every other query schema
// in this codebase (see outcome.ts's listOutcomesQuerySchema) requires
// teamId because it's scoped to the caller's own team.

const disagreementCategorySchema = z.enum([
  "verdict_mismatch",
  "confidence_threshold_exceeded",
  "controller_action_mismatch",
  "runtime_error",
  "schema_error",
  "missing_capability_output",
]);

// GET /api/v1/admin/shadow-metrics
export const adminShadowMetricsQuerySchema = z.object({
  teamId: z.string().optional(),
  sinceDays: z.coerce.number().int().min(1).max(90).default(7),
});
export type AdminShadowMetricsQuery = z.infer<typeof adminShadowMetricsQuerySchema>;

const disagreementBreakdownEntrySchema = z.object({
  category: disagreementCategorySchema,
  count: z.number().int().nonnegative(),
});

export const adminShadowMetricsResponseSchema = z.object({
  scope: z.object({
    teamId: z.string().nullable(), // null = all teams
    sinceDays: z.number().int(),
  }),
  totalShadowDecisions: z.number().int().nonnegative(),
  verdictAgreementRate: z.number().min(0).max(1),
  avgConfidenceDelta: z.number(),
  p50ConfidenceDelta: z.number(),
  avgCostUsd: z.number().nonnegative(),
  totalCostUsd: z.number().nonnegative(),
  disagreementBreakdown: z.array(disagreementBreakdownEntrySchema),
  volumeByDay: z.array(z.object({ day: z.string(), count: z.number().int().nonnegative() })),
});
export type AdminShadowMetricsResponse = z.infer<typeof adminShadowMetricsResponseSchema>;

// GET /api/v1/admin/shadow-decisions
export const adminListShadowDecisionsQuerySchema = z.object({
  teamId: z.string().optional(),
  verdict: verdictSchema.optional(),
  verdictAgreement: z.coerce.boolean().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});
export type AdminListShadowDecisionsQuery = z.infer<typeof adminListShadowDecisionsQuerySchema>;

export const adminListShadowDecisionsResponseSchema = z.object({
  data: z.array(
    z.object({
      id: z.string(),
      teamId: z.string(),
      teamName: z.string(),
      decisionId: z.string(),
      prospectId: z.string(),
      shadowVerdict: verdictSchema,
      shadowConfidence: z.number().int(),
      shadowReasoning: z.string(),
      liveDecision: z.object({
        verdict: verdictSchema,
        confidence: z.number().int(),
        reasoning: z.string(),
        recommendedAction: z.string().nullable(),
        createdAt: z.string().datetime(),
      }),
      verdictAgreement: z.boolean(),
      confidenceDelta: z.number().int(),
      disagreementCategories: z.array(disagreementCategorySchema),
      inferenceCostUsd: z.number(),
      processingTimeMs: z.number().int(),
      createdAt: z.string().datetime(),
    }),
  ),
  pagination: z.object({
    total: z.number().int().nonnegative(),
    limit: z.number().int(),
    offset: z.number().int(),
    hasMore: z.boolean(),
  }),
});
export type AdminListShadowDecisionsResponse = z.infer<typeof adminListShadowDecisionsResponseSchema>;

// GET /api/v1/admin/shadow-decisions/:id -- single-row detail, loaded on
// demand by Decision Explorer. Unlike the list endpoint, this DOES include
// the full agentOutputs/executionTrace JSON on both sides -- the whole
// reason this is a separate endpoint rather than expanding the list's
// select is so that cost only applies to the one row someone actually
// opened, not every row in a page.
export const adminShadowDecisionParamsSchema = z.object({
  id: z.string(),
});
export type AdminShadowDecisionParams = z.infer<typeof adminShadowDecisionParamsSchema>;

export const adminShadowDecisionDetailResponseSchema = z.object({
  id: z.string(),
  teamId: z.string(),
  teamName: z.string(),
  prospectId: z.string(),
  decisionId: z.string(),
  executionId: z.string(),
  packId: z.string(),
  model: z.string(),
  liveDecision: z.object({
    verdict: verdictSchema,
    confidence: z.number().int(),
    weightedScore: z.number().nullable(),
    reasoning: z.string(),
    recommendedAction: z.string().nullable(),
    agentConsensus: z.string().nullable(),
    agentOutputs: z.unknown().nullable(),
    processingTimeMs: z.number().int().nullable(),
    inputTokens: z.number().int().nullable(),
    outputTokens: z.number().int().nullable(),
    inferenceCostUsd: z.number().nullable(),
    createdAt: z.string().datetime(),
  }),
  shadowDecision: z.object({
    verdict: verdictSchema,
    confidence: z.number().int(),
    weightedScore: z.number().nullable(),
    reasoning: z.string(),
    recommendedAction: z.string().nullable(),
    agentConsensus: z.string().nullable(),
    agentOutputs: z.unknown(),
    executionTrace: z.unknown(),
    controllerAction: z.string(),
    controllerTargetCapability: z.string().nullable(),
    controllerReasons: z.array(z.string()),
    processingTimeMs: z.number().int(),
    inputTokens: z.number().int(),
    outputTokens: z.number().int(),
    inferenceCostUsd: z.number(),
    createdAt: z.string().datetime(),
  }),
  comparison: z.object({
    verdictAgreement: z.boolean(),
    confidenceDelta: z.number().int(),
    controllerComparisonApplicable: z.boolean(),
    disagreementCategories: z.array(disagreementCategorySchema),
  }),
});
export type AdminShadowDecisionDetailResponse = z.infer<typeof adminShadowDecisionDetailResponseSchema>;
