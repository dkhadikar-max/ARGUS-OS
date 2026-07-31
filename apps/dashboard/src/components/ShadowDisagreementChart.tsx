"use client";

import { BarChart, Card } from "@tremor/react";

interface Props {
  data: Array<{ category: string; Count: number }>;
}

export function ShadowDisagreementChart({ data }: Props) {
  if (data.length === 0) {
    return (
      <Card>
        <p className="text-sm text-gray-500">No disagreements recorded in this window.</p>
      </Card>
    );
  }

  return (
    <Card>
      <BarChart data={data} index="category" categories={["Count"]} colors={["red"]} yAxisWidth={40} />
    </Card>
  );
}
