import type { Verdict } from "@argus/shared";

const VERDICT_LABEL: Record<Verdict, string> = {
  STRONG_YES: "STRONG YES",
  YES: "YES",
  WAIT: "WAIT",
  PASS: "PASS",
  HARD_PASS: "HARD PASS",
};

const VERDICT_CLASSES: Record<Verdict, string> = {
  STRONG_YES: "bg-emerald-600",
  YES: "bg-green-500",
  WAIT: "bg-amber-500",
  PASS: "bg-orange-500",
  HARD_PASS: "bg-red-600",
};

export function VerdictBadge({ verdict }: { verdict: Verdict }) {
  return (
    <span
      className={`rounded-full px-3 py-1 text-xs font-bold text-white ${VERDICT_CLASSES[verdict]}`}
    >
      {VERDICT_LABEL[verdict]}
    </span>
  );
}
