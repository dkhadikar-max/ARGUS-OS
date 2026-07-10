import { Router } from "express";
import { createOutcomeRequestSchema, listOutcomesQuerySchema } from "@argus/shared";
import { requireAuth } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import { createOutcomeHandler, listOutcomesHandler } from "./outcome.controller.js";

export const outcomeRouter = Router();

// Bible §10.3
outcomeRouter.post("/", requireAuth, validate(createOutcomeRequestSchema), createOutcomeHandler);
outcomeRouter.get("/", requireAuth, validate(listOutcomesQuerySchema, "query"), listOutcomesHandler);
