import { z } from "zod";

// v4 roadmap Phase 8 (Learning Wiring) -- surfaces the Learning Agent's
// already-existing icp_recommendations/prompt_adjustments output (Bible
// §8.8, learningAgentOutputSchema in agents.ts) as individually actionable
// rows. ROUTING_THRESHOLD/RETRIEVER_WEIGHT exist for a future phase; the
// current Learning Agent has no output field for either, so nothing
// populates them yet -- see learning.service.ts's own comment.
export const learningRecommendationSubsystemSchema = z.enum([
  "ICP",
  "PROMPTS",
  "ROUTING_THRESHOLD",
  "RETRIEVER_WEIGHT",
  "POLICY",
]);
export type LearningRecommendationSubsystem = z.infer<typeof learningRecommendationSubsystemSchema>;

// Never auto-applied (Decision 3): this only tracks whether a human has
// reviewed/acted on the recommendation via its normal path (the existing
// ICP editor, prompts.ts, etc.) -- it never triggers a system change by
// itself.
export const learningRecommendationStatusSchema = z.enum(["PENDING", "ACTIONED", "DISMISSED"]);
export type LearningRecommendationStatus = z.infer<typeof learningRecommendationStatusSchema>;

export const learningRecommendationSchema = z.object({
  id: z.string(),
  targetSubsystem: learningRecommendationSubsystemSchema,
  rationale: z.string(),
  suggestedChange: z.unknown().nullable(),
  status: learningRecommendationStatusSchema,
  createdAt: z.string().datetime(),
  reviewedAt: z.string().datetime().nullable(),
  reviewedBy: z.string().nullable(),
});
export type LearningRecommendation = z.infer<typeof learningRecommendationSchema>;

export const listLearningRecommendationsResponseSchema = z.object({
  teamId: z.string(),
  recommendations: z.array(learningRecommendationSchema),
});
export type ListLearningRecommendationsResponse = z.infer<typeof listLearningRecommendationsResponseSchema>;

export const resolveLearningRecommendationRequestSchema = z.object({
  status: z.enum(["ACTIONED", "DISMISSED"]),
});
export type ResolveLearningRecommendationRequest = z.infer<typeof resolveLearningRecommendationRequestSchema>;
