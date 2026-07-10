import type { DecisionResponse } from "@argus/shared";
import { VERDICT_CLASSES, VERDICT_LABEL } from "../verdict-styles.js";

interface Props {
  decision: DecisionResponse;
}

// Bible §6.1 wireframe: "VERDICT: STRONG YES 94% conf" header card followed
// by a short reasoning summary.
export function VerdictCard({ decision }: Props) {
  const classes = VERDICT_CLASSES[decision.verdict];

  return (
    <div className={`rounded-lg border p-4 ring-1 ${classes.ring}`}>
      <div className="flex items-center justify-between">
        <span
          className={`rounded-full px-3 py-1 text-sm font-bold text-white ${classes.badge}`}
        >
          {VERDICT_LABEL[decision.verdict]}
        </span>
        <span className={`text-sm font-semibold ${classes.text}`}>
          {decision.confidence}% conf
        </span>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-gray-700">{decision.reasoning}</p>
    </div>
  );
}
