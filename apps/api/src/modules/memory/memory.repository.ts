import { prisma } from "@argus/database";

export function getCompanyMemory(teamId: string) {
  return prisma.companyMemory.findUnique({ where: { teamId } });
}

/** Bible §8.8 Learning Agent's most recent run. Upserts because a team's
 *  first-ever run (crossing the n>=20 threshold) may happen before any
 *  outcome has otherwise created this team's CompanyMemory row. */
export function upsertLearningInsights(teamId: string, insights: unknown) {
  return prisma.companyMemory.upsert({
    where: { teamId },
    create: { teamId, patterns: [], riskFlags: [], icpHistory: [], learningInsights: insights as never },
    update: { learningInsights: insights as never },
  });
}

// Both queries below aggregate over a team's entire history with no
// pagination -- correct today, but cost grows unbounded with a team's
// lifetime volume. This caps it to the most recent N rows rather than a
// true unbounded scan; a team well past this many decisions/drafts needs
// incremental aggregation instead (updating a running tally as each new
// outcome logs, the way outcome.service.ts's updateCompanyMemoryPattern
// already does for `patterns`), which is real, separate work -- see
// README "Company Memory".
const MAX_ROWS_FOR_MEMORY_AGGREGATION = 5000;

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
    orderBy: { createdAt: "desc" },
    take: MAX_ROWS_FOR_MEMORY_AGGREGATION,
  });
}

/** Bible §10.5 `riskFlags` -- every decision this team has generated, with
 *  its full agent debate output (to read the Risk Agent's own risk list)
 *  and whether it has a logged outcome. */
export function getDecisionsForRiskFlags(teamId: string) {
  return prisma.decision.findMany({
    where: { teamId },
    select: {
      agentOutputs: true,
      outcome: { select: { type: true } },
    },
    orderBy: { createdAt: "desc" },
    take: MAX_ROWS_FOR_MEMORY_AGGREGATION,
  });
}
