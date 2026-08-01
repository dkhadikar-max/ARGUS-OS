"use client";

import { useEffect, useState } from "react";
import type { ActionType, DecisionResponse, QueueItem } from "@argus/shared";
import { VerdictBadge } from "../VerdictBadge";
import { EvidenceSummaryList } from "../EvidenceSummaryList";
import { verdictBucket } from "../../lib/verdictBucket";

// The other 5 real ActionType values (Bible §9.1) -- unwired anywhere in
// the dashboard before this pass, tucked into a "More" menu rather than
// given equal visual weight to Message/Skip. No details-collection UI
// for any of these yet (e.g. a real meeting time for MEETING_BOOKED) --
// recording the bare action type is itself real progress over "not
// recordable at all", and richer per-action UI is real future work, not
// fabricated here.
const MORE_ACTIONS: { actionType: ActionType; label: string }[] = [
  { actionType: "MESSAGE_SENT", label: "Mark message sent" },
  { actionType: "CRM_UPDATED", label: "Mark CRM updated" },
  { actionType: "MEETING_BOOKED", label: "Mark meeting booked" },
  { actionType: "SNOOZED", label: "Snooze" },
  { actionType: "RESEARCHED_MORE", label: "Mark researched further" },
];

// "Reasoning as 2-3 short lines, not a wall of text" -- real reasoning
// text, just the first sentences, never a fabricated summary.
function firstSentences(text: string, max = 2): string {
  const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean);
  return sentences.slice(0, max).join(" ");
}

// Decision Workspace, center pane -- presentational. The header renders
// instantly from `item` (already in memory from the Queue pane's own
// fetch); `decision`/`loading`/`error` are owned by QueueWorkspace (one
// fetch per selection, shared with the Memory pane's relevance ordering
// rather than each pane fetching its own copy).
export function DecisionWorkspacePane({
  item,
  decision,
  loading,
  error,
  onAction,
}: {
  item: QueueItem;
  decision: DecisionResponse | null;
  loading: boolean;
  error: string | null;
  onAction: (item: QueueItem, actionType: ActionType, label: string, details?: Record<string, unknown>) => void;
}) {
  const [evidenceExpanded, setEvidenceExpanded] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [messageError, setMessageError] = useState<string | null>(null);

  useEffect(() => {
    setEvidenceExpanded(false);
    setMoreOpen(false);
    setCopied(false);
    setMessageError(null);
  }, [item.decisionId]);

  async function handleMessage() {
    if (!decision) return;
    const body = decision.message.linkedin ?? decision.message.email;
    if (!body) {
      setMessageError("No message was generated for this decision.");
      return;
    }
    await navigator.clipboard.writeText(body);
    setCopied(true);
    onAction(item, "MESSAGE_COPIED", `Messaged ${item.prospect.name}`, {
      channel: decision.message.linkedin ? "LINKEDIN" : "EMAIL",
    });
  }

  function handleSkip() {
    // Doesn't need the full decision -- Skip is real regardless of
    // whether the message draft has loaded yet.
    onAction(item, "PASSED", `Skipped ${item.prospect.name}`);
  }

  const bucket = verdictBucket(item.verdict);

  return (
    <div className="flex h-full flex-col overflow-y-auto p-6">
      <div>
        <div className="flex items-center gap-2">
          <VerdictBadge verdict={item.verdict} />
          <span className="text-xs font-medium text-gray-500">{bucket}</span>
          <span className="text-sm font-semibold text-gray-700">{item.confidence}%</span>
        </div>
        <h2 className="mt-2 text-lg font-bold text-gray-900">
          {item.prospect.name}
          {item.prospect.title ? `, ${item.prospect.title}` : ""}
          {item.prospect.companyName ? ` @ ${item.prospect.companyName}` : ""}
        </h2>
        <a
          href={item.prospect.linkedInUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-medium text-teal-700 hover:underline"
        >
          View on LinkedIn ↗
        </a>
      </div>

      {(error || messageError) && <p className="mt-3 text-xs text-alert">{error ?? messageError}</p>}

      <section className="mt-4">
        {loading ? (
          <div className="h-12 animate-pulse rounded bg-gray-100" />
        ) : (
          decision && <p className="text-sm text-gray-700">{firstSentences(decision.reasoning)}</p>
        )}
      </section>

      <section className="mt-4 flex items-center gap-2">
        <button
          type="button"
          onClick={handleMessage}
          disabled={loading || !decision}
          className="rounded-md bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-40"
        >
          {copied ? "Copied!" : loading ? "Loading…" : "Message"}
        </button>
        <button
          type="button"
          onClick={handleSkip}
          className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Skip
        </button>
        <div className="relative">
          <button
            type="button"
            onClick={() => setMoreOpen((prev) => !prev)}
            aria-expanded={moreOpen}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            More
          </button>
          {moreOpen && (
            <ul className="absolute left-0 z-10 mt-1 w-48 rounded-md border border-gray-200 bg-white py-1 shadow-lg">
              {MORE_ACTIONS.map(({ actionType, label }) => (
                <li key={actionType}>
                  <button
                    type="button"
                    onClick={() => {
                      setMoreOpen(false);
                      onAction(item, actionType, `${label} — ${item.prospect.name}`);
                    }}
                    className="block w-full px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50"
                  >
                    {label}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="mt-6">
        <button
          type="button"
          onClick={() => setEvidenceExpanded((prev) => !prev)}
          className="text-section-label flex w-full items-center justify-between"
        >
          <span>
            Evidence
            {decision ? ` — ${decision.evidence.length} signal${decision.evidence.length === 1 ? "" : "s"}` : ""}
          </span>
          <span>{evidenceExpanded ? "▲" : "▼"}</span>
        </button>
        {evidenceExpanded && decision && (
          <div className="mt-2">
            <EvidenceSummaryList evidence={decision.evidence} />
          </div>
        )}
      </section>

      {/* True by construction: queue.repository.ts already excludes any
          decision with an outcome logged, so every item shown here
          genuinely has none yet -- not a fabricated logging UI. */}
      <section className="mt-6 border-t border-gray-100 pt-4">
        <p className="text-section-label">Outcome</p>
        <p className="mt-1 text-sm text-gray-500">Pending — no outcome logged yet</p>
      </section>
    </div>
  );
}
