import { prisma } from "@argus/database";

// Gate 3 Increment 1.8 -- pure Prisma, no business logic/validation (see
// shadow-rollout.service.ts for that). Singleton config row is looked up
// by `key`, not by a hardcoded id.
const ROLLOUT_CONFIG_KEY = "SHADOW_ROLLOUT";

export function getRolloutConfig() {
  return prisma.shadowRolloutConfig.findUnique({ where: { key: ROLLOUT_CONFIG_KEY } });
}

export function upsertRolloutConfig(data: { enabled: boolean; globalPercent: number }, updatedBy: string) {
  return prisma.shadowRolloutConfig.upsert({
    where: { key: ROLLOUT_CONFIG_KEY },
    create: { key: ROLLOUT_CONFIG_KEY, ...data, updatedBy, version: 1 },
    update: { ...data, updatedBy, version: { increment: 1 } },
  });
}

export function getTeamOverride(teamId: string) {
  return prisma.shadowRolloutTeamOverride.findUnique({ where: { teamId } });
}

export function listTeamOverrides() {
  return prisma.shadowRolloutTeamOverride.findMany({
    include: { team: { select: { name: true } } },
    orderBy: { updatedAt: "desc" },
  });
}

export function upsertTeamOverride(
  teamId: string,
  data: { percent: number; reason: string | null; expiresAt: Date | null },
  updatedBy: string,
) {
  return prisma.shadowRolloutTeamOverride.upsert({
    where: { teamId },
    create: { teamId, ...data, updatedBy, version: 1 },
    update: { ...data, updatedBy, version: { increment: 1 } },
  });
}

/** Idempotent -- deleteMany never throws when the override never existed,
 *  unlike delete's P2025. */
export function deleteTeamOverride(teamId: string) {
  return prisma.shadowRolloutTeamOverride.deleteMany({ where: { teamId } });
}

/** Plain keyset pagination -- `before` filters to rows older than a given
 *  timestamp; the caller (admin.service.ts) derives `nextBefore` from the
 *  oldest row in each page. No opaque cursor token. */
export function listRolloutAuditEntries(limit: number, before?: Date) {
  return prisma.auditLog.findMany({
    where: {
      entityType: { in: ["shadow_rollout_config", "shadow_rollout_team_override"] },
      ...(before ? { createdAt: { lt: before } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}
