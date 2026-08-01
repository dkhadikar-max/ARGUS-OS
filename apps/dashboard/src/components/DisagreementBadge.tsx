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
    // Design System Pass (2026-08-01) -- teal-50/700 instead of default
    // Tailwind emerald: this app has no separate "positive" green token
    // (signal is aliased to teal, matching apps/website's own decision).
    return (
      <span className="rounded-full bg-teal-50 px-2.5 py-1 text-xs font-medium text-teal-700">
        Agreement
      </span>
    );
  }

  if (disagreementCategories.length === 0) {
    // No taxonomy category fired despite verdictAgreement being false --
    // still a real disagreement (confidenceDelta-only, or a category this
    // taxonomy doesn't cover), not a bug to hide.
    return (
      <span className="rounded-full bg-alert/10 px-2.5 py-1 text-xs font-medium text-alert">
        Disagreement
      </span>
    );
  }

  return (
    <span className="flex flex-wrap gap-1">
      {disagreementCategories.map((category) => (
        <span
          key={category}
          className="rounded-full bg-alert/10 px-2.5 py-1 text-xs font-medium text-alert"
        >
          {CATEGORY_LABEL[category]}
        </span>
      ))}
    </span>
  );
}
