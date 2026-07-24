import { z } from "zod";
import { routingThresholdStatusSchema } from "./routing.js";

// v4 roadmap Phase 12 (docs/ARCHITECTURE_V4.md, "Decision Complexity
// Engine") -- versions the weights the 3 already-computed conflict features
// (cv, directional, maxSurprise -- see conflict-detector.ts/
// conflict-surprise.ts) are combined with into a single complexity score.
//
// Reuses routingThresholdStatusSchema (ACTIVE/PENDING/REJECTED/SUPERSEDED)
// rather than declaring an identical enum a second time -- same
// versioned-config-with-approval lifecycle as RoutingThresholdVersion, a
// different table.
export const decisionComplexityWeightsSchema = z
  .object({
    cv: z.number().min(0).max(1),
    directional: z.number().min(0).max(1),
    maxSurprise: z.number().min(0).max(1),
  })
  .refine((w) => Math.abs(w.cv + w.directional + w.maxSurprise - 1) < 0.001, {
    message: "weights must sum to 1",
  });
export type DecisionComplexityWeights = z.infer<typeof decisionComplexityWeightsSchema>;

export const decisionComplexityWeightVersionEntrySchema = z.object({
  version: z.number().int().positive(),
  weights: decisionComplexityWeightsSchema,
  sampleSize: z.number().int().nonnegative(),
  status: routingThresholdStatusSchema,
  createdAt: z.string().datetime(),
  createdBy: z.string(),
  approvedAt: z.string().datetime().nullable(),
  approvedBy: z.string().nullable(),
});
export type DecisionComplexityWeightVersionEntry = z.infer<typeof decisionComplexityWeightVersionEntrySchema>;

/** GET /api/v1/complexity/weights response -- same "A/B support" shape as
 *  RoutingThresholdState: the currently-active weights plus one pending
 *  proposal (if a recompute has run and not yet been resolved). */
export const decisionComplexityWeightStateSchema = z.object({
  teamId: z.string(),
  active: decisionComplexityWeightVersionEntrySchema.nullable(),
  pending: decisionComplexityWeightVersionEntrySchema.nullable(),
});
export type DecisionComplexityWeightState = z.infer<typeof decisionComplexityWeightStateSchema>;

/** POST /api/v1/complexity/weights/recompute response. There is no
 *  "propose arbitrary weights" request schema (contrast with
 *  ProposeRoutingThresholdsRequest) -- weights are only ever produced by
 *  the recompute algorithm from real labeled decision/outcome history, per
 *  the architecture freeze's own Decision 2 ("bootstrapping defaults, not
 *  permanent architecture... a versioned, learnable weighted model", not an
 *  admin hand-typing numbers). If there isn't enough real data yet, the
 *  response says so explicitly rather than a proposal being silently
 *  skipped or a meaningless one being created. */
export const recomputeDecisionComplexityWeightsResponseSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("proposed"),
    entry: decisionComplexityWeightVersionEntrySchema,
  }),
  z.object({
    status: z.literal("insufficient_data"),
    reason: z.enum(["not_enough_labeled_decisions", "no_separating_signal"]),
    labeledDecisionCount: z.number().int().nonnegative(),
    correctCount: z.number().int().nonnegative(),
    wrongCount: z.number().int().nonnegative(),
  }),
]);
export type RecomputeDecisionComplexityWeightsResponse = z.infer<
  typeof recomputeDecisionComplexityWeightsResponseSchema
>;
