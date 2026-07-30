import type { Request, Response, NextFunction } from "express";
import { AppError, type AdminListShadowDecisionsQuery, type AdminShadowDecisionParams, type AdminShadowMetricsQuery } from "@argus/shared";
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

export async function getShadowDecisionDetailHandler(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.auth?.userId) throw new AppError("UNAUTHORIZED", "Authentication required");
    const params = req.params as unknown as AdminShadowDecisionParams;

    const result = await adminService.getShadowDecisionDetail(params.id);
    if (!result) throw new AppError("NOT_FOUND", "Shadow decision not found");

    // Audited with the specific decisionId this time (not "all-teams") --
    // this is exactly the individually-audited, on-demand read the list
    // endpoint's own design comment anticipated for the heavy JSON fields.
    await recordAudit({
      entityType: "admin_shadow_decision_detail",
      entityId: params.id,
      action: "viewed",
      actorId: req.auth.userId,
      afterState: { teamId: result.teamId, decisionId: result.decisionId },
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
