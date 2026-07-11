import { Router } from "express";
import { updateUserPreferencesRequestSchema } from "@argus/shared";
import { requireAuth } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import { getPreferencesHandler, updatePreferencesHandler } from "./preferences.controller.js";

export const preferencesRouter = Router();

// Bible §9.1 UserPreferences, §18 DSH-5 "User preferences form" -- §10 never
// contracts a REST endpoint for this model (see preferences.ts).
preferencesRouter.get("/", requireAuth, getPreferencesHandler);
preferencesRouter.put(
  "/",
  requireAuth,
  validate(updateUserPreferencesRequestSchema),
  updatePreferencesHandler,
);
