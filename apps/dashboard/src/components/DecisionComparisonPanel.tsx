import type { Verdict } from "@argus/shared";
import { VerdictBadge } from "./VerdictBadge";

interface Side {
  verdict: Verdict;
  confidence: number;
  reasoning: string;
  recommendedAction: string | null;
}

export function DecisionComparisonPanel({ live, shadow }: { live: Side; shadow: Side }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {[
        { label: "Live", side: live },
        { label: "Shadow", side: shadow },
      ].map(({ label, side }) => (
        <div key={label} className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</p>
          <div className="mt-2 flex items-center gap-2">
            <VerdictBadge verdict={side.verdict} />
            <span className="text-sm font-medium text-gray-600">{side.confidence}%</span>
          </div>
          {side.recommendedAction && (
            <p className="mt-2 text-xs font-medium text-teal-700">{side.recommendedAction.replaceAll("_", " ")}</p>
          )}
          <p className="mt-2 text-sm text-gray-700">{side.reasoning}</p>
        </div>
      ))}
    </div>
  );
}
