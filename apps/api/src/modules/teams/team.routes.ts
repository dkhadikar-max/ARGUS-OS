import { Router } from "express";
import { completeOnboardingRequestSchema } from "@argus/shared";
import { requireAuth } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import { completeOnboardingHandler, getTeamHandler } from "./team.controller.js";

export const teamRouter = Router();

// Bible §9.1 Team model, §5.2 object model -- §10 never contracts a REST
// endpoint for Team (same gap as ICPDefinition/UserPreferences).
teamRouter.get("/me", requireAuth, getTeamHandler);
teamRouter.post(
  "/me/onboarding",
  requireAuth,
  validate(completeOnboardingRequestSchema),
  completeOnboardingHandler,
);
