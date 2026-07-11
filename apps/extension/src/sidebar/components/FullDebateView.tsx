import { useEffect, useRef } from "react";
import type { DecisionResponse } from "@argus/shared";
import { VERDICT_CLASSES, VERDICT_LABEL } from "../verdict-styles.js";
import { track } from "../../lib/analytics.js";

interface Props {
  decision: DecisionResponse;
  onBack: () => void;
}

function AgentSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-gray-200 p-3">
      <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">{title}</h3>
      <div className="space-y-1 text-sm text-gray-700">{children}</div>
    </div>
  );
}

// Bible §6.5 "Full Debate View — Deep Inspection" -- shows every specialist
// agent's own reasoning (not just the Judge's summary `reasoning` string the
// main card already renders), reached via a "View full debate" link from the
// sidebar. Fetched on demand (GET /api/v1/decisions/{id}, which always
// includes `debate` -- see decision.service.ts) rather than on every initial
// load, matching why the create-decision call itself passes
// `includeDebate: false` (Bible §10.2's own worked examples all do).
export function FullDebateView({ decision, onBack }: Props) {
  const classes = VERDICT_CLASSES[decision.verdict];
  const debate = decision.debate;
  const mountedAt = useRef(performance.now());

  // Bible §11.1 full_debate_viewed: fires on leaving this view (not
  // entering), so `time_spent_ms` is a real measured duration instead of a
  // fabricated 0 -- the schema requires it (unlike queue_viewed's optional
  // time_spent_ms). `agent_viewed: "all"` is honest, not a placeholder: this
  // pass renders every agent's section at once rather than a tabbed
  // one-at-a-time view, so there's no single agent to report distinctly.
  useEffect(() => {
    return () => {
      track({
        name: "full_debate_viewed",
        properties: {
          decision_id: decision.id,
          agent_viewed: "all",
          time_spent_ms: Math.round(performance.now() - mountedAt.current),
        },
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-3 p-4">
      <button
        type="button"
        onClick={onBack}
        className="text-xs font-medium text-blue-700 hover:underline"
      >
        ← Back to Sidebar
      </button>

      <p className="text-sm font-semibold text-gray-900">
        {decision.prospect.name}
        {decision.prospect.title ? `, ${decision.prospect.title}` : ""}
        {decision.prospect.companyName ? ` @ ${decision.prospect.companyName}` : ""}
      </p>

      {!debate ? (
        <p className="text-sm text-gray-500">
          Full debate detail isn't available for this decision (it predates this feature).
        </p>
      ) : (
        <>
          <AgentSection title="Research Agent">
            <p>{debate.research.summary}</p>
            <ul className="list-inside list-disc space-y-0.5 text-xs text-gray-600">
              {debate.research.data_points.map((dp, i) => (
                <li key={i}>
                  <span className="italic">{dp.type}</span> {dp.signal} — {dp.relevance}
                </li>
              ))}
            </ul>
          </AgentSection>

          <AgentSection title={`ICP Agent — ${debate.icp.score}/100`}>
            <p>{debate.icp.overall_assessment}</p>
            <ul className="list-inside list-disc space-y-0.5 text-xs text-gray-600">
              {debate.icp.criteria_evaluated.map((c, i) => (
                <li key={i}>
                  {c.criterion} ({Math.round(c.match * 100)}% match): {c.reasoning}
                </li>
              ))}
            </ul>
          </AgentSection>

          <AgentSection title={`Intent Agent — ${debate.intent.score}/100 (${debate.intent.trajectory})`}>
            <ul className="list-inside list-disc space-y-0.5 text-xs text-gray-600">
              {debate.intent.signals.map((s, i) => (
                <li key={i}>
                  {s.signal} — +{s.weighted_score} pts: {s.reasoning}
                </li>
              ))}
            </ul>
          </AgentSection>

          <AgentSection title={`Risk Agent — ${debate.risk.score}/100`}>
            <p className="text-xs text-gray-600">
              Time-waste probability: {debate.risk.time_waste_probability}%
            </p>
            <ul className="list-inside list-disc space-y-0.5 text-xs text-gray-600">
              {debate.risk.risks.map((r, i) => (
                <li key={i}>
                  <span className="font-medium">{r.severity}</span> {r.category}: {r.description}
                </li>
              ))}
            </ul>
          </AgentSection>

          <div className={`rounded-lg border p-3 ring-1 ${classes.ring}`}>
            <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
              Judge Agent
            </h3>
            <span className={`rounded-full px-2.5 py-1 text-xs font-bold text-white ${classes.badge}`}>
              {VERDICT_LABEL[decision.verdict]}
            </span>
            <span className={`ml-2 text-xs font-semibold ${classes.text}`}>
              {debate.judge.confidence}% confidence
            </span>
            <p className="mt-2 text-xs text-gray-500">
              Weighted aggregation: ICP (40%) + Intent (35%) + Risk (15%) + Research (10%) ={" "}
              {debate.judge.weighted_score}%
            </p>
            <p className="mt-2 text-sm text-gray-700">{debate.judge.reasoning}</p>
          </div>
        </>
      )}
    </div>
  );
}
