import { Router } from "express";
import { resolveLearningRecommendationRequestSchema } from "@argus/shared";
import { requireAuth } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import {
  listLearningRecommendationsHandler,
  resolveLearningRecommendationHandler,
} from "./learning-recommendation.controller.js";

export const learningRecommendationRouter = Router();

// v4 roadmap Phase 8 -- read/resolve only. Nothing here creates a
// recommendation via the API; that only happens from inside
// learning.service.ts's runLearningAgent, alongside its existing,
// unchanged CompanyMemory.learningInsights write.
learningRecommendationRouter.get("/", requireAuth, listLearningRecommendationsHandler);
learningRecommendationRouter.post(
  "/:id/resolve",
  requireAuth,
  validate(resolveLearningRecommendationRequestSchema),
  resolveLearningRecommendationHandler,
);
