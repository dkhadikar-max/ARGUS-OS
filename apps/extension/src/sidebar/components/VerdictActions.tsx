import { useState } from "react";
import type { Verdict } from "@argus/shared";
import { VERDICT_LABEL } from "../verdict-styles.js";

interface Props {
  currentVerdict: Verdict;
  onAccept: (verdict: Verdict) => void;
  onOverride: (verdict: Verdict, reason?: string) => void;
  submitting: boolean;
  selectedVerdict: Verdict | null;
}

const ALL_VERDICTS: Verdict[] = ["STRONG_YES", "YES", "WAIT", "PASS", "HARD_PASS"];

// Bible §6.1 wireframe: "[STRONG YES] [YES] [WAIT] [PASS] [HARD PASS]" row
// plus an optional override-reason input.
export function VerdictActions({
  currentVerdict,
  onAccept,
  onOverride,
  submitting,
  selectedVerdict,
}: Props) {
  const [reason, setReason] = useState("");

  function handleClick(verdict: Verdict) {
    if (verdict === currentVerdict) {
      onAccept(verdict);
    } else {
      onOverride(verdict, reason.trim() || undefined);
    }
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-5 gap-1.5">
        {ALL_VERDICTS.map((verdict) => {
          const isSelected = selectedVerdict === verdict;
          const isOriginal = verdict === currentVerdict;
          return (
            <button
              key={verdict}
              type="button"
              disabled={submitting}
              onClick={() => handleClick(verdict)}
              aria-pressed={isSelected}
              className={`rounded border px-1.5 py-2 text-[11px] font-semibold leading-tight disabled:opacity-40 ${
                isSelected
                  ? "border-blue-600 bg-blue-600 text-white"
                  : isOriginal
                    ? "border-blue-300 bg-blue-50 text-blue-700"
                    : "border-gray-300 text-gray-700 hover:bg-gray-50"
              }`}
            >
              {VERDICT_LABEL[verdict]}
            </button>
          );
        })}
      </div>
      <input
        type="text"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Override reason (optional)"
        className="w-full rounded border border-gray-200 px-2 py-1.5 text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
      />
    </div>
  );
}
