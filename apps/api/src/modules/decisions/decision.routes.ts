import { Router } from "express";
import { createActionRequestSchema, createDecisionRequestSchema, overrideDecisionRequestSchema } from "@argus/shared";
import { requireAuth } from "../../middleware/auth.js";
import { rateLimit } from "../../middleware/rate-limit.js";
import { validate } from "../../middleware/validate.js";
import {
  createDecisionHandler,
  getDecisionHandler,
  overrideDecisionHandler,
  recordActionHandler,
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

// Bible §5.1/§5.2 Action Graph, §9.1 ActionTaken — not itself contracted by
// §10 (see decision.service.ts recordAction's comment), inferred from the
// sibling override endpoint directly above.
decisionRouter.post(
  "/:id/action",
  requireAuth,
  validate(createActionRequestSchema),
  recordActionHandler,
);
