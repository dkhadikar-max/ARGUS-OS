import { prisma } from "@argus/database";
import type { IcpCriterion } from "@argus/shared";

export function getIcp(teamId: string) {
  return prisma.iCPDefinition.findUnique({ where: { teamId } });
}

/** Bumps `version` on every update -- decision.service.ts's AI-5 cache key
 *  treats icpVersion as the signal that a cached debate output is stale. */
export async function upsertIcp(teamId: string, criteria: IcpCriterion[]) {
  const existing = await prisma.iCPDefinition.findUnique({ where: { teamId } });

  if (existing) {
    return prisma.iCPDefinition.update({
      where: { teamId },
      data: { criteria: criteria as never, version: existing.version + 1 },
    });
  }

  return prisma.iCPDefinition.create({
    data: { teamId, criteria: criteria as never, version: 1 },
  });
}
