import {
  BarChart,
  Card,
  Metric,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  Text,
  Title,
} from "@tremor/react";
import { api } from "../../lib/api-client";
import { VerdictBadge } from "../../components/VerdictBadge";
import { RepFilterSelect } from "../../components/RepFilterSelect";

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

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <header className="mb-6">
        <h1 className="text-lg font-bold text-gray-900">Analytics</h1>
      </header>

      <section className="mb-8">
        <Card>
          <Text>{MODE_LABEL[outcomes.accuracy.mode]} — {outcomes.accuracy.totalDecisions} team decisions</Text>
          {outcomes.accuracy.score === null ? (
            <>
              <Metric>Not enough data yet</Metric>
              <Text className="mt-1">
                Accuracy shows once at least one STRONG YES or YES decision has a logged outcome.
              </Text>
            </>
          ) : (
            <>
              <Metric>{Math.round(outcomes.accuracy.score * 100)}%</Metric>
              <Text className="mt-1">
                Share of STRONG YES / YES verdicts that converted to a meeting or better.
              </Text>
            </>
          )}
        </Card>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
          Meeting rate by verdict
        </h2>
        {chartData.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center">
            <p className="text-sm font-medium text-gray-900">No outcomes logged yet</p>
            <p className="mt-1 text-sm text-gray-500">
              This chart fills in as your team logs outcomes for their decisions.
            </p>
          </div>
        ) : (
          <Card>
            <BarChart
              data={chartData}
              index="verdict"
              categories={["Meeting rate"]}
              colors={["blue"]}
              valueFormatter={(value: number) => `${value}%`}
              yAxisWidth={48}
            />
          </Card>
        )}
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
          Accuracy by rep
        </h2>
        {outcomes.accuracy.byRep.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center">
            <p className="text-sm font-medium text-gray-900">No decisions yet</p>
            <p className="mt-1 text-sm text-gray-500">
              This fills in once reps on your team start generating verdicts.
            </p>
          </div>
        ) : (
          <Card>
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>Rep</TableHeaderCell>
                  <TableHeaderCell>Decisions</TableHeaderCell>
                  <TableHeaderCell>Accuracy</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {outcomes.accuracy.byRep.map((rep) => (
                  <TableRow key={rep.userId}>
                    <TableCell>{rep.name}</TableCell>
                    <TableCell>{rep.totalDecisions}</TableCell>
                    <TableCell>
                      {rep.score === null ? "Not enough data yet" : `${Math.round(rep.score * 100)}%`}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between gap-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Decision history{selectedRep ? ` — ${selectedRep.name}` : ""}
          </h2>
          <RepFilterSelect reps={outcomes.accuracy.byRep} />
        </div>
        {outcomes.data.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center">
            <p className="text-sm font-medium text-gray-900">
              {rep ? "No decision history for this rep yet" : "No decision history yet"}
            </p>
            <p className="mt-1 text-sm text-gray-500">
              Decisions appear here once an outcome has been logged for them.
            </p>
          </div>
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
