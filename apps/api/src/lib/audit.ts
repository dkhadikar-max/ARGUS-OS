import type { Request } from "express";
import { prisma } from "@argus/database";
import { logger } from "./logger.js";

// Bible §9.1's AuditLog model (verbatim) + §19.1 Data Integrity checklist:
// "Audit logs capture all state changes". entityType/action are free-form
// strings by design (the model's own comments give "decision"/"outcome"/
// "user" and "created"/"updated"/"deleted" as examples, not an enum), so
// call sites choose whatever verb/noun best describes the mutation.
export interface RequestMeta {
  ipAddress?: string;
  userAgent?: string;
}

/** Extracts the two optional forensic fields AuditLog carries from an
 *  Express request, at the one layer (controllers) that still has the raw
 *  request — services only ever see parsed DTOs + AuthContext. */
export function requestMeta(req: Request): RequestMeta {
  return { ipAddress: req.ip, userAgent: req.header("user-agent") };
}

export interface AuditParams {
  entityType: string;
  entityId: string;
  action: string;
  actorId: string;
  beforeState?: unknown;
  afterState?: unknown;
  meta?: RequestMeta;
}

/** Never throws: an audit row failing to write must not roll back or fail
 *  the primary operation it's describing (e.g. a Decision that already
 *  committed shouldn't error out because its own audit entry couldn't be
 *  inserted). Failures are logged loudly instead of silently swallowed. */
export async function recordAudit(params: AuditParams): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        entityType: params.entityType,
        entityId: params.entityId,
        action: params.action,
        actorId: params.actorId,
        beforeState: params.beforeState === undefined ? undefined : (params.beforeState as never),
        afterState: params.afterState === undefined ? undefined : (params.afterState as never),
        ipAddress: params.meta?.ipAddress ?? null,
        userAgent: params.meta?.userAgent ?? null,
      },
    });
  } catch (err) {
    logger.error(
      { err, entityType: params.entityType, entityId: params.entityId, action: params.action },
      "Audit log write failed",
    );
  }
}
