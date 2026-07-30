import { prisma } from "@argus/database";
import type { DisagreementCategory } from "./decision-disagreement.js";

/**
 * Gate 3 Shadow Mode, Increment 2 groundwork -- real aggregate queries
 * over the ShadowDecision table, built ahead of real traffic
 * (SHADOW_SAMPLE_RATE_PERCENT is still 0 everywhere) so there's zero lag
 * between raising the sample rate and having visibility.
 *
 * Deliberately scoped to what's actually queryable from ShadowDecision:
 * volume over time, verdict agreement rate, confidence drift, cost per
 * decision, disagreement category breakdown. Two metrics requested
 * alongside this are NOT here, on purpose, not by oversight:
 *
 * - Shadow failure rate: Increment 1 deliberately writes no row on a
 *   failed shadow run (see shadow-runner.service.ts's own comment) --
 *   only Datadog's shadow.decision.error counter tracks failures. Adding
 *   a schema field to make this DB-queryable would reverse that explicit
 *   design decision; not done without being asked.
 * - Background queue depth: there is no queue. Shadow Runner is
 *   fire-and-forget with no concurrency limiter (tracked as a real,
 *   deferred prerequisite before raising the sample rate -- see
 *   PROJECT_STATUS.md's Increment 1.5 row). Nothing to report a depth on.
 * - Latency impact on the live path: ShadowDecision only stores the
 *   shadow run's own processingTimeMs, never the live decision's --
 *   comparing live-path latency with/without shadow enabled is an APM/
 *   Datadog concern (http.request.duration, already emitted by
 *   middleware/metrics.ts), not something this table can answer.
 */

const ALL_DISAGREEMENT_CATEGORIES: DisagreementCategory[] = [
  "verdict_mismatch",
  "confidence_threshold_exceeded",
  "controller_action_mismatch",
  "runtime_error",
  "schema_error",
  "missing_capability_output",
];

export interface ShadowVolumeByDay {
  day: string; // ISO date (YYYY-MM-DD)
  count: number;
}

export interface ShadowDisagreementBreakdownEntry {
  category: DisagreementCategory;
  count: number;
}

export interface ShadowMetricsSummary {
  totalShadowDecisions: number;
  verdictAgreementRate: number; // 0 when totalShadowDecisions is 0, not NaN
  avgConfidenceDelta: number;
  p50ConfidenceDelta: number;
  avgCostUsd: number;
  totalCostUsd: number;
  disagreementBreakdown: ShadowDisagreementBreakdownEntry[];
  volumeByDay: ShadowVolumeByDay[];
}

function percentile(sortedValues: number[], p: number): number {
  if (sortedValues.length === 0) return 0;
  const index = Math.ceil((p / 100) * sortedValues.length) - 1;
  return sortedValues[Math.max(0, Math.min(index, sortedValues.length - 1))]!;
}

/**
 * Real aggregate metrics for a team's ShadowDecision rows in the last
 * `sinceDays` days. Every rate/average is computed from real rows, never
 * hand-set -- an empty window returns real zero values, not NaN.
 */
export async function getShadowMetricsSummary(teamId: string, sinceDays: number): Promise<ShadowMetricsSummary> {
  const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);

  const rows = await prisma.shadowDecision.findMany({
    where: { teamId, createdAt: { gte: since } },
    select: { verdictAgreement: true, confidenceDelta: true, inferenceCostUsd: true, disagreementCategories: true, createdAt: true },
  });

  const total = rows.length;
  const verdictAgreementRate = total ? rows.filter((r) => r.verdictAgreement).length / total : 0;
  const confidenceDeltas = rows.map((r) => r.confidenceDelta).sort((a, b) => a - b);
  const avgConfidenceDelta = total ? confidenceDeltas.reduce((s, d) => s + d, 0) / total : 0;
  const p50ConfidenceDelta = percentile(confidenceDeltas, 50);
  const totalCostUsd = rows.reduce((s, r) => s + r.inferenceCostUsd, 0);
  const avgCostUsd = total ? totalCostUsd / total : 0;

  const disagreementBreakdown: ShadowDisagreementBreakdownEntry[] = ALL_DISAGREEMENT_CATEGORIES.map((category) => ({
    category,
    count: rows.filter((r) => (r.disagreementCategories as unknown as DisagreementCategory[]).includes(category)).length,
  }));

  const volumeByDay = await getShadowVolumeByDay(teamId, since);

  return { totalShadowDecisions: total, verdictAgreementRate, avgConfidenceDelta, p50ConfidenceDelta, avgCostUsd, totalCostUsd, disagreementBreakdown, volumeByDay };
}

/** Real, date-bucketed volume series -- Prisma's groupBy doesn't support
 *  date truncation, so this is one parameterized raw query (tagged
 *  template, safe from injection), matching outcome.repository.ts's own
 *  established $queryRaw convention. */
async function getShadowVolumeByDay(teamId: string, since: Date): Promise<ShadowVolumeByDay[]> {
  const rows = await prisma.$queryRaw<Array<{ day: Date; count: bigint }>>`
    SELECT date_trunc('day', "createdAt") AS day, count(*) AS count
    FROM "ShadowDecision"
    WHERE "teamId" = ${teamId} AND "createdAt" >= ${since}
    GROUP BY day
    ORDER BY day
  `;
  return rows.map((r) => ({ day: r.day.toISOString().slice(0, 10), count: Number(r.count) }));
}
