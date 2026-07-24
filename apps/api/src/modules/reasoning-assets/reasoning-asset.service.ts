import {
  AppError,
  type ReasoningAsset,
  type ReasoningAssetType,
  type RegisterReasoningAssetRequest,
} from "@argus/shared";
import { ADMIN_ROLES, type AuthContext } from "../../middleware/auth.js";
import { recordAudit, type RequestMeta } from "../../lib/audit.js";
import {
  getReasoningAssetById,
  listReasoningAssetsForTeam,
  recordEffectivenessScore,
  upsertReasoningAsset,
} from "./reasoning-asset.repository.js";

interface ReasoningAssetRow {
  id: string;
  assetType: string;
  assetKey: string;
  label: string;
  teamId: string | null;
  ownerId: string | null;
  effectivenessScore: number | null;
  lastEvaluatedAt: Date | null;
  approvedAt: Date | null;
  approvedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function toEntry(row: ReasoningAssetRow): ReasoningAsset {
  return {
    id: row.id,
    assetType: row.assetType as ReasoningAssetType,
    assetKey: row.assetKey,
    label: row.label,
    teamId: row.teamId,
    ownerId: row.ownerId,
    effectivenessScore: row.effectivenessScore,
    lastEvaluatedAt: row.lastEvaluatedAt?.toISOString() ?? null,
    approvedAt: row.approvedAt?.toISOString() ?? null,
    approvedBy: row.approvedBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function requireAdmin(auth: AuthContext, action: string): void {
  if (!auth.role || !ADMIN_ROLES.has(auth.role)) {
    throw new AppError("FORBIDDEN", `Only a team admin can ${action}`);
  }
}

export async function listReasoningAssetsForAuthTeam(
  auth: AuthContext,
  assetType?: ReasoningAssetType,
): Promise<ReasoningAsset[]> {
  requireAdmin(auth, "view reasoning assets");
  const rows = await listReasoningAssetsForTeam(auth.teamId, assetType);
  return rows.map(toEntry);
}

/** Registers a new reasoning asset, or updates the label/owner of an
 *  existing one keyed on (assetType, assetKey) for the caller's team --
 *  see reasoning-asset.repository.ts's upsertReasoningAsset. This never
 *  touches effectivenessScore; recordEffectivenessScoreForAsset is the only
 *  path that does. */
export async function registerReasoningAssetForTeam(
  auth: AuthContext,
  request: RegisterReasoningAssetRequest,
  meta?: RequestMeta,
): Promise<ReasoningAsset> {
  requireAdmin(auth, "register a reasoning asset");

  const ownerId = request.ownerId ?? auth.userId ?? null;
  const created = await upsertReasoningAsset(auth.teamId, request.assetType, request.assetKey, request.label, ownerId);

  await recordAudit({
    entityType: "reasoning_asset",
    entityId: created.id,
    action: "registered",
    actorId: auth.userId ?? "system",
    afterState: { assetType: request.assetType, assetKey: request.assetKey, label: request.label, ownerId },
    meta,
  });

  return toEntry(created);
}

/** The only way effectivenessScore/lastEvaluatedAt are ever written -- no
 *  automatic scoring happens anywhere in Phase 13. The caller (an admin
 *  today; potentially a future subsystem's own computation later) supplies
 *  a real number it has already computed. */
export async function recordEffectivenessScoreForAsset(
  auth: AuthContext,
  assetId: string,
  score: number,
  meta?: RequestMeta,
): Promise<ReasoningAsset> {
  requireAdmin(auth, "record a reasoning asset's effectiveness");

  const target = await getReasoningAssetById(assetId);
  if (!target || target.teamId !== auth.teamId) {
    throw new AppError("NOT_FOUND", `No reasoning asset ${assetId} for this team`);
  }

  const updated = await recordEffectivenessScore(assetId, score);

  await recordAudit({
    entityType: "reasoning_asset",
    entityId: assetId,
    action: "effectiveness_recorded",
    actorId: auth.userId ?? "system",
    afterState: { score },
    meta,
  });

  return toEntry(updated);
}
