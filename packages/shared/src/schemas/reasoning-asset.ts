import { z } from "zod";

// v4 roadmap Phase 13 (docs/ARCHITECTURE_V4.md, "Reasoning Asset") -- see
// schema.prisma's ReasoningAsset model comment for the full design
// rationale (metadata wrapper, not a shared base table; assetKey is a real
// row id for DB-backed types or a stable code-level name for the 3 types
// that are still pure code today).
export const reasoningAssetTypeSchema = z.enum(["POLICY", "EVIDENCE", "THRESHOLD", "PROMPT", "RETRIEVER", "STRATEGY", "PATTERN"]);
export type ReasoningAssetType = z.infer<typeof reasoningAssetTypeSchema>;

export const reasoningAssetSchema = z.object({
  id: z.string(),
  assetType: reasoningAssetTypeSchema,
  assetKey: z.string(),
  label: z.string(),
  teamId: z.string().nullable(),
  ownerId: z.string().nullable(),
  effectivenessScore: z.number().nullable(),
  lastEvaluatedAt: z.string().datetime().nullable(),
  approvedAt: z.string().datetime().nullable(),
  approvedBy: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type ReasoningAsset = z.infer<typeof reasoningAssetSchema>;

/** PUT /api/v1/reasoning-assets -- registers a new asset or updates the
 *  label/owner of an existing one (upsert keyed on assetType+assetKey,
 *  scoped to the caller's team). Does not touch effectivenessScore --
 *  that's recordEffectivenessRequestSchema's job, kept separate so a
 *  routine label edit can't accidentally reset an evaluation. */
export const registerReasoningAssetRequestSchema = z.object({
  assetType: reasoningAssetTypeSchema,
  assetKey: z.string().min(1),
  label: z.string().min(1),
  ownerId: z.string().nullable().optional(),
});
export type RegisterReasoningAssetRequest = z.infer<typeof registerReasoningAssetRequestSchema>;

/** POST /api/v1/reasoning-assets/:id/effectiveness -- records a real
 *  evaluation. There is no automatic scoring here: the caller (an admin
 *  today; a future subsystem's own effectiveness computation later)
 *  supplies the number. */
export const recordEffectivenessRequestSchema = z.object({
  score: z.number(),
});
export type RecordEffectivenessRequest = z.infer<typeof recordEffectivenessRequestSchema>;
