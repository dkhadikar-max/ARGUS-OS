import type { Request, Response, NextFunction } from "express";
import {
  AppError,
  type AdminListShadowDecisionsQuery,
  type AdminShadowDecisionParams,
  type AdminShadowHealthQuery,
  type AdminShadowMetricsQuery,
  type AdminShadowRolloutAuditQuery,
  type AdminShadowRolloutPreviewQuery,
  type UpdateShadowRolloutConfigRequest,
  type UpsertShadowRolloutTeamOverrideParams,
  type UpsertShadowRolloutTeamOverrideRequest,
} from "@argus/shared";
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

export async function getShadowHealthHandler(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.auth?.userId) throw new AppError("UNAUTHORIZED", "Authentication required");
    const query = req.query as unknown as AdminShadowHealthQuery;

    const result = await adminService.getShadowHealth(query);

    await recordAudit({
      entityType: "admin_shadow_health",
      entityId: query.teamId ?? "all-teams",
      action: "viewed",
      actorId: req.auth.userId,
      afterState: { teamId: query.teamId ?? null },
      meta: requestMeta(req),
    });

    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

/** Gate 3 Increment 1.9 -- deliberately does NOT call recordAudit, unlike
 *  every other handler in this file. This endpoint is designed to be
 *  polled (the dashboard's Shadow Health page refreshes it every ~15s
 *  while open) and returns no cross-tenant customer content at all (pure
 *  aggregate operational numbers -- counts, a rate, a millisecond
 *  figure) -- the original rationale for auditing admin reads (visibility
 *  into PII-adjacent cross-tenant content) doesn't apply here, and
 *  auditing every poll tick would flood AuditLog with non-events instead
 *  of real reviewable access events. Still gated by requireAuth +
 *  requireAdmin like every other admin route -- only the audit call is
 *  skipped, never the authorization check. */
export async function getShadowLiveMetricsHandler(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.auth?.userId) throw new AppError("UNAUTHORIZED", "Authentication required");

    const result = await adminService.getShadowLiveMetrics();

    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

export async function getShadowRolloutHandler(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.auth?.userId) throw new AppError("UNAUTHORIZED", "Authentication required");

    const result = await adminService.getShadowRollout();

    await recordAudit({
      entityType: "shadow_rollout_config",
      entityId: "global",
      action: "viewed",
      actorId: req.auth.userId,
      afterState: { enabled: result.enabled, globalPercent: result.globalPercent, version: result.version },
      meta: requestMeta(req),
    });

    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

/** This module's first real mutation -- audited with both beforeState AND
 *  afterState (unlike every read-only handler above, which only ever has
 *  afterState), since a config *change* is genuinely more useful to audit
 *  as a diff. adminService.updateShadowRolloutConfig already fetched the
 *  prior row, so no extra query is needed here to build that diff. */
export async function updateShadowRolloutConfigHandler(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.auth?.userId) throw new AppError("UNAUTHORIZED", "Authentication required");
    const body = req.body as UpdateShadowRolloutConfigRequest;

    const { before, after } = await adminService.updateShadowRolloutConfig(body, req.auth.userId);

    await recordAudit({
      entityType: "shadow_rollout_config",
      entityId: "global",
      action: "updated",
      actorId: req.auth.userId,
      beforeState: before ? { enabled: before.enabled, globalPercent: before.globalPercent, version: before.version } : null,
      afterState: { enabled: after.enabled, globalPercent: after.globalPercent, version: after.version },
      meta: requestMeta(req),
    });

    res.status(200).json(await adminService.getShadowRollout());
  } catch (err) {
    next(err);
  }
}

export async function upsertShadowRolloutTeamOverrideHandler(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.auth?.userId) throw new AppError("UNAUTHORIZED", "Authentication required");
    const params = req.params as unknown as UpsertShadowRolloutTeamOverrideParams;
    const body = req.body as UpsertShadowRolloutTeamOverrideRequest;

    const { before, after } = await adminService.upsertShadowRolloutTeamOverride(params.teamId, body, req.auth.userId);

    await recordAudit({
      entityType: "shadow_rollout_team_override",
      entityId: params.teamId,
      action: "updated",
      actorId: req.auth.userId,
      beforeState: before ? { percent: before.percent, reason: before.reason, expiresAt: before.expiresAt, version: before.version } : null,
      afterState: { percent: after.percent, reason: after.reason, expiresAt: after.expiresAt, version: after.version },
      meta: requestMeta(req),
    });

    res.status(200).json(await adminService.getShadowRollout());
  } catch (err) {
    next(err);
  }
}

export async function deleteShadowRolloutTeamOverrideHandler(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.auth?.userId) throw new AppError("UNAUTHORIZED", "Authentication required");
    const params = req.params as unknown as UpsertShadowRolloutTeamOverrideParams;

    await adminService.deleteShadowRolloutTeamOverride(params.teamId);

    await recordAudit({
      entityType: "shadow_rollout_team_override",
      entityId: params.teamId,
      action: "deleted",
      actorId: req.auth.userId,
      meta: requestMeta(req),
    });

    res.status(200).json(await adminService.getShadowRollout());
  } catch (err) {
    next(err);
  }
}

export async function getShadowRolloutAuditHandler(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.auth?.userId) throw new AppError("UNAUTHORIZED", "Authentication required");
    const query = req.query as unknown as AdminShadowRolloutAuditQuery;

    const result = await adminService.getShadowRolloutAudit(query);

    await recordAudit({
      entityType: "admin_shadow_rollout_audit",
      entityId: "global",
      action: "viewed",
      actorId: req.auth.userId,
      afterState: { limit: query.limit, before: query.before ?? null, resultCount: result.entries.length },
      meta: requestMeta(req),
    });

    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

export async function previewShadowRolloutHandler(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.auth?.userId) throw new AppError("UNAUTHORIZED", "Authentication required");
    const query = req.query as unknown as AdminShadowRolloutPreviewQuery;

    const result = await adminService.previewShadowRollout(query.prospectId, query.teamId);

    await recordAudit({
      entityType: "admin_shadow_rollout_preview",
      entityId: query.teamId,
      action: "viewed",
      actorId: req.auth.userId,
      afterState: { prospectId: query.prospectId, teamId: query.teamId, sampled: result.sampled },
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
