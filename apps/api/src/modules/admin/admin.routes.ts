import { Router } from "express";
import { adminShadowMetricsQuerySchema, adminListShadowDecisionsQuerySchema, adminShadowDecisionParamsSchema } from "@argus/shared";
import { requireAuth } from "../../middleware/auth.js";
import { requireAdmin } from "../../middleware/admin-auth.js";
import { validate } from "../../middleware/validate.js";
import { getShadowMetricsHandler, listShadowDecisionsHandler, getShadowDecisionDetailHandler } from "./admin.controller.js";

export const adminRouter = Router();

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
