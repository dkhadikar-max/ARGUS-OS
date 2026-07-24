import { prisma } from "@argus/database";
import type { ReasoningAssetType } from "@argus/shared";

export function getReasoningAssetById(id: string) {
  return prisma.reasoningAsset.findUnique({ where: { id } });
}

export function findReasoningAsset(teamId: string, assetType: ReasoningAssetType, assetKey: string) {
  return prisma.reasoningAsset.findUnique({
    where: { assetType_assetKey_teamId: { assetType, assetKey, teamId } },
  });
}

export function listReasoningAssetsForTeam(teamId: string, assetType?: ReasoningAssetType) {
  return prisma.reasoningAsset.findMany({
    where: { teamId, ...(assetType ? { assetType } : {}) },
    orderBy: { updatedAt: "desc" },
  });
}

/** Upsert keyed on (assetType, assetKey, teamId) -- registering the same
 *  asset again updates its label/owner instead of creating a duplicate
 *  row. Never touches effectivenessScore/lastEvaluatedAt; see
 *  recordEffectivenessScore for that. */
export function upsertReasoningAsset(
  teamId: string,
  assetType: ReasoningAssetType,
  assetKey: string,
  label: string,
  ownerId: string | null,
) {
  return prisma.reasoningAsset.upsert({
    where: { assetType_assetKey_teamId: { assetType, assetKey, teamId } },
    create: { teamId, assetType, assetKey, label, ownerId },
    update: { label, ownerId },
  });
}

export function recordEffectivenessScore(id: string, score: number) {
  return prisma.reasoningAsset.update({
    where: { id },
    data: { effectivenessScore: score, lastEvaluatedAt: new Date() },
  });
}
