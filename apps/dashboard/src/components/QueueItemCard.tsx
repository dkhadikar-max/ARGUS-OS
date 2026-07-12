"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { DecisionResponse, QueueItem } from "@argus/shared";
import { VerdictBadge } from "./VerdictBadge";
import { track } from "../lib/analytics";
import { getFullDecisionAction, recordQueueActionAction } from "../app/queue/actions";

// Bible §6.2 Today Queue wireframe: "#1 STRONG YES 96% Sarah Chen, VP Eng
// @ DataFlow — New since yesterday · ICP match · Intent hot — [View]
// [Message] [Snooze]". These now do exactly what the wireframe shows,
// backed by the ActionTaken endpoint (see README "Wiring Today Queue
// action buttons"). [View] lazy-loads the full decision (message, evidence,
// reasoning) the queue list response doesn't carry -- `messagePreview`
// there is a 120-char summary, not the real body.
export function QueueItemCard({ item }: { item: QueueItem }) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [decision, setDecision] = useState<DecisionResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [pendingAction, setPendingAction] = useState<"message" | "snooze" | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ensureFullDecision(): Promise<DecisionResponse | null> {
    if (decision) return decision;
    setLoading(true);
    setError(null);
    const result = await getFullDecisionAction(item.decisionId);
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      return null;
    }
    setDecision(result.decision);
    return result.decision;
  }

  async function handleView() {
    if (!expanded) {
      // Bible §11.1 queue_item_clicked: "User clicks queue item".
      track({
        name: "queue_item_clicked",
        properties: { decision_id: item.decisionId, rank: item.rank, verdict: item.verdict },
      });
      await ensureFullDecision();
    }
    setExpanded((prev) => !prev);
  }

  async function handleMessage() {
    const full = await ensureFullDecision();
    if (!full) return;

    const body = full.message.linkedin ?? full.message.email;
    if (!body) {
      setError("No message was generated for this decision.");
      return;
    }

    await navigator.clipboard.writeText(body);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
    setExpanded(true);

    setPendingAction("message");
    const result = await recordQueueActionAction(item.decisionId, "MESSAGE_COPIED", {
      channel: full.message.linkedin ? "LINKEDIN" : "EMAIL",
    });
    setPendingAction(null);
    if (!result.ok) setError(result.error ?? "Failed to record this action.");
    router.refresh();
  }

  async function handleSnooze() {
    setPendingAction("snooze");
    const result = await recordQueueActionAction(item.decisionId, "SNOOZED");
    setPendingAction(null);
    if (!result.ok) setError(result.error ?? "Failed to record this action.");
    router.refresh();
  }

  return (
    <li className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-400">#{item.rank}</span>
            <VerdictBadge verdict={item.verdict} />
            <span className="text-sm font-medium text-gray-600">{item.confidence}%</span>
          </div>
          <p className="mt-2 truncate text-sm font-semibold text-gray-900">
            {item.prospect.name}
            {item.prospect.title ? `, ${item.prospect.title}` : ""}
            {item.prospect.companyName ? ` @ ${item.prospect.companyName}` : ""}
          </p>
          <p className="mt-1 text-sm text-gray-500">
            {item.reason} · {item.lastActivity}
          </p>
          <p className="mt-1 text-xs font-medium text-blue-700">{item.suggestedAction}</p>
          <a
            href={item.prospect.linkedInUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-block text-xs font-medium text-blue-700 hover:underline"
          >
            View on LinkedIn ↗
          </a>
        </div>

        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={handleView}
            disabled={loading}
            className="rounded border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
          >
            {loading ? "Loading…" : expanded ? "Hide" : "View"}
          </button>
          <button
            type="button"
            onClick={handleMessage}
            disabled={pendingAction !== null || loading}
            className="rounded border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
          >
            {copied ? "Copied!" : "Message"}
          </button>
          <button
            type="button"
            onClick={handleSnooze}
            disabled={pendingAction !== null || loading}
            className="rounded border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
          >
            {pendingAction === "snooze" ? "Snoozing…" : "Snooze"}
          </button>
        </div>
      </div>

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

      {expanded && decision && (
        <div className="mt-3 space-y-2 border-t border-gray-100 pt-3">
          <p className="text-sm text-gray-700">{decision.reasoning}</p>
          {(decision.message.linkedin ?? decision.message.email) && (
            <p className="whitespace-pre-wrap rounded bg-gray-50 p-2 text-sm text-gray-800">
              {decision.message.linkedin ?? decision.message.email}
            </p>
          )}
        </div>
      )}
    </li>
  );
}
