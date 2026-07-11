"use client";

import { useState, useTransition } from "react";
import type { IcpCriterion } from "@argus/shared";
import { updateIcpAction } from "../app/settings/actions";

const OPERATORS: IcpCriterion["operator"][] = ["equals", "in", "gte", "lte", "between", "contains"];

interface Props {
  initialCriteria: IcpCriterion[];
}

// Bible §18 DSH-5 "Team ICP editor" (P1). A dynamic add/remove list needs
// client state, so this is the one part of Settings that isn't a plain
// <form action> like the preferences form. `value` is edited as a single
// text field here -- icpCriterionSchema also allows a string[] (e.g. an
// "in" operator listing multiple industries), which this simplified editor
// can't produce distinctly from a comma-free string; a real multi-value
// input is future polish, not a data-model gap.
export function IcpCriteriaEditor({ initialCriteria }: Props) {
  const [criteria, setCriteria] = useState<IcpCriterion[]>(initialCriteria);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  const weightSum = criteria.reduce((total, c) => total + (Number.isFinite(c.weight) ? c.weight : 0), 0);

  function updateRow(index: number, patch: Partial<IcpCriterion>) {
    setCriteria((prev) => prev.map((c, i) => (i === index ? { ...c, ...patch } : c)));
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
              onChange={(e) => updateRow(index, { operator: e.target.value as IcpCriterion["operator"] })}
              className="rounded border border-gray-300 px-2 py-1 text-sm"
            >
              {OPERATORS.map((op) => (
                <option key={op} value={op}>
                  {op}
                </option>
              ))}
            </select>
            <input
              type="text"
              placeholder="value"
              value={String(criterion.value)}
              onChange={(e) => updateRow(index, { value: e.target.value })}
              className="w-32 rounded border border-gray-300 px-2 py-1 text-sm"
            />
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
          disabled={isPending}
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
