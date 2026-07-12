import { Router } from "express";
import { createActionRequestSchema, createDecisionRequestSchema, editMessageDraftRequestSchema, overrideDecisionRequestSchema } from "@argus/shared";
import { requireAuth } from "../../middleware/auth.js";
import { rateLimit } from "../../middleware/rate-limit.js";
import { validate } from "../../middleware/validate.js";
import {
  createDecisionHandler,
  editMessageDraftHandler,
  getDecisionHandler,
  overrideDecisionHandler,
  recordActionHandler,
  shareDecisionHandler,
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

// Bible §6.5 Full Debate View's "[Share with Team]" button — not itself
// contracted by §10 either (see decision.service.ts shareDecision's
// comment), inferred the same way the action endpoint above was.
decisionRouter.post("/:id/share", requireAuth, shareDecisionHandler);

// Bible §9.1 MessageDraft.wasEdited/editDiff — not contracted by §10 either
// (see decision.service.ts editMessageDraft's comment), inferred the same
// way as the action/share endpoints above.
decisionRouter.patch(
  "/:id/message",
  requireAuth,
  validate(editMessageDraftRequestSchema),
  editMessageDraftHandler,
);
