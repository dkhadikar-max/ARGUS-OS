"use client";

import { useTeamSocket } from "../lib/useTeamSocket";

// Bible §18 BCK-6 (Socket.io real-time updates) surfaced in the one place
// DSH-2's Today Queue can show it without rebuilding the page's own
// server-rendered data model: a lightweight live feed of decisions/outcomes
// as teammates create them, alongside (not replacing) the queue itself.
export function LiveQueueBanner() {
  const events = useTeamSocket();

  if (events.length === 0) return null;

  return (
    <ul className="mb-4 space-y-1.5" aria-live="polite">
      {events.map((event, index) => (
        <li
          key={`${event.type}-${event.data.decisionId}-${index}`}
          className="rounded-md bg-blue-50 px-3 py-2 text-sm text-blue-800"
        >
          {event.type === "decision.created" ? (
            <>
              New decision: <strong>{event.data.prospectName}</strong> — {event.data.verdict} (
              {event.data.confidence}%)
            </>
          ) : (
            <>Outcome logged: {event.data.outcomeType.replaceAll("_", " ").toLowerCase()}</>
          )}
        </li>
      ))}
    </ul>
  );
}
