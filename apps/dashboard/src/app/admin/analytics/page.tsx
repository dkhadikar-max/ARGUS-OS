import { api, isForbiddenError } from "../../../lib/api-client";
import { AdminAccessRequiredPanel } from "../../../components/AdminAccessRequiredPanel";
import { AdminSubNav } from "../../../components/AdminSubNav";
import { AdminAnalyticsRangeSelect } from "../../../components/AdminAnalyticsRangeSelect";
import { ShadowHealthCard } from "../../../components/ShadowHealthCard";
import { ShadowMetricsSummaryCards } from "../../../components/ShadowMetricsSummaryCards";
import { ShadowVolumeChart } from "../../../components/ShadowVolumeChart";
import { ShadowDisagreementChart } from "../../../components/ShadowDisagreementChart";
import { CATEGORY_LABEL, type DisagreementCategory } from "../../../components/DisagreementBadge";
import { PageHeader } from "../../../components/ui/PageHeader";
import type { AdminShadowHealthResponse, AdminShadowMetricsResponse } from "@argus/shared";

const VALID_RANGES = new Set([7, 14, 30, 90]);

// Shadow Dashboard UI -- the aggregate view deferred from Admin API
// Increment A, now that Decision Explorer gives operators a way to drill
// into any individual disagreement a chart here points at.
export default async function AdminAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ sinceDays?: string }>;
}) {
  const { sinceDays: rawSinceDays } = await searchParams;
  const parsed = rawSinceDays ? Number(rawSinceDays) : 7;
  const sinceDays = VALID_RANGES.has(parsed) ? parsed : 7;

  let metrics: AdminShadowMetricsResponse;
  let health: AdminShadowHealthResponse;
  try {
    [metrics, health] = await Promise.all([api.getShadowMetrics({ sinceDays }), api.getShadowHealth()]);
  } catch (err) {
    if (isForbiddenError(err)) return <AdminAccessRequiredPanel />;
    throw err;
  }

  const volumeData = metrics.volumeByDay.map((v) => ({
    day: new Date(v.day).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    "Shadow decisions": v.count,
  }));
  const disagreementData = metrics.disagreementBreakdown.map((d) => ({
    category: CATEGORY_LABEL[d.category as DisagreementCategory] ?? d.category,
    Count: d.count,
  }));

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <AdminSubNav />
      <PageHeader
        title="Shadow Mode Analytics"
        description={
          <>
            Cross-team aggregates{metrics.scope.teamId ? "" : " across all teams"} — see Shadow Decisions for
            individual rows.
          </>
        }
        actions={<AdminAnalyticsRangeSelect />}
      />

      <div className="space-y-6">
        <ShadowHealthCard health={health} />

        <ShadowMetricsSummaryCards metrics={metrics} />

        {metrics.totalShadowDecisions > 0 && (
          <>
            <section>
              <h2 className="text-section-label mb-3">
                Volume by day
              </h2>
              <ShadowVolumeChart data={volumeData} />
            </section>

            <section>
              <h2 className="text-section-label mb-3">
                Disagreement breakdown
              </h2>
              <ShadowDisagreementChart data={disagreementData} />
            </section>
          </>
        )}
      </div>
    </main>
  );
}
