import { prisma } from "@argus/database";

/** Active queue candidates: user's decisions with no outcome yet and not
 *  already dismissed via a PASSED/SNOOZED action (Bible §6.2 Today Queue). */
export function getActiveDecisionsForUser(userId: string, teamId: string) {
  return prisma.decision.findMany({
    where: {
      userId,
      teamId,
      outcome: null,
      actionTaken: { is: null },
    },
    include: {
      prospect: true,
      messageDrafts: { take: 1, orderBy: { createdAt: "desc" } },
      evidence: true,
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}

/** Count of prior decisions on the same prospect, per prospect — used to
 *  flag re-engagements ("previous meeting/decision N days ago"). */
export function countPriorDecisionsByProspect(prospectIds: string[], teamId: string) {
  return prisma.decision.groupBy({
    by: ["prospectId"],
    where: { prospectId: { in: prospectIds }, teamId },
    _count: { _all: true },
  });
}
