import { useState } from "react";
import type { DecisionResponse } from "@argus/shared";

interface Props {
  evidence: DecisionResponse["evidence"];
}

// Bible §6.1 wireframe "EVIDENCE" section, §19.1 QA: "Evidence cards
// expand/collapse correctly".
export function EvidenceAccordion({ evidence }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(evidence[0]?.id ?? null);

  if (evidence.length === 0) {
    return <p className="text-sm text-gray-500">No supporting evidence available.</p>;
  }

  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
        Evidence
      </h3>
      <ul className="divide-y divide-gray-100 rounded-lg border border-gray-100">
        {evidence.map((item) => {
          const isExpanded = expandedId === item.id;
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => setExpandedId(isExpanded ? null : item.id)}
                aria-expanded={isExpanded}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
              >
                <span className="font-medium text-gray-800">{item.signal}</span>
                <span className="shrink-0 text-xs text-gray-400">
                  {item.confidence}% · {isExpanded ? "−" : "+"}
                </span>
              </button>
              {isExpanded && (
                <p className="px-3 pb-3 text-xs text-gray-500">{item.relevance}</p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
