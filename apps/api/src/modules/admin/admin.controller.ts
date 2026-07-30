import type { Request, Response, NextFunction } from "express";
import { AppError, type AdminListShadowDecisionsQuery, type AdminShadowMetricsQuery } from "@argus/shared";
import * as adminService from "./admin.service.js";
import { recordAudit, requestMeta } from "../../lib/audit.js";

export async function getShadowMetricsHandler(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.auth?.userId) throw new AppError("UNAUTHORIZED", "Authentication required");
    const query = req.query as unknown as AdminShadowMetricsQuery;

    const result = await adminService.getShadowMetrics(query);

    await recordAudit({
      entityType: "admin_shadow_metrics",
      entityId: query.teamId ?? "all-teams",
      action: "viewed",
      actorId: req.auth.userId,
      afterState: { teamId: query.teamId ?? null, sinceDays: query.sinceDays },
      meta: requestMeta(req),
    });

    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

export async function listShadowDecisionsHandler(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.auth?.userId) throw new AppError("UNAUTHORIZED", "Authentication required");
    const query = req.query as unknown as AdminListShadowDecisionsQuery;

    const result = await adminService.listShadowDecisions(query);

    await recordAudit({
      entityType: "admin_shadow_decisions",
      entityId: query.teamId ?? "all-teams",
      action: "viewed",
      actorId: req.auth.userId,
      afterState: {
        teamId: query.teamId ?? null,
        verdict: query.verdict ?? null,
        from: query.from ?? null,
        to: query.to ?? null,
        limit: query.limit,
        offset: query.offset,
        resultCount: result.data.length,
      },
      meta: requestMeta(req),
    });

    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}
