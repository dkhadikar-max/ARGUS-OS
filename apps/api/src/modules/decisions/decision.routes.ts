import { Router } from "express";
import { createDecisionRequestSchema, overrideDecisionRequestSchema } from "@argus/shared";
import { requireAuth } from "../../middleware/auth.js";
import { rateLimit } from "../../middleware/rate-limit.js";
import { validate } from "../../middleware/validate.js";
import {
  createDecisionHandler,
  getDecisionHandler,
  overrideDecisionHandler,
} from "./decision.controller.js";

export const decisionRouter = Router();

// Bible §10.2
decisionRouter.post(
  "/",
  requireAuth,
  rateLimit("decisions"),
  validate(createDecisionRequestSchema),
  createDecisionHandler,
);

decisionRouter.get("/:id", requireAuth, getDecisionHandler);

decisionRouter.post(
  "/:id/override",
  requireAuth,
  validate(overrideDecisionRequestSchema),
  overrideDecisionHandler,
);
