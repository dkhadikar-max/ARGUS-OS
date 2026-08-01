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
      {/* Design System Pass (2026-08-01) -- exact brand `alert` hex
          (#DC2626) instead of Tremor's named "red" swatch. Kept red, not
          teal -- disagreements are the one real "something's wrong" chart
          among these three, so red stays the correct semantic, just
          brand-exact now. */}
      <BarChart data={data} index="category" categories={["Count"]} colors={["#DC2626"]} yAxisWidth={40} />
    </Card>
  );
}
