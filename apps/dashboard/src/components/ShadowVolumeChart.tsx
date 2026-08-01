"use client";

import { BarChart, Card } from "@tremor/react";

interface Props {
  data: Array<{ day: string; "Shadow decisions": number }>;
}

// Same "use client" wrapper pattern as MeetingRateChart -- keeps
// valueFormatter (a function prop) off the RSC boundary; only serializable
// chart data crosses from the server page.
export function ShadowVolumeChart({ data }: Props) {
  return (
    <Card>
      <BarChart
        data={data}
        index="day"
        categories={["Shadow decisions"]}
        // Design System Pass (2026-08-01) -- brand Teal hex, see
        // MeetingRateChart.tsx's identical comment.
        colors={["#00D1C8"]}
        yAxisWidth={40}
      />
    </Card>
  );
}
