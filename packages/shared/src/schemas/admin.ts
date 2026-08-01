import { z } from "zod";
import { verdictSchema } from "./enums.js";
import { evidenceCardSchema } from "./decision.js";

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
    evidence: z.array(evidenceCardSchema),
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

// GET /api/v1/admin/shadow-health -- Gate 3 Increment 1.7. circuitBreakerState
// and recentErrorCount1h are per-process, in-memory snapshots (the live
// apps/api instance's own CircuitBreakerProvider state and error ring
// buffer) -- reflects whichever instance served this request, not a
// cross-instance global view. Stated on the dashboard card itself, not
// just here.
export const adminShadowHealthQuerySchema = z.object({
  teamId: z.string().optional(),
});
export type AdminShadowHealthQuery = z.infer<typeof adminShadowHealthQuerySchema>;

export const adminShadowHealthResponseSchema = z.object({
  scope: z.object({
    teamId: z.string().nullable(),
  }),
  enabled: z.boolean(),
  // Gate 3 Increment 1.8 revision -- always the GLOBAL rollout percent,
  // never a resolved per-team effective percent. This card represents
  // cross-tenant system health; showing an "effective" percent derived
  // from whichever team happens to have an override is ambiguous on a
  // global view. activeOverrideCount is the honest way to surface "there
  // are exceptions to the global rule" without picking one team's number
  // to represent the whole system.
  globalPercent: z.number().int().min(0).max(100),
  activeOverrideCount: z.number().int().nonnegative(),
  circuitBreakerState: z.enum(["closed", "open", "half_open"]),
  lastDecisionAt: z.string().datetime().nullable(),
  verdictAgreementRate24h: z.number().min(0).max(1),
  totalShadowDecisions24h: z.number().int().nonnegative(),
  recentErrorCount1h: z.number().int().nonnegative(),
});
export type AdminShadowHealthResponse = z.infer<typeof adminShadowHealthResponseSchema>;

// Gate 3 Increment 1.8 -- Shadow Rollout Controller. env.SHADOW_MODE_ENABLED
// remains the hard, deploy-time kill switch (unaffected by any of this);
// `enabled` here is the DB-backed, dashboard-editable soft switch on top
// of it. A team override's percent of 0/100 IS the deny/allow list --
// deliberately no separate boolean list.

const shadowRolloutTeamOverrideSchema = z.object({
  teamId: z.string(),
  teamName: z.string(),
  percent: z.number().int().min(0).max(100),
  version: z.number().int(),
  reason: z.string().nullable(),
  expiresAt: z.string().datetime().nullable(),
  updatedAt: z.string().datetime(),
  updatedBy: z.string(),
});

// GET /api/v1/admin/shadow-rollout
export const adminShadowRolloutResponseSchema = z.object({
  enabled: z.boolean(),
  globalPercent: z.number().int().min(0).max(100),
  version: z.number().int(),
  teamOverrides: z.array(shadowRolloutTeamOverrideSchema),
});
export type AdminShadowRolloutResponse = z.infer<typeof adminShadowRolloutResponseSchema>;

// PUT /api/v1/admin/shadow-rollout
export const updateShadowRolloutConfigRequestSchema = z.object({
  enabled: z.boolean(),
  globalPercent: z.number().int().min(0).max(100),
});
export type UpdateShadowRolloutConfigRequest = z.infer<typeof updateShadowRolloutConfigRequestSchema>;

// PUT/DELETE /api/v1/admin/shadow-rollout/teams/:teamId
export const upsertShadowRolloutTeamOverrideParamsSchema = z.object({
  teamId: z.string(),
});
export type UpsertShadowRolloutTeamOverrideParams = z.infer<typeof upsertShadowRolloutTeamOverrideParamsSchema>;

export const upsertShadowRolloutTeamOverrideRequestSchema = z.object({
  percent: z.number().int().min(0).max(100),
  reason: z.string().optional(),
  expiresAt: z.string().datetime().optional(),
});
export type UpsertShadowRolloutTeamOverrideRequest = z.infer<typeof upsertShadowRolloutTeamOverrideRequestSchema>;

// GET /api/v1/admin/shadow-rollout/audit -- plain keyset pagination
// (limit + before), not an opaque cursor token, matching the from/to
// datetime-string convention adminListShadowDecisionsQuerySchema already
// established.
export const adminShadowRolloutAuditQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  before: z.string().datetime().optional(),
});
export type AdminShadowRolloutAuditQuery = z.infer<typeof adminShadowRolloutAuditQuerySchema>;

export const adminShadowRolloutAuditResponseSchema = z.object({
  entries: z.array(
    z.object({
      id: z.string(),
      entityType: z.string(),
      entityId: z.string(),
      action: z.string(),
      actorId: z.string(),
      beforeState: z.unknown().nullable(),
      afterState: z.unknown().nullable(),
      createdAt: z.string().datetime(),
    }),
  ),
  nextBefore: z.string().datetime().nullable(),
});
export type AdminShadowRolloutAuditResponse = z.infer<typeof adminShadowRolloutAuditResponseSchema>;

// GET /api/v1/admin/shadow-rollout/preview -- Dry Run Preview. Built on
// the exact same resolution function (shadow-rollout.service.ts's
// previewShadowSampling) the live path uses, so this can never disagree
// with real behavior.
export const adminShadowRolloutPreviewQuerySchema = z.object({
  prospectId: z.string(),
  teamId: z.string(),
});
export type AdminShadowRolloutPreviewQuery = z.infer<typeof adminShadowRolloutPreviewQuerySchema>;

export const adminShadowRolloutPreviewResponseSchema = z.object({
  enabled: z.boolean(),
  globalPercent: z.number().int().min(0).max(100),
  override: z
    .object({
      teamId: z.string(),
      percent: z.number().int().min(0).max(100),
      reason: z.string().nullable(),
      expiresAt: z.string().datetime().nullable(),
    })
    .nullable(),
  effectivePercent: z.number().int().min(0).max(100),
  bucket: z.number().int().min(0).max(99),
  sampled: z.boolean(),
});
export type AdminShadowRolloutPreviewResponse = z.infer<typeof adminShadowRolloutPreviewResponseSchema>;
