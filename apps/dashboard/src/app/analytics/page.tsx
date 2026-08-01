import {
  Card,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@tremor/react";
import { api } from "../../lib/api-client";
import { VerdictBadge } from "../../components/VerdictBadge";
import { RepFilterSelect } from "../../components/RepFilterSelect";
import { MeetingRateChart } from "../../components/MeetingRateChart";
import { KpiBlock } from "../../components/KpiBlock";
import { Card as EmptyStateCard } from "../../components/ui/Card";
import { PageHeader } from "../../components/ui/PageHeader";

const MODE_LABEL: Record<string, string> = {
  learning: "Learning mode",
  calibrating: "Calibrating mode",
  mature: "Mature mode",
};

// Bible §18 DSH-3 "Analytics": decision history table (real, from GET
// /api/v1/outcomes' existing `data`), outcome charts (Tremor, real, from
// that same endpoint's `aggregations.byVerdict`), an accuracy score display,
// a per-rep accuracy breakdown, and now a rep filter on the decision-history
// table (§4.4 Manager Morgan persona's "Filter by rep, see decision
// history") — all real, computed server-side (see README "Analytics"
// section for exactly what "accuracy" means here and why it can be null,
// and exactly what the rep filter does and doesn't scope).
//
// Complete the Redesign (2026-08-02) -- restructured around 4 large KPI
// blocks instead of leading with two separate cards + everything else at
// equal weight. Every value shown is exactly the same real field already
// in ListOutcomesResponse (no new fetch, no new backend field) --
// Accuracy/Override rate/Decisions logged/STRONG YES meeting rate were
// already computed, just not all promoted to hero-block status before.
// The by-rep table moves behind a closed-by-default disclosure (same
// native <details>/<summary> primitive used on /settings); the chart and
// decision history stay, unchanged, just reordered below the KPI row.
export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ rep?: string }>;
}) {
  const { rep } = await searchParams;
  const outcomes = await api.getOutcomes({ userId: rep });
  const selectedRep = rep ? outcomes.accuracy.byRep.find((r) => r.userId === rep) : undefined;

  const chartData = Object.entries(outcomes.aggregations.byVerdict).map(([verdict, stats]) => ({
    verdict,
    "Meeting rate": stats ? Math.round(stats.meetingRate * 100) : 0,
  }));

  const teamStrongYes = outcomes.aggregations.byVerdict.STRONG_YES;
  const overrideRate = outcomes.accuracy.overrideRate;
  const overrideGuardrailBreached = overrideRate !== null && overrideRate > 0.4;

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <PageHeader title="Performance" />

      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <KpiBlock
          label="Accuracy"
          value={outcomes.accuracy.score === null ? "Not enough data yet" : `${Math.round(outcomes.accuracy.score * 100)}%`}
          caption={`${MODE_LABEL[outcomes.accuracy.mode]} — STRONG YES + YES verdicts that converted to a meeting or better.`}
        />
        {/* ARGUS Unanimous Policy v2.1 "Override Rate Guardrail" (not the
            Bible): all-time visibility here; the real-time 40%-threshold
            Slack alert is a separate check in decision.service.ts's
            overrideDecision, this is just the display stat. */}
        <KpiBlock
          label="Override rate"
          value={overrideRate === null ? "Not enough data yet" : `${Math.round(overrideRate * 100)}%`}
          valueClassName={overrideGuardrailBreached ? "text-red-600" : undefined}
          caption={
            overrideGuardrailBreached
              ? "Above the 40% Policy v2.1 guardrail — worth an emergency prompt review."
              : "Share of decisions a rep has overridden."
          }
        />
        <KpiBlock
          label="Decisions logged"
          value={String(outcomes.accuracy.totalDecisions)}
          caption={MODE_LABEL[outcomes.accuracy.mode]}
        />
        <KpiBlock
          label="STRONG YES meeting rate"
          value={teamStrongYes ? `${Math.round(teamStrongYes.meetingRate * 100)}%` : "Not enough data yet"}
          caption="STRONG YES verdicts only, converted to a meeting or better."
        />
      </div>

      <section className="mb-8">
        <h2 className="text-section-label mb-3">Meeting rate by verdict</h2>
        {chartData.length === 0 ? (
          <EmptyStateCard variant="dashed" className="p-8">
            <p className="text-sm font-medium text-gray-900">No outcomes logged yet</p>
            <p className="mt-1 text-sm text-gray-500">
              This chart fills in as your team logs outcomes for their decisions.
            </p>
          </EmptyStateCard>
        ) : (
          <MeetingRateChart data={chartData} />
        )}
      </section>

      <details className="mb-8 group">
        <summary className="text-section-label mb-3 cursor-pointer group-open:mb-3">
          Accuracy by rep{outcomes.accuracy.byRep.length > 0 ? ` (${outcomes.accuracy.byRep.length})` : ""}
        </summary>
        {outcomes.accuracy.byRep.length === 0 ? (
          <EmptyStateCard variant="dashed" className="p-8">
            <p className="text-sm font-medium text-gray-900">No decisions yet</p>
            <p className="mt-1 text-sm text-gray-500">
              This fills in once reps on your team start generating verdicts.
            </p>
          </EmptyStateCard>
        ) : (
          <Card>
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>Rep</TableHeaderCell>
                  <TableHeaderCell>Decisions</TableHeaderCell>
                  <TableHeaderCell>Accuracy</TableHeaderCell>
                  <TableHeaderCell>STRONG YES vs team avg</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {outcomes.accuracy.byRep.map((repRow) => {
                  // ARGUS Unanimous Policy v2.1 "Cross-Rep Benchmarking"
                  // (not the Bible): "Your STRONG YES closes at 34% vs
                  // team avg 28%" -- the team-wide figure reuses
                  // `teamStrongYes` (the same aggregations.byVerdict.STRONG_YES
                  // the chart and KPI block above already compute), not a
                  // second implementation of the same number.
                  const repStrongYes = repRow.byVerdict.STRONG_YES;
                  return (
                    <TableRow key={repRow.userId}>
                      <TableCell>{repRow.name}</TableCell>
                      <TableCell>{repRow.totalDecisions}</TableCell>
                      <TableCell>
                        {repRow.score === null ? "Not enough data yet" : `${Math.round(repRow.score * 100)}%`}
                      </TableCell>
                      <TableCell>
                        {repStrongYes?.meetingRate == null || !teamStrongYes
                          ? "Not enough data yet"
                          : `${Math.round(repStrongYes.meetingRate * 100)}% vs ${Math.round(teamStrongYes.meetingRate * 100)}%`}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        )}
      </details>

      <section>
        <div className="mb-3 flex items-center justify-between gap-4">
          <h2 className="text-section-label">
            Decision history{selectedRep ? ` — ${selectedRep.name}` : ""}
          </h2>
          <RepFilterSelect reps={outcomes.accuracy.byRep} />
        </div>
        {outcomes.data.length === 0 ? (
          <EmptyStateCard variant="dashed" className="p-8">
            <p className="text-sm font-medium text-gray-900">
              {rep ? "No decision history for this rep yet" : "No decision history yet"}
            </p>
            <p className="mt-1 text-sm text-gray-500">
              Decisions appear here once an outcome has been logged for them.
            </p>
          </EmptyStateCard>
        ) : (
          <Card>
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>Prospect</TableHeaderCell>
                  <TableHeaderCell>Verdict</TableHeaderCell>
                  <TableHeaderCell>Outcome</TableHeaderCell>
                  <TableHeaderCell>Logged</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {outcomes.data.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      {row.prospectName}
                      {row.companyName ? ` · ${row.companyName}` : ""}
                    </TableCell>
                    <TableCell>
                      <VerdictBadge verdict={row.verdict} />
                    </TableCell>
                    <TableCell>{row.type.replaceAll("_", " ").toLowerCase()}</TableCell>
                    <TableCell>{new Date(row.loggedAt).toLocaleDateString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}
      </section>
    </main>
  );
}
