import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import { createOutcomeRequestSchema, listOutcomesQuerySchema } from "@argus/shared";
import { requireAuth } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import { createOutcomeHandler, listOutcomesHandler } from "./outcome.controller.js";

export const outcomeRouter = Router();

// Bible §10.3 documents `teamId` as always required in the query string ("—
// Filter by team (required for non-admin)"), but every JWT-authenticated
// caller already has a resolved teamId from their own token — the
// dashboard's Analytics page (§18 DSH-3) has no other way to learn its own
// teamId before making this call. Defaulting it here (only when the caller
// omitted it) doesn't loosen the contract: an explicit teamId is still
// honored and still checked against req.auth.teamId in the controller.
function defaultTeamIdFromAuth(req: Request, _res: Response, next: NextFunction) {
  if (!req.query["teamId"] && req.auth) {
    req.query["teamId"] = req.auth.teamId;
  }
  next();
}

// Bible §10.3
outcomeRouter.post("/", requireAuth, validate(createOutcomeRequestSchema), createOutcomeHandler);
outcomeRouter.get(
  "/",
  requireAuth,
  defaultTeamIdFromAuth,
  validate(listOutcomesQuerySchema, "query"),
  listOutcomesHandler,
);
