import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import {
  approveComplexityWeightsHandler,
  getComplexityWeightStateHandler,
  recomputeComplexityWeightsHandler,
  rejectComplexityWeightsHandler,
} from "./complexity.controller.js";

export const complexityRouter = Router();

// v4 roadmap Phase 12 -- Decision Complexity weight versioning. Unlike
// routing.routes.ts's PUT /thresholds (an admin hand-typing arbitrary
// values), POST /weights/recompute is the only way a PENDING proposal is
// created here -- see complexity.service.ts's recomputeComplexityWeightsForTeam
// for why. approve/reject still require the same admin-gated resolution
// step before a version can go ACTIVE (Decision 3: never auto-applied).
complexityRouter.get("/weights", requireAuth, getComplexityWeightStateHandler);
complexityRouter.post("/weights/recompute", requireAuth, recomputeComplexityWeightsHandler);
complexityRouter.post("/weights/:version/approve", requireAuth, approveComplexityWeightsHandler);
complexityRouter.post("/weights/:version/reject", requireAuth, rejectComplexityWeightsHandler);
