import { prisma, type OutcomeType, type Verdict } from "@argus/database";
import type { ListOutcomesQuery } from "@argus/shared";

export function findDecisionForOutcome(decisionId: string, teamId: string) {
  return prisma.decision.findFirst({
    where: { id: decisionId, teamId },
    include: { outcome: true, prospect: true },
  });
}

export function createOutcomeRecord(input: {
  decisionId: string;
  userId: string;
  type: OutcomeType;
  value: number | null | undefined;
  timeToOutcomeDays: number | null | undefined;
  feedback: string | null | undefined;
}) {
  return prisma.outcome.create({
    data: {
      decisionId: input.decisionId,
      userId: input.userId,
      loggedBy: input.userId,
      type: input.type,
      value: input.value ?? null,
      timeToOutcomeDays: input.timeToOutcomeDays ?? null,
      feedback: input.feedback ?? null,
    },
  });
}

/** Every outcome for a given verdict, across the whole team — used to
 *  recompute the Company Memory pattern for that verdict segment. */
export function getTeamOutcomesForVerdict(teamId: string, verdict: Verdict) {
  return prisma.outcome.findMany({
    where: { decision: { teamId, verdict } },
  });
}

export function getCompanyMemory(teamId: string) {
  return prisma.companyMemory.findUnique({ where: { teamId } });
}

export function upsertCompanyMemory(teamId: string, patterns: unknown) {
  return prisma.companyMemory.upsert({
    where: { teamId },
    create: { teamId, patterns: patterns as never, riskFlags: [], icpHistory: [] },
    update: { patterns: patterns as never },
  });
}

export async function listOutcomes(query: ListOutcomesQuery) {
  const where = {
    decision: {
      teamId: query.teamId,
      ...(query.userId ? { userId: query.userId } : {}),
      ...(query.verdict ? { verdict: query.verdict } : {}),
    },
    ...(query.type ? { type: query.type } : {}),
    ...(query.from || query.to
      ? {
          loggedAt: {
            ...(query.from ? { gte: new Date(query.from) } : {}),
            ...(query.to ? { lte: new Date(query.to) } : {}),
          },
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.outcome.findMany({
      where,
      include: { decision: { include: { prospect: true } } },
      orderBy: { loggedAt: "desc" },
      take: query.limit,
      skip: query.offset,
    }),
    prisma.outcome.count({ where }),
  ]);

  return { rows, total };
}

export function getVerdictAggregations(teamId: string) {
  return prisma.outcome.findMany({
    where: { decision: { teamId } },
    select: { type: true, timeToOutcomeDays: true, decision: { select: { verdict: true } } },
  });
}

/** Bible Appendix F's calibration tiers ("learning"/"calibrating"/"mature")
 *  are keyed on total team decisions, not just outcome-logged ones -- a
 *  team can generate many verdicts while logging few ground-truth outcomes. */
export function countDecisionsForTeam(teamId: string) {
  return prisma.decision.count({ where: { teamId } });
}
