import { CATEGORY_LABEL, type DisagreementCategory } from "./DisagreementBadge";
import { Card } from "./ui/Card";

interface Props {
  verdictAgreement: boolean;
  controllerComparisonApplicable: boolean;
  disagreementCategories: DisagreementCategory[];
}

export function DisagreementTaxonomyList({ verdictAgreement, controllerComparisonApplicable, disagreementCategories }: Props) {
  return (
    <Card className="p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Disagreement taxonomy</p>
      {disagreementCategories.length === 0 ? (
        <p className="mt-2 text-sm text-gray-700">
          {verdictAgreement ? "No disagreement detected." : "Disagreement detected, but no taxonomy category fired."}
        </p>
      ) : (
        <ul className="mt-2 space-y-1">
          {disagreementCategories.map((category) => (
            <li key={category} className="rounded border-l-2 border-red-400 bg-red-50 p-2 text-xs text-red-800">
              {CATEGORY_LABEL[category]}
            </li>
          ))}
        </ul>
      )}
      {!controllerComparisonApplicable && (
        <p className="mt-2 text-xs text-gray-400">
          Controller comparison not applicable — the live decision had no real controller cycle to compare against
          (legacy pipeline or a debate-cache hit).
        </p>
      )}
    </Card>
  );
}
