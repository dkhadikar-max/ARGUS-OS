import { Card } from "./ui/Card";

// Complete the Redesign (2026-08-02) -- large, single-number KPI card for
// the Performance page's hero row. Originally built on Tremor's own
// Card/Metric/Text -- reverted to this app's own ui/Card primitive after
// confirming in production that Tremor's Card never gets its
// border/shadow/padding classes generated at all (a real, broader version
// of the same Tailwind-v4-doesn't-scan-node_modules gap found earlier for
// MeetingRateChart's "h-80" class -- it affects Card's own styling too,
// not just chart height). This app's own Card lives in src/, which
// Tailwind's content scanner always sees correctly, so it has none of
// that fragility.
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
    <Card className="p-4">
      <p className="text-sm text-gray-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold text-gray-900 ${valueClassName ?? ""}`}>{value}</p>
      {caption && <p className="mt-1 text-sm text-gray-500">{caption}</p>}
    </Card>
  );
}
