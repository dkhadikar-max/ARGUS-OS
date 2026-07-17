import type { IcpCriterion } from "@argus/shared";

const OPERATORS: IcpCriterion["operator"][] = ["equals", "in", "gte", "lte", "between", "contains"];

// Bible §9.1 ICPDefinition.criteria's real Prospect model attributes
// (packages/database/prisma/schema.prisma) an ICP criterion can actually
// correlate against -- a curated dropdown avoids typos silently producing a
// criterion the ICP Agent can never match against real data. "Custom
// field..." keeps the underlying free-text escape hatch instead of
// hard-restricting what was previously any string.
const ICP_FIELD_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "companySize", label: "Company Size" },
  { value: "companyIndustry", label: "Industry" },
  { value: "companyFunding", label: "Funding Stage" },
  { value: "companyDomain", label: "Company Domain" },
  { value: "title", label: "Job Title" },
  { value: "location", label: "Location" },
];

const CUSTOM_FIELD_VALUE = "__custom__";

function isKnownField(field: string): boolean {
  return ICP_FIELD_OPTIONS.some((option) => option.value === field);
}

// Bible §9.1's icpCriterionSchema allows `value` to be a string[] (e.g. an
// "in" operator listing multiple industries) -- distinct from a plain
// string, which a single-value text field could never produce. A
// comma-separated input parses into the real array (trimmed, empty entries
// dropped) rather than one long string standing in for a list.
function parseListValue(raw: string): string[] {
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function listValueToInput(value: IcpCriterion["value"]): string {
  return Array.isArray(value) ? value.join(", ") : "";
}

interface Props {
  criteria: IcpCriterion[];
  onChange: (criteria: IcpCriterion[]) => void;
}

/**
 * The pure, controlled row-editing UI extracted out of IcpCriteriaEditor so
 * both the Settings page's ICP editor (which owns its own save button + the
 * updateIcpAction Server Action) and the onboarding wizard (which folds ICP
 * criteria into one combined submit alongside the company name) can share
 * the exact add/remove/operator/weight logic instead of two copies that
 * could silently drift apart.
 */
export function IcpCriteriaFields({ criteria, onChange }: Props) {
  const weightSum = criteria.reduce((total, c) => total + (Number.isFinite(c.weight) ? c.weight : 0), 0);

  function updateRow(index: number, patch: Partial<IcpCriterion>) {
    onChange(criteria.map((c, i) => (i === index ? { ...c, ...patch } : c)));
  }

  function handleOperatorChange(index: number, operator: IcpCriterion["operator"]) {
    onChange(
      criteria.map((c, i) => {
        if (i !== index) return c;
        if (operator === "in") {
          // Seed the array from whatever single value was already there,
          // rather than silently discarding it.
          const seeded = Array.isArray(c.value) ? c.value : c.value === "" ? [] : [String(c.value)];
          return { ...c, operator, value: seeded };
        }
        // Switching away from "in": collapse the array back to a plain
        // string instead of losing the data outright.
        return { ...c, operator, value: Array.isArray(c.value) ? c.value.join(", ") : c.value };
      }),
    );
  }

  function addRow() {
    onChange([...criteria, { field: "", operator: "equals", value: "", weight: 0 }]);
  }

  function removeRow(index: number) {
    onChange(criteria.filter((_, i) => i !== index));
  }

  return (
    <div>
      <p className="mb-2 text-xs text-gray-500">
        Assign a weight (0–1) to each criterion — all weights must sum to 100%.
      </p>
      {criteria.length > 0 && (
        <p className={`mb-2 text-xs ${Math.abs(weightSum - 1) > 0.02 ? "text-red-600" : "text-gray-500"}`}>
          Weights sum to {weightSum.toFixed(2)} (must be 1.00 to save)
        </p>
      )}

      <ul className="space-y-2">
        {criteria.map((criterion, index) => {
          const fieldIsCustom = criterion.field !== "" && !isKnownField(criterion.field);
          return (
            <li key={index} className="flex flex-wrap items-center gap-2 rounded-md border border-gray-200 p-2">
              <select
                value={fieldIsCustom ? CUSTOM_FIELD_VALUE : criterion.field}
                onChange={(e) =>
                  updateRow(index, { field: e.target.value === CUSTOM_FIELD_VALUE ? "" : e.target.value })
                }
                className="w-36 rounded border border-gray-300 px-2 py-1 text-sm"
              >
                <option value="" disabled>
                  Choose a field…
                </option>
                {ICP_FIELD_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
                <option value={CUSTOM_FIELD_VALUE}>Custom field…</option>
              </select>
              {fieldIsCustom && (
                <input
                  type="text"
                  placeholder="custom field name"
                  value={criterion.field}
                  onChange={(e) => updateRow(index, { field: e.target.value })}
                  className="w-32 rounded border border-gray-300 px-2 py-1 text-sm"
                />
              )}
              <select
                value={criterion.operator}
                onChange={(e) => handleOperatorChange(index, e.target.value as IcpCriterion["operator"])}
                className="rounded border border-gray-300 px-2 py-1 text-sm"
              >
                {OPERATORS.map((op) => (
                  <option key={op} value={op}>
                    {op}
                  </option>
                ))}
              </select>
              {criterion.operator === "in" ? (
                // Deliberately uncontrolled (defaultValue + onBlur, not
                // value + onChange): a controlled input whose value is
                // re-derived from the parsed array fights the user's typing
                // the moment they type a delimiter -- "SaaS," would
                // immediately re-render as "SaaS" (the trailing comma
                // stripped as an empty entry) before they can type the next
                // item, corrupting every subsequent character. Committing
                // only on blur means the field always shows exactly what
                // was typed.
                <input
                  type="text"
                  placeholder="value1, value2, value3"
                  defaultValue={listValueToInput(criterion.value)}
                  onBlur={(e) => updateRow(index, { value: parseListValue(e.target.value) })}
                  className="w-48 rounded border border-gray-300 px-2 py-1 text-sm"
                />
              ) : (
                <input
                  type="text"
                  placeholder="value"
                  value={String(criterion.value)}
                  onChange={(e) => updateRow(index, { value: e.target.value })}
                  className="w-32 rounded border border-gray-300 px-2 py-1 text-sm"
                />
              )}
              <input
                type="number"
                step="0.05"
                min={0}
                max={1}
                value={criterion.weight}
                onChange={(e) => updateRow(index, { weight: Number(e.target.value) })}
                className="w-20 rounded border border-gray-300 px-2 py-1 text-sm"
              />
              <button
                type="button"
                onClick={() => removeRow(index)}
                className="ml-auto text-xs font-medium text-red-600 hover:text-red-800"
              >
                Remove
              </button>
            </li>
          );
        })}
      </ul>

      <button
        type="button"
        onClick={addRow}
        className="mt-3 rounded border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
      >
        Add criterion
      </button>
    </div>
  );
}
