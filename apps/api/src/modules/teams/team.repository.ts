import { prisma } from "@argus/database";
import type { IcpCriterion } from "@argus/shared";

export function getTeam(teamId: string) {
  return prisma.team.findUnique({ where: { id: teamId } });
}

/**
 * The onboarding wizard's one combined write: renames the auto-provisioned
 * personal team, seeds its first ICPDefinition (version 1 -- a brand-new
 * team can never already have one), and stamps onboardedAt so the
 * dashboard's /onboarding route stops showing the wizard on future visits.
 * One transaction, not three separate calls, since a partial failure here
 * (team renamed but ICP never seeded) would leave onboarding silently
 * "half done" with no way for the route's onboardedAt check to detect it.
 */
export async function completeTeamOnboarding(
  teamId: string,
  data: { name: string; criteria: IcpCriterion[]; companyContext?: string },
) {
  return prisma.$transaction(async (tx) => {
    const team = await tx.team.update({
      where: { id: teamId },
      data: {
        name: data.name,
        onboardedAt: new Date(),
        companyContext: data.companyContext ?? undefined,
      },
    });
    await tx.iCPDefinition.upsert({
      where: { teamId },
      create: { teamId, criteria: data.criteria as never, version: 1 },
      update: { criteria: data.criteria as never, version: { increment: 1 } },
    });
    return team;
  });
}

export function updateCompanyContext(teamId: string, companyContext: string | undefined) {
  return prisma.team.update({
    where: { id: teamId },
    data: { companyContext: companyContext ?? null },
  });
}
