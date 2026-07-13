"use client";

import { BarChart, Card } from "@tremor/react";

interface Props {
  data: Array<{ verdict: string; "Meeting rate": number }>;
}

// Tremor's BarChart is a Client Component; a Server Component (analytics/
// page.tsx) can't pass it a function prop like valueFormatter directly --
// Next.js's RSC boundary only allows serializable props across that
// boundary. Wrapping it here keeps the formatter local to the client side,
// with only serializable chart data crossing from the server page.
export function MeetingRateChart({ data }: Props) {
  return (
    <Card>
      <BarChart
        data={data}
        index="verdict"
        categories={["Meeting rate"]}
        colors={["blue"]}
        valueFormatter={(value: number) => `${value}%`}
        yAxisWidth={48}
      />
    </Card>
  );
}
