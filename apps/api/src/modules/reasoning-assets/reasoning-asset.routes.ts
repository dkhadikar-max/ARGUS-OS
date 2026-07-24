import { Router } from "express";
import { recordEffectivenessRequestSchema, registerReasoningAssetRequestSchema } from "@argus/shared";
import { requireAuth } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import {
  listReasoningAssetsHandler,
  recordEffectivenessHandler,
  registerReasoningAssetHandler,
} from "./reasoning-asset.controller.js";

export const reasoningAssetRouter = Router();

// v4 roadmap Phase 13 -- Reasoning Asset metadata wrapper. PUT upserts by
// (assetType, assetKey) scoped to the caller's team; there is no DELETE
// (no established need yet, same restraint every other module in this
// schema applies). POST .../effectiveness is the only way
// effectivenessScore ever changes -- see reasoning-asset.service.ts.
reasoningAssetRouter.get("/", requireAuth, listReasoningAssetsHandler);
reasoningAssetRouter.put("/", requireAuth, validate(registerReasoningAssetRequestSchema), registerReasoningAssetHandler);
reasoningAssetRouter.post(
  "/:id/effectiveness",
  requireAuth,
  validate(recordEffectivenessRequestSchema),
  recordEffectivenessHandler,
);
