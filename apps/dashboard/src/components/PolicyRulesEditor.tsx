"use client";

import { useState, useTransition } from "react";
import type { PolicyRule } from "@argus/shared";
import { updatePolicyAction } from "../app/settings/actions";

const FIELDS: PolicyRule["field"][] = ["verdict", "confidence", "prospect.title"];
const OPERATORS: PolicyRule["operator"][] = ["equals", "in", "gte", "lte", "contains"];
const ACTIONS: PolicyRule["action"][] = ["FLAG", "REQUIRE_APPROVAL", "BLOCK"];

// Same reasoning as IcpCriteriaEditor's parseListValue/listValueToInput --
// the "in" operator's value is a real string[] (see policy.ts), not a
// single string, so a comma-separated field parses into the array.
function parseListValue(raw: string): string[] {
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function listValueToInput(value: PolicyRule["value"]): string {
  return Array.isArray(value) ? value.join(", ") : "";
}

interface Props {
  initialRules: PolicyRule[];
}

// ARGUS Unanimous Policy v2.1 "L4 Policy Engine" (not the Bible -- see
// packages/shared/schemas/policy.ts). Mirrors IcpCriteriaEditor.tsx's own
// add/remove-row Client Component pattern exactly, including the "in"
// operator's uncontrolled-input handling (a controlled input whose value
// is re-derived from the parsed array fights the user's own typing the
// instant they type a delimiter -- see that component's own comment for
// the full explanation of why).
export function PolicyRulesEditor({ initialRules }: Props) {
  const [rules, setRules] = useState<PolicyRule[]>(initialRules);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  function updateRow(index: number, patch: Partial<PolicyRule>) {
    setRules((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  function handleOperatorChange(index: number, operator: PolicyRule["operator"]) {
    setRules((prev) =>
      prev.map((r, i) => {
        if (i !== index) return r;
        if (operator === "in") {
          const seeded = Array.isArray(r.value) ? r.value : r.value === "" ? [] : [String(r.value)];
          return { ...r, operator, value: seeded };
        }
        return { ...r, operator, value: Array.isArray(r.value) ? r.value.join(", ") : r.value };
      }),
    );
  }

  function addRow() {
    setRules((prev) => [
      ...prev,
      { field: "confidence", operator: "lte", value: "", action: "FLAG", message: "" },
    ]);
  }

  function removeRow(index: number) {
    setRules((prev) => prev.filter((_, i) => i !== index));
  }

  function handleSave() {
    setMessage(null);
    startTransition(async () => {
      const result = await updatePolicyAction(rules);
      setMessage(
        result.ok
          ? { kind: "success", text: "Policy saved." }
          : { kind: "error", text: result.error ?? "Failed to save policy." },
      );
    });
  }

  return (
    <div>
      <ul className="space-y-2">
        {rules.map((rule, index) => (
          <li key={index} className="flex flex-wrap items-center gap-2 rounded-md border border-gray-200 p-2">
            <select
              value={rule.field}
              onChange={(e) => updateRow(index, { field: e.target.value as PolicyRule["field"] })}
              className="rounded border border-gray-300 px-2 py-1 text-sm"
            >
              {FIELDS.map((field) => (
                <option key={field} value={field}>
                  {field}
                </option>
              ))}
            </select>
            <select
              value={rule.operator}
              onChange={(e) => handleOperatorChange(index, e.target.value as PolicyRule["operator"])}
              className="rounded border border-gray-300 px-2 py-1 text-sm"
            >
              {OPERATORS.map((op) => (
                <option key={op} value={op}>
                  {op}
                </option>
              ))}
            </select>
            {rule.operator === "in" ? (
              <input
                type="text"
                placeholder="value1, value2, value3"
                defaultValue={listValueToInput(rule.value)}
                onBlur={(e) => updateRow(index, { value: parseListValue(e.target.value) })}
                className="w-40 rounded border border-gray-300 px-2 py-1 text-sm"
              />
            ) : (
              <input
                type="text"
                placeholder="value"
                value={String(rule.value)}
                onChange={(e) => updateRow(index, { value: e.target.value })}
                className="w-28 rounded border border-gray-300 px-2 py-1 text-sm"
              />
            )}
            <select
              value={rule.action}
              onChange={(e) => updateRow(index, { action: e.target.value as PolicyRule["action"] })}
              className="rounded border border-gray-300 px-2 py-1 text-sm"
            >
              {ACTIONS.map((action) => (
                <option key={action} value={action}>
                  {action}
                </option>
              ))}
            </select>
            <input
              type="text"
              placeholder="message shown to the rep"
              value={rule.message}
              onChange={(e) => updateRow(index, { message: e.target.value })}
              className="w-56 rounded border border-gray-300 px-2 py-1 text-sm"
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
          Add rule
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={isPending}
          className="rounded bg-teal-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-700 disabled:opacity-40"
        >
          {isPending ? "Saving…" : "Save Policy"}
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
