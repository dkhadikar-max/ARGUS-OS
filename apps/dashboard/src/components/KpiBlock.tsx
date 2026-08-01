import { Card, Metric, Text } from "@tremor/react";

// Complete the Redesign (2026-08-02) -- large, single-number KPI card for
// the Performance page's hero row. Purely presentational (Tremor Card/
// Metric/Text, same primitives already used elsewhere on this page) --
// every value passed in must already be real; this never computes or
// invents a number itself.
export function KpiBlock({
  label,
  value,
  caption,
  valueClassName,
}: {
  label: string;
  value: string;
  caption?: string;
  valueClassName?: string;
}) {
  return (
    <Card>
      <Text>{label}</Text>
      <Metric className={valueClassName}>{value}</Metric>
      {caption && <Text className="mt-1">{caption}</Text>}
    </Card>
  );
}
