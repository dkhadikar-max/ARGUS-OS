import { Router } from "express";
import { proposeRoutingThresholdsRequestSchema } from "@argus/shared";
import { requireAuth } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import {
  approveRoutingThresholdsHandler,
  getRoutingThresholdStateHandler,
  proposeRoutingThresholdsHandler,
  rejectRoutingThresholdsHandler,
} from "./routing.controller.js";

export const routingRouter = Router();

// v4 roadmap Phase 6 -- Routing Optimizer thresholds. Same shape as
// policy.routes.ts's versioning endpoints: propose creates a PENDING
// version, approve/reject resolve it -- there is no endpoint that lets a
// threshold change take effect without going through this admin-gated
// approve step (Decision 3: never auto-applied).
routingRouter.get("/thresholds", requireAuth, getRoutingThresholdStateHandler);
routingRouter.put(
  "/thresholds",
  requireAuth,
  validate(proposeRoutingThresholdsRequestSchema),
  proposeRoutingThresholdsHandler,
);
routingRouter.post("/thresholds/:version/approve", requireAuth, approveRoutingThresholdsHandler);
routingRouter.post("/thresholds/:version/reject", requireAuth, rejectRoutingThresholdsHandler);
