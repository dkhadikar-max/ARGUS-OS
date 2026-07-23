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

// v4 roadmap Phase 5 -- additive versioning on top of the above, unchanged,
// upsertPolicy. PolicyVersion is a parallel append-only log; nothing here
// touches PolicyDefinition or evaluatePolicyRules()'s existing behavior.

/** Snapshots one policy save into PolicyVersion. Called alongside (not
 *  instead of) upsertPolicy -- see policy.service.ts's updatePolicyForTeam. */
export function recordPolicyVersion(teamId: string, version: number, rules: PolicyRule[], createdBy: string) {
  return prisma.policyVersion.create({
    data: { teamId, version, rules: rules as never, createdBy },
  });
}

/** Newest-first version history for a team. */
export function getPolicyVersionHistory(teamId: string) {
  return prisma.policyVersion.findMany({
    where: { teamId },
    orderBy: { version: "desc" },
  });
}

/** One specific historical version's rules, or null if that version number
 *  doesn't exist for this team (e.g. a stale/mistyped rollback request). */
export function getPolicyVersion(teamId: string, version: number) {
  return prisma.policyVersion.findUnique({ where: { teamId_version: { teamId, version } } });
}
