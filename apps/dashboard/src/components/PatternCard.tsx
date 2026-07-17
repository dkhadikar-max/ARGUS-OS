import type { CompanyMemoryPattern } from "@argus/shared";

// Bible §18 DSH-4 "Patterns display" (P1).
export function PatternCard({ pattern }: { pattern: CompanyMemoryPattern }) {
  return (
    <li className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <p className="text-sm font-medium text-gray-900">{pattern.description}</p>
        <span className="shrink-0 rounded-full bg-teal-50 px-2.5 py-1 text-xs font-semibold text-teal-700">
          {pattern.confidence}% confidence
        </span>
      </div>
      <p className="mt-1 text-sm text-gray-500">{pattern.evidence}</p>
    </li>
  );
}
