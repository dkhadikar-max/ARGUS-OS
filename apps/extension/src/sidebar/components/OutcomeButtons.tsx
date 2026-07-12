import { useState } from "react";
import type { OutcomeType } from "@argus/shared";
import { api } from "../../lib/api-client.js";

interface Props {
  decisionId: string;
  existingOutcome: { type: string; loggedAt: string } | null | undefined;
}

const OUTCOME_BUTTONS: Array<{ type: OutcomeType; label: string }> = [
  { type: "NO_RESPONSE", label: "No response →" },
  { type: "MEETING_BOOKED", label: "Meeting booked →" },
];

const OUTCOME_TYPE_LABEL: Partial<Record<OutcomeType, string>> = {
  NO_RESPONSE: "No response",
  MEETING_BOOKED: "Meeting booked",
};

// Bible §6.1 wireframe's 1-click outcome buttons. "I messaged them" is
// already covered by MessageComposer's Copy button, which records a
// MESSAGE_COPIED ActionTaken (Bible §5.1/§5.2) -- this component covers what
// happens *after* that: the two Outcome types a rep can report inline
// without leaving the sidebar. outcome.service.ts's createOutcome already
// fires its own server-side `outcome_logged` PostHog event (Bible §11.1),
// so this component doesn't duplicate that call client-side.
export function OutcomeButtons({ decisionId, existingOutcome }: Props) {
  const [logged, setLogged] = useState(existingOutcome ?? null);
  const [submitting, setSubmitting] = useState<OutcomeType | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleLog(type: OutcomeType) {
    setSubmitting(type);
    setError(null);
    try {
      const result = await api.createOutcome({ decisionId, type });
      setLogged({ type: result.type, loggedAt: result.loggedAt });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to log outcome.");
    } finally {
      setSubmitting(null);
    }
  }

  if (logged) {
    return (
      <p className="text-xs text-gray-500">
        Outcome logged: <span className="font-medium text-gray-700">{OUTCOME_TYPE_LABEL[logged.type as OutcomeType] ?? logged.type}</span>
      </p>
    );
  }

  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">What happened?</h3>
      <div className="flex flex-wrap gap-2 text-xs font-medium">
        {OUTCOME_BUTTONS.map(({ type, label }) => (
          <button
            key={type}
            type="button"
            onClick={() => handleLog(type)}
            disabled={submitting !== null}
            className="rounded border border-gray-300 px-3 py-1.5 text-gray-700 hover:bg-gray-50 disabled:opacity-40"
          >
            {submitting === type ? "Logging…" : label}
          </button>
        ))}
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}
