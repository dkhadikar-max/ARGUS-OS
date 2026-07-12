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
      {/* ARGUS Unanimous Policy v2.1 L4 Policy Engine (not the Bible) --
          same proactive display QueueItemCard.tsx and the Slack alert
          already use, so a rep sees a BLOCK/REQUIRE_APPROVAL/FLAG before
          acting, not only from a BLOCK flag's own rejection after the fact. */}
      {decision.policyFlags && decision.policyFlags.length > 0 && (
        <ul className="mt-3 space-y-1">
          {decision.policyFlags.map((flag, i) => (
            <li
              key={i}
              className={`rounded border-l-2 p-2 text-xs ${
                flag.action === "BLOCK"
                  ? "border-red-400 bg-red-50 text-red-700"
                  : "border-amber-400 bg-amber-50 text-amber-800"
              }`}
            >
              <span className="font-semibold">{flag.action}:</span> {flag.message}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-sm leading-relaxed text-gray-700">{decision.reasoning}</p>
    </div>
  );
}
