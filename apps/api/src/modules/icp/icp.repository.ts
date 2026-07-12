import { prisma } from "@argus/database";
import type { IcpCriterion } from "@argus/shared";

export function getIcp(teamId: string) {
  return prisma.iCPDefinition.findUnique({ where: { teamId } });
}

/** Bumps `version` on every update -- decision.service.ts's AI-5 cache key
 *  treats icpVersion as the signal that a cached debate output is stale.
 *
 *  A single atomic `upsert` with `version: { increment: 1 }`, not a
 *  find-then-branch-then-write -- the earlier version of this function read
 *  `existing.version` in JS and wrote `existing.version + 1`, a classic
 *  read-then-write race: two concurrent saves could both read the same
 *  version and both write the same "+1" value, silently losing one admin's
 *  edit with no conflict indication. Postgres executes `field = field + 1`
 *  as a single atomic statement, immune to that race regardless of what
 *  else read the row a moment earlier. The upsert's own ON CONFLICT
 *  handling is similarly atomic for the create-vs-update branch itself, so
 *  two teams' very first concurrent saves can't collide on the unique
 *  `teamId` constraint either. */
export async function upsertIcp(teamId: string, criteria: IcpCriterion[]) {
  return prisma.iCPDefinition.upsert({
    where: { teamId },
    create: { teamId, criteria: criteria as never, version: 1 },
    update: { criteria: criteria as never, version: { increment: 1 } },
  });
}

/** Bible §10.5 `icpAccuracy` -- every decision the team has generated since
 *  a given ICP version activated, with just enough to compute that
 *  version's own accuracy (verdict + logged outcome type). */
export function getDecisionsSince(teamId: string, since: Date) {
  return prisma.decision.findMany({
    where: { teamId, createdAt: { gte: since } },
    select: {
      verdict: true,
      outcome: { select: { type: true } },
    },
  });
}

/**
 * Snapshots a just-retired ICP version's own accuracy into
 * `CompanyMemory.icpHistory` -- mirrors outcome.repository.ts's
 * `upsertCompanyMemoryPatternForVerdict` exactly (same transactional
 * `SELECT ... FOR UPDATE` row lock before the read-modify-write, same
 * upsert-with-empty-defaults for a team's very first CompanyMemory row),
 * since this is the same class of concurrent-JSON-array-mutation race,
 * just far less likely in practice (ICP edits are admin-only and rare
 * compared to outcome logging).
 */
export async function appendIcpHistoryEntry(
  teamId: string,
  entry: Record<string, unknown>,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "CompanyMemory" WHERE "teamId" = ${teamId} FOR UPDATE`;

    const memory = await tx.companyMemory.findUnique({ where: { teamId } });
    const existingHistory = Array.isArray(memory?.icpHistory) ? memory.icpHistory : [];
    const icpHistory = [...existingHistory, entry];

    await tx.companyMemory.upsert({
      where: { teamId },
      create: { teamId, patterns: [], riskFlags: [], icpHistory: icpHistory as never },
      update: { icpHistory: icpHistory as never },
    });
  });
}
