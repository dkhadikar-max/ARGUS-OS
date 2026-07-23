import { z } from "zod";

// v4 roadmap Phase 6 -- Routing Optimizer. Internal-only tier naming
// (Decision 5): the architecture doc's own "L0/L1/L2/L3" labels are never
// exposed here or anywhere in the API -- "single_pass"/"micro_debate"/
// "executive_debate" describe what actually happens (how many debate
// rounds a decision gets), not an internal tier number a rep or admin
// would have to learn.
export const executionStrategySchema = z.enum(["single_pass", "micro_debate", "executive_debate"]);
export type ExecutionStrategy = z.infer<typeof executionStrategySchema>;

// Same two thresholds Phase 3's ConflictSurpriseCalculator already uses
// internally (cv > 0.25, maxSurprise > 0.70) -- this phase makes those
// numbers a versioned, per-team-overridable value instead of a hardcoded
// constant, not a different metric.
export const routingThresholdsSchema = z.object({
  cvThreshold: z.number().min(0).max(1),
  maxSurpriseThreshold: z.number().min(0).max(1),
});
export type RoutingThresholds = z.infer<typeof routingThresholdsSchema>;

export const routingThresholdStatusSchema = z.enum(["ACTIVE", "PENDING", "REJECTED", "SUPERSEDED"]);
export type RoutingThresholdStatus = z.infer<typeof routingThresholdStatusSchema>;

export const routingThresholdVersionEntrySchema = z.object({
  version: z.number().int().positive(),
  thresholds: routingThresholdsSchema,
  status: routingThresholdStatusSchema,
  createdAt: z.string().datetime(),
  createdBy: z.string(),
  approvedAt: z.string().datetime().nullable(),
  approvedBy: z.string().nullable(),
});
export type RoutingThresholdVersionEntry = z.infer<typeof routingThresholdVersionEntrySchema>;

/** GET /api/v1/routing/thresholds response -- the currently-active
 *  thresholds plus one pending proposal (if any), so an admin can see both
 *  side by side before approving/rejecting. This is the "A/B support" the
 *  architecture doc calls for: a candidate configuration visible alongside
 *  the live one, not two configurations simultaneously routing real
 *  traffic (see routing-optimizer.service.ts's compareThresholdVersions
 *  for the actual side-by-side comparison logic). */
export const routingThresholdStateSchema = z.object({
  teamId: z.string(),
  active: routingThresholdVersionEntrySchema.nullable(),
  pending: routingThresholdVersionEntrySchema.nullable(),
});
export type RoutingThresholdState = z.infer<typeof routingThresholdStateSchema>;

export const proposeRoutingThresholdsRequestSchema = z.object({
  thresholds: routingThresholdsSchema,
});
export type ProposeRoutingThresholdsRequest = z.infer<typeof proposeRoutingThresholdsRequestSchema>;
