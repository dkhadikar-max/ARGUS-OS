import type { EvidenceCard } from "@argus/shared";
import { Card } from "./ui/Card";

// Live-decision only -- Evidence.decisionId only ever points at the live
// Decision (the shadow run's own evidence, if any, isn't persisted
// separately from its agentOutputs).
export function EvidenceSummaryList({ evidence }: { evidence: EvidenceCard[] }) {
  if (evidence.length === 0) {
    return (
      <Card variant="dashed" className="p-6">
        <p className="text-sm font-medium text-gray-900">No evidence recorded</p>
        <p className="mt-1 text-sm text-gray-500">This decision's live run had no enrichment evidence attached.</p>
      </Card>
    );
  }

  return (
    <ul className="space-y-2">
      {evidence.map((e) => (
        <li key={e.id} className="rounded-lg border border-gray-200 bg-white p-3">
          <div className="flex items-center justify-between gap-4">
            <span className="text-section-label">{e.type}</span>
            <span className="text-xs text-gray-500">{e.confidence}% confidence</span>
          </div>
          <p className="mt-1 text-sm text-gray-800">{e.signal || "—"}</p>
          {e.relevance && <p className="mt-1 text-xs text-gray-500">{e.relevance}</p>}
        </li>
      ))}
    </ul>
  );
}
