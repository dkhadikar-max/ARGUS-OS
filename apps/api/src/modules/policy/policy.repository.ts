import { prisma } from "@argus/database";
import type { PolicyRule } from "@argus/shared";

export function getPolicy(teamId: string) {
  return prisma.policyDefinition.findUnique({ where: { teamId } });
}

/** Bumps `version` on every update -- mirrors icp.repository.ts's
 *  upsertIcp exactly, including the same atomic-upsert reasoning (a single
 *  `version: { increment: 1 }` inside the upsert, not a find-then-write
 *  race between two concurrent admin saves). */
export async function upsertPolicy(teamId: string, rules: PolicyRule[]) {
  return prisma.policyDefinition.upsert({
    where: { teamId },
    create: { teamId, rules: rules as never, version: 1 },
    update: { rules: rules as never, version: { increment: 1 } },
  });
}
