"use client";

import { useState, useTransition } from "react";
import { icpWeightsAreValid, type IcpCriterion } from "@argus/shared";
import { updateIcpAction } from "../app/settings/actions";

const OPERATORS: IcpCriterion["operator"][] = ["equals", "in", "gte", "lte", "between", "contains"];

// Bible §9.1's icpCriterionSchema allows `value` to be a string[] (e.g. an
// "in" operator listing multiple industries) -- distinct from a plain
// string, which a single-value text field could never produce. A
// comma-separated input parses into the real array (trimmed, empty
// entries dropped) rather than one long string standing in for a list.
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
  initialCriteria: IcpCriterion[];
}

// Bible §18 DSH-5 "Team ICP editor" (P1). A dynamic add/remove list needs
// client state, so this is the one part of Settings that isn't a plain
// <form action> like the preferences form. The "in" operator gets its own
// comma-separated list input producing a real string[] (see
// parseListValue above); every other operator keeps the single-value text
// field, since only "in" has list semantics in icpCriterionSchema.
export function IcpCriteriaEditor({ initialCriteria }: Props) {
  const [criteria, setCriteria] = useState<IcpCriterion[]>(initialCriteria);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  const weightSum = criteria.reduce((total, c) => total + (Number.isFinite(c.weight) ? c.weight : 0), 0);
  // Same check icp.service.ts throws on server-side -- disables Save
  // instead of only showing the warning text and letting the round-trip
  // fail with a VALIDATION_ERROR the server was always going to reject.
  const weightsValid = icpWeightsAreValid(criteria);

  function updateRow(index: number, patch: Partial<IcpCriterion>) {
    setCriteria((prev) => prev.map((c, i) => (i === index ? { ...c, ...patch } : c)));
  }

  function handleOperatorChange(index: number, operator: IcpCriterion["operator"]) {
    setCriteria((prev) =>
      prev.map((c, i) => {
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
    setCriteria((prev) => [...prev, { field: "", operator: "equals", value: "", weight: 0 }]);
  }

  function removeRow(index: number) {
    setCriteria((prev) => prev.filter((_, i) => i !== index));
  }

  function handleSave() {
    setMessage(null);
    startTransition(async () => {
      const result = await updateIcpAction(criteria);
      setMessage(
        result.ok
          ? { kind: "success", text: "ICP saved." }
          : { kind: "error", text: result.error ?? "Failed to save ICP." },
      );
    });
  }

  return (
    <div>
      {criteria.length > 0 && (
        <p className={`mb-2 text-xs ${Math.abs(weightSum - 1) > 0.02 ? "text-red-600" : "text-gray-500"}`}>
          Weights sum to {weightSum.toFixed(2)} (must be 1.00 to save)
        </p>
      )}

      <ul className="space-y-2">
        {criteria.map((criterion, index) => (
          <li key={index} className="flex flex-wrap items-center gap-2 rounded-md border border-gray-200 p-2">
            <input
              type="text"
              placeholder="field (e.g. companySize)"
              value={criterion.field}
              onChange={(e) => updateRow(index, { field: e.target.value })}
              className="w-40 rounded border border-gray-300 px-2 py-1 text-sm"
            />
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
        ))}
      </ul>

      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={addRow}
          className="rounded border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
        >
          Add criterion
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={isPending || !weightsValid}
          className="rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-40"
        >
          {isPending ? "Saving…" : "Save ICP"}
        </button>
        {message && (
          <span className={`text-xs ${message.kind === "success" ? "text-green-700" : "text-red-600"}`}>
            {message.text}
          </span>
        )}
      </div>
    </div>
  );
}
