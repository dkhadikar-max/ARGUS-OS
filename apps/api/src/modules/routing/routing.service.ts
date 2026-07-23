import {
  AppError,
  type ProposeRoutingThresholdsRequest,
  type RoutingThresholdState,
  type RoutingThresholdVersionEntry,
  type RoutingThresholds,
} from "@argus/shared";
import { ADMIN_ROLES, type AuthContext } from "../../middleware/auth.js";
import { recordAudit, type RequestMeta } from "../../lib/audit.js";
import {
  approveRoutingThresholdVersion,
  createPendingRoutingThresholdVersion,
  getActiveRoutingThresholdVersion,
  getPendingRoutingThresholdVersion,
  getRoutingThresholdVersionByNumber,
  rejectRoutingThresholdVersion,
} from "./routing.repository.js";

/** Same numbers Phase 3's conflict-surprise.ts hardcodes internally
 *  (cv > 0.25, maxSurprise > 0.7) -- used when a team has never proposed/
 *  approved its own thresholds. Exported so the (deferred, benchmark-
 *  gated) orchestration refactor has a real default to fall back to once
 *  it actually wires execution-strategy routing into the live pipeline. */
export const DEFAULT_ROUTING_THRESHOLDS: RoutingThresholds = { cvThreshold: 0.25, maxSurpriseThreshold: 0.7 };

interface RoutingThresholdRow {
  version: number;
  thresholds: unknown;
  status: "ACTIVE" | "PENDING" | "REJECTED" | "SUPERSEDED";
  createdAt: Date;
  createdBy: string;
  approvedAt: Date | null;
  approvedBy: string | null;
}

function toEntry(row: RoutingThresholdRow): RoutingThresholdVersionEntry {
  return {
    version: row.version,
    thresholds: row.thresholds as RoutingThresholds,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    createdBy: row.createdBy,
    approvedAt: row.approvedAt?.toISOString() ?? null,
    approvedBy: row.approvedBy,
  };
}

function requireAdmin(auth: AuthContext, action: string): void {
  if (!auth.role || !ADMIN_ROLES.has(auth.role)) {
    throw new AppError("FORBIDDEN", `Only a team admin can ${action}`);
  }
}

/** Returns the team's current ACTIVE thresholds (falling back to the
 *  system default) plus the currently-pending proposal, if any -- the
 *  "A/B support" surface: both are visible together so an admin can
 *  compare before approving. */
export async function getRoutingThresholdStateForTeam(auth: AuthContext): Promise<RoutingThresholdState> {
  requireAdmin(auth, "view routing thresholds");

  const [active, pending] = await Promise.all([
    getActiveRoutingThresholdVersion(auth.teamId),
    getPendingRoutingThresholdVersion(auth.teamId),
  ]);

  return {
    teamId: auth.teamId,
    active: active ? toEntry(active) : null,
    pending: pending ? toEntry(pending) : null,
  };
}

export async function proposeRoutingThresholdsForTeam(
  auth: AuthContext,
  request: ProposeRoutingThresholdsRequest,
  meta?: RequestMeta,
): Promise<RoutingThresholdVersionEntry> {
  requireAdmin(auth, "propose routing thresholds");

  const created = await createPendingRoutingThresholdVersion(auth.teamId, request.thresholds, auth.userId ?? "system");

  await recordAudit({
    entityType: "routing_threshold",
    entityId: auth.teamId,
    action: "proposed",
    actorId: auth.userId ?? "system",
    afterState: { version: created.version, thresholds: request.thresholds },
    meta,
  });

  return toEntry(created);
}

export async function approveRoutingThresholdsForTeam(
  auth: AuthContext,
  version: number,
  meta?: RequestMeta,
): Promise<RoutingThresholdVersionEntry> {
  requireAdmin(auth, "approve routing thresholds");

  const target = await getRoutingThresholdVersionByNumber(auth.teamId, version);
  if (!target || target.status !== "PENDING") {
    throw new AppError("NOT_FOUND", `No pending routing threshold version ${version} for this team`);
  }

  const approved = await approveRoutingThresholdVersion(auth.teamId, version, auth.userId ?? "system");

  await recordAudit({
    entityType: "routing_threshold",
    entityId: auth.teamId,
    action: "approved",
    actorId: auth.userId ?? "system",
    afterState: { version },
    meta,
  });

  return toEntry(approved);
}

export async function rejectRoutingThresholdsForTeam(
  auth: AuthContext,
  version: number,
  meta?: RequestMeta,
): Promise<RoutingThresholdVersionEntry> {
  requireAdmin(auth, "reject routing thresholds");

  const target = await getRoutingThresholdVersionByNumber(auth.teamId, version);
  if (!target || target.status !== "PENDING") {
    throw new AppError("NOT_FOUND", `No pending routing threshold version ${version} for this team`);
  }

  const rejected = await rejectRoutingThresholdVersion(auth.teamId, version, auth.userId ?? "system");

  await recordAudit({
    entityType: "routing_threshold",
    entityId: auth.teamId,
    action: "rejected",
    actorId: auth.userId ?? "system",
    afterState: { version },
    meta,
  });

  return toEntry(rejected);
}
