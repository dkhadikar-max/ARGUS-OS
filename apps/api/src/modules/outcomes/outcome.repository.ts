import { prisma, type OutcomeType, type Verdict } from "@argus/database";
import type { ListOutcomesQuery } from "@argus/shared";

export function findDecisionForOutcome(decisionId: string, teamId: string) {
  return prisma.decision.findFirst({
    where: { id: decisionId, teamId },
    include: { outcome: true, prospect: true },
  });
}

/** Bible §8.8 Learning Agent's "n>=20" significance threshold -- how many
 *  outcomes this team has ever logged, used to fire a run on every 20th. */
export function countOutcomesForTeam(teamId: string) {
  return prisma.outcome.count({ where: { decision: { teamId } } });
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

/**
 * Reads CompanyMemory.patterns, replaces the entry for this verdict, and
 * writes the whole array back -- all inside one transaction with an
 * explicit row lock, so two outcomes logged for *different* verdicts at
 * the same moment can't both read the same stale array and have one
 * write silently clobber the other's pattern (a real, verified race the
 * previous separate-read-then-separate-write version of this had: two
 * concurrent calls could both read patterns=[{WAIT}], both compute their
 * own verdict's entry, and whichever write landed second would overwrite
 * the first's addition entirely).
 *
 * `FOR UPDATE` only locks a row that already exists -- a team's very
 * first-ever outcome (no CompanyMemory row yet) has no row to lock, so an
 * extremely narrow race remains for that specific case. Postgres's own
 * unique constraint on `teamId` still prevents a duplicate row (the
 * upsert's ON CONFLICT handles that atomically); the residual risk is
 * limited to which of two *simultaneous first outcomes* one-time patterns
 * ends up written, not data corruption or a crash.
 */
export async function upsertCompanyMemoryPatternForVerdict(
  teamId: string,
  verdict: Verdict,
  patternEntry: Record<string, unknown>,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "CompanyMemory" WHERE "teamId" = ${teamId} FOR UPDATE`;

    const memory = await tx.companyMemory.findUnique({ where: { teamId } });
    const existingPatterns = Array.isArray(memory?.patterns)
      ? (memory.patterns as Array<{ verdict?: string }>)
      : [];
    const otherPatterns = existingPatterns.filter((p) => p.verdict !== verdict);
    const patterns = [...otherPatterns, patternEntry];

    await tx.companyMemory.upsert({
      where: { teamId },
      create: { teamId, patterns: patterns as never, riskFlags: [], icpHistory: [] },
      update: { patterns: patterns as never },
    });
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

/** ARGUS Unanimous Policy v2.1 "Override Rate Guardrail" (not the Bible) --
 *  all-time count of overridden decisions, for the Analytics display stat.
 *  `overrideDecision`'s own real-time guardrail check queries the rolling
 *  window version below instead. */
export function countOverriddenDecisionsForTeam(teamId: string) {
  return prisma.decision.count({ where: { teamId, override: { isNot: null } } });
}

/** The real-time half of the Override Rate Guardrail: counts within a
 *  rolling window (not all-time), since a guardrail needs to react to a
 *  recent quality problem, not get diluted by a team's whole history.
 *
 *  Cohorted by Decision.createdAt (when the verdict was generated), not
 *  Override.createdAt (when the override action happened) -- the same
 *  convention icp.service.ts's own recent-window accuracy scoring already
 *  uses. This means overriding a decision from outside the window won't
 *  count toward either side of the ratio, a deliberate, disclosed choice:
 *  the guardrail is about the quality of *this window's own decisions*,
 *  not a raw count of override clicks regardless of when the underlying
 *  verdict was made. */
export async function getRecentOverrideCounts(
  teamId: string,
  since: Date,
): Promise<{ total: number; overridden: number }> {
  const [total, overridden] = await Promise.all([
    prisma.decision.count({ where: { teamId, createdAt: { gte: since } } }),
    prisma.decision.count({ where: { teamId, createdAt: { gte: since }, override: { isNot: null } } }),
  ]);
  return { total, overridden };
}

/** Bible §4.4 Manager Morgan persona's per-rep breakdown -- queries Decision
 *  (not Outcome) so a rep's `totalDecisions` counts every verdict they've
 *  generated, the same "all decisions, not just outcome-logged ones"
 *  distinction `countDecisionsForTeam` already makes for the team total.
 *
 *  Unlike memory.repository.ts's own team-wide aggregation queries, this
 *  one is deliberately NOT capped to a recent-N window: a `take` ordered by
 *  recency, applied across the whole team, could silently drop a less
 *  active rep's older decisions out of the result entirely -- making that
 *  rep vanish from the coaching breakdown this exists for, which is worse
 *  than the (real, but currently modest at this product's scale) cost of
 *  an unbounded scan. */
export function getDecisionsForRepBreakdown(teamId: string) {
  return prisma.decision.findMany({
    where: { teamId },
    select: {
      userId: true,
      verdict: true,
      user: { select: { name: true, email: true } },
      outcome: { select: { type: true } },
    },
  });
}
