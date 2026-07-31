import type { AdminListShadowDecisionsResponse } from "@argus/shared";

export type DisagreementCategory = AdminListShadowDecisionsResponse["data"][number]["disagreementCategories"][number];

// Same Record<K,string> lookup-table pattern as VerdictBadge.tsx. Exported
// so DisagreementTaxonomyList reuses the same labels rather than
// duplicating them.
export const CATEGORY_LABEL: Record<DisagreementCategory, string> = {
  verdict_mismatch: "Verdict mismatch",
  confidence_threshold_exceeded: "Confidence delta",
  controller_action_mismatch: "Controller mismatch",
  runtime_error: "Runtime error",
  schema_error: "Schema error",
  missing_capability_output: "Missing output",
};

export function DisagreementBadge({
  verdictAgreement,
  disagreementCategories,
}: {
  verdictAgreement: boolean;
  disagreementCategories: DisagreementCategory[];
}) {
  if (verdictAgreement && disagreementCategories.length === 0) {
    return (
      <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
        Agreement
      </span>
    );
  }

  if (disagreementCategories.length === 0) {
    // No taxonomy category fired despite verdictAgreement being false --
    // still a real disagreement (confidenceDelta-only, or a category this
    // taxonomy doesn't cover), not a bug to hide.
    return (
      <span className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700">
        Disagreement
      </span>
    );
  }

  return (
    <span className="flex flex-wrap gap-1">
      {disagreementCategories.map((category) => (
        <span
          key={category}
          className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700"
        >
          {CATEGORY_LABEL[category]}
        </span>
      ))}
    </span>
  );
}
