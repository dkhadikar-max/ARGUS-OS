import { Router } from "express";
import {
  adminShadowMetricsQuerySchema,
  adminListShadowDecisionsQuerySchema,
  adminShadowDecisionParamsSchema,
  adminShadowHealthQuerySchema,
  adminShadowRolloutAuditQuerySchema,
  adminShadowRolloutPreviewQuerySchema,
  updateShadowRolloutConfigRequestSchema,
  upsertShadowRolloutTeamOverrideParamsSchema,
  upsertShadowRolloutTeamOverrideRequestSchema,
} from "@argus/shared";
import { requireAuth } from "../../middleware/auth.js";
import { requireAdmin } from "../../middleware/admin-auth.js";
import { validate } from "../../middleware/validate.js";
import {
  getShadowMetricsHandler,
  listShadowDecisionsHandler,
  getShadowDecisionDetailHandler,
  getShadowHealthHandler,
  getShadowLiveMetricsHandler,
  getShadowRolloutHandler,
  updateShadowRolloutConfigHandler,
  upsertShadowRolloutTeamOverrideHandler,
  deleteShadowRolloutTeamOverrideHandler,
  getShadowRolloutAuditHandler,
  previewShadowRolloutHandler,
} from "./admin.controller.js";

export const adminRouter = Router();

adminRouter.get(
  "/shadow-health",
  requireAuth,
  requireAdmin,
  validate(adminShadowHealthQuerySchema, "query"),
  getShadowHealthHandler,
);
// Gate 3 Increment 1.9 -- no validate() (no query params), and note this
// handler deliberately skips recordAudit (see its own doc comment) --
// it's the one endpoint in this router designed to be polled.
adminRouter.get("/shadow-live-metrics", requireAuth, requireAdmin, getShadowLiveMetricsHandler);
adminRouter.get("/shadow-rollout", requireAuth, requireAdmin, getShadowRolloutHandler);
adminRouter.put(
  "/shadow-rollout",
  requireAuth,
  requireAdmin,
  validate(updateShadowRolloutConfigRequestSchema),
  updateShadowRolloutConfigHandler,
);
adminRouter.get(
  "/shadow-rollout/audit",
  requireAuth,
  requireAdmin,
  validate(adminShadowRolloutAuditQuerySchema, "query"),
  getShadowRolloutAuditHandler,
);
adminRouter.get(
  "/shadow-rollout/preview",
  requireAuth,
  requireAdmin,
  validate(adminShadowRolloutPreviewQuerySchema, "query"),
  previewShadowRolloutHandler,
);
adminRouter.put(
  "/shadow-rollout/teams/:teamId",
  requireAuth,
  requireAdmin,
  validate(upsertShadowRolloutTeamOverrideParamsSchema, "params"),
  validate(upsertShadowRolloutTeamOverrideRequestSchema),
  upsertShadowRolloutTeamOverrideHandler,
);
adminRouter.delete(
  "/shadow-rollout/teams/:teamId",
  requireAuth,
  requireAdmin,
  validate(upsertShadowRolloutTeamOverrideParamsSchema, "params"),
  deleteShadowRolloutTeamOverrideHandler,
);
adminRouter.get(
  "/shadow-metrics",
  requireAuth,
  requireAdmin,
  validate(adminShadowMetricsQuerySchema, "query"),
  getShadowMetricsHandler,
);
adminRouter.get(
  "/shadow-decisions",
  requireAuth,
  requireAdmin,
  validate(adminListShadowDecisionsQuerySchema, "query"),
  listShadowDecisionsHandler,
);
adminRouter.get(
  "/shadow-decisions/:id",
  requireAuth,
  requireAdmin,
  validate(adminShadowDecisionParamsSchema, "params"),
  getShadowDecisionDetailHandler,
);
