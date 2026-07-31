import { Router } from "express";
import { adminShadowMetricsQuerySchema, adminListShadowDecisionsQuerySchema, adminShadowDecisionParamsSchema, adminShadowHealthQuerySchema } from "@argus/shared";
import { requireAuth } from "../../middleware/auth.js";
import { requireAdmin } from "../../middleware/admin-auth.js";
import { validate } from "../../middleware/validate.js";
import { getShadowMetricsHandler, listShadowDecisionsHandler, getShadowDecisionDetailHandler, getShadowHealthHandler } from "./admin.controller.js";

export const adminRouter = Router();

adminRouter.get(
  "/shadow-health",
  requireAuth,
  requireAdmin,
  validate(adminShadowHealthQuerySchema, "query"),
  getShadowHealthHandler,
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
