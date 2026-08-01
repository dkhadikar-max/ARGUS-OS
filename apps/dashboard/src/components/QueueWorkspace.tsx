"use client";

import { useEffect, useState } from "react";
import type { ActionType, CompanyMemoryResponse, DecisionResponse, QueueItem } from "@argus/shared";
import { getFullDecisionAction } from "../app/queue/actions";
import { useUndoableQueueAction } from "./queue/useUndoableQueueAction";
import { QueuePane } from "./queue/QueuePane";
import { DecisionWorkspacePane } from "./queue/DecisionWorkspacePane";
import { MemoryPane } from "./queue/MemoryPane";
import { UndoToast } from "./queue/UndoToast";
import { LiveQueueBanner } from "./LiveQueueBanner";
import { Card } from "./ui/Card";

// Decision Workspace -- the persistent 3-pane shell (Queue | Decision
// Workspace | Memory) replacing separate Queue/Decision pages. Owns
// selection state and the one shared full-decision fetch per selection
// (used by both the center pane and the Memory pane's relevance
// ordering), plus the deferred-commit undo state from
// useUndoableQueueAction.
export function QueueWorkspace({ items, memory }: { items: QueueItem[]; memory: CompanyMemoryResponse }) {
  const { visibleItems, pending, performAction, undo } = useUndoableQueueAction(items);
  const [selectedId, setSelectedId] = useState<string | null>(items[0]?.decisionId ?? null);

  // First item auto-selected on load (Superhuman/Gmail convention), and
  // re-selects the next available item whenever the current selection
  // disappears (filtered out, acted on, or -- on first render -- none
  // chosen yet).
  useEffect(() => {
    if (selectedId === null && visibleItems.length > 0) {
      setSelectedId(visibleItems[0].decisionId);
    }
  }, [visibleItems, selectedId]);

  const selectedItem = visibleItems.find((item) => item.decisionId === selectedId) ?? null;

  const [decision, setDecision] = useState<DecisionResponse | null>(null);
  const [decisionLoading, setDecisionLoading] = useState(false);
  const [decisionError, setDecisionError] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedItem) {
      setDecision(null);
      setDecisionLoading(false);
      setDecisionError(null);
      return;
    }
    let cancelled = false;
    setDecision(null);
    setDecisionLoading(true);
    setDecisionError(null);
    getFullDecisionAction(selectedItem.decisionId).then((result) => {
      if (cancelled) return;
      setDecisionLoading(false);
      if (!result.ok) {
        setDecisionError(result.error);
        return;
      }
      setDecision(result.decision);
    });
    return () => {
      cancelled = true;
    };
    // Keyed on decisionId, not the item object -- selectedItem's identity
    // changes on every visibleItems re-derivation even when it refers to
    // the same real decision.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedItem?.decisionId]);

  function handleAction(item: QueueItem, actionType: ActionType, label: string, details?: Record<string, unknown>) {
    if (item.decisionId === selectedId) {
      const currentIndex = visibleItems.findIndex((i) => i.decisionId === item.decisionId);
      const remaining = visibleItems.filter((i) => i.decisionId !== item.decisionId);
      const next = remaining[currentIndex] ?? remaining[currentIndex - 1] ?? null;
      setSelectedId(next?.decisionId ?? null);
    }
    performAction(item, actionType, label, details);
  }

  // ARGUS Unanimous Policy v2.1 "The Customer Narrative (Do Not Change)" --
  // quoted verbatim, re-hosted from the retired EmptyQueueState.tsx.
  if (items.length === 0) {
    return (
      <Card variant="dashed" className="p-10">
        <p className="text-sm font-medium text-gray-900">Your queue is empty</p>
        <p className="mt-1 text-sm text-gray-500">
          You&apos;ll stop wasting time on low-probability prospects and make better revenue decisions with
          evidence-backed recommendations. Every choice your team makes becomes institutional intelligence that
          makes the next decision smarter.
        </p>
      </Card>
    );
  }

  return (
    <div>
      <LiveQueueBanner />

      <div className="grid grid-cols-[280px_1fr_320px] gap-4" style={{ height: "calc(100vh - 220px)" }}>
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          <QueuePane items={visibleItems} selectedId={selectedId} onSelect={setSelectedId} />
        </div>

        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          {selectedItem ? (
            <DecisionWorkspacePane
              item={selectedItem}
              decision={decision}
              loading={decisionLoading}
              error={decisionError}
              onAction={handleAction}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-gray-500">No prospect selected.</div>
          )}
        </div>

        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          <MemoryPane memory={memory} decision={selectedItem ? decision : null} />
        </div>
      </div>

      {pending && <UndoToast message={pending.label} onUndo={undo} />}
    </div>
  );
}
