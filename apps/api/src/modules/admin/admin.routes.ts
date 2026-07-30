import { Router } from "express";
import { adminShadowMetricsQuerySchema, adminListShadowDecisionsQuerySchema } from "@argus/shared";
import { requireAuth } from "../../middleware/auth.js";
import { requireAdmin } from "../../middleware/admin-auth.js";
import { validate } from "../../middleware/validate.js";
import { getShadowMetricsHandler, listShadowDecisionsHandler } from "./admin.controller.js";

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
