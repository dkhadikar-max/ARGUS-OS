import { prisma } from "@argus/database";

export function getCompanyMemory(teamId: string) {
  return prisma.companyMemory.findUnique({ where: { teamId } });
}

/** Bible §10.5 `topPerformingMessages` -- every message draft this team has
 *  sent, with just enough of its linked decision to know whether the
 *  prospect ever replied. */
export function getMessageDraftsForTeam(teamId: string) {
  return prisma.messageDraft.findMany({
    where: { decision: { teamId } },
    select: {
      personalizationHooks: true,
      decision: { select: { outcome: { select: { type: true } } } },
    },
  });
}
