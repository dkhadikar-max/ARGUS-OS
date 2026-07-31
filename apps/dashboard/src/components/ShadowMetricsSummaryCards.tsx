import { Card, Metric, Text } from "@tremor/react";
import type { AdminShadowMetricsResponse } from "@argus/shared";

type Metrics = Omit<AdminShadowMetricsResponse, "scope" | "disagreementBreakdown" | "volumeByDay">;

// No function props cross this boundary (Card/Metric/Text take plain
// values), so unlike MeetingRateChart this doesn't need its own "use
// client" wrapper -- matches analytics/page.tsx's own direct Card/Metric
// usage inside a Server Component.
export function ShadowMetricsSummaryCards({ metrics }: { metrics: Metrics }) {
  if (metrics.totalShadowDecisions === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center">
        <p className="text-sm font-medium text-gray-900">No shadow decisions in this window</p>
        <p className="mt-1 text-sm text-gray-500">
          Metrics fill in once Shadow Mode starts sampling live traffic (SHADOW_SAMPLE_RATE_PERCENT &gt; 0).
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Card>
        <Text>Shadow decisions</Text>
        <Metric>{metrics.totalShadowDecisions}</Metric>
      </Card>
      <Card>
        <Text>Verdict agreement rate</Text>
        <Metric>{Math.round(metrics.verdictAgreementRate * 100)}%</Metric>
      </Card>
      <Card>
        <Text>Avg confidence delta</Text>
        <Metric>
          {metrics.avgConfidenceDelta > 0 ? "+" : ""}
          {metrics.avgConfidenceDelta.toFixed(1)}
        </Metric>
        <Text className="mt-1">
          Median {metrics.p50ConfidenceDelta > 0 ? "+" : ""}
          {metrics.p50ConfidenceDelta}
        </Text>
      </Card>
      <Card>
        <Text>Inference cost (shadow)</Text>
        <Metric>${metrics.totalCostUsd.toFixed(2)}</Metric>
        <Text className="mt-1">${metrics.avgCostUsd.toFixed(4)} / decision</Text>
      </Card>
    </div>
  );
}
