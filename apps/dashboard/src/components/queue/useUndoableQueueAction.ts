"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ActionType, QueueItem } from "@argus/shared";
import { recordQueueActionAction } from "../../app/queue/actions";

const UNDO_WINDOW_MS = 5000;

export interface PendingQueueAction {
  decisionId: string;
  label: string;
}

interface PendingActionState extends PendingQueueAction {
  actionType: ActionType;
  details?: Record<string, unknown>;
  timeoutId: ReturnType<typeof setTimeout>;
}

// Decision Workspace -- "deferred commit" undo, the same pattern Linear
// itself uses. recordAction()'s ActionTaken row is real, permanent, and
// has no server-side undo endpoint, so "undo" can't reverse an already-
// written mutation. Instead: the item is hidden from local state
// immediately, and the real Server Action is only fired after a 5s
// window elapses untouched. Clicking Undo cancels the pending timeout,
// so the server call genuinely never happens -- there's nothing to
// reverse. Only one action is ever pending at a time (matches the single
// bottom-left toast this drives); starting a second action while one is
// still pending flushes the first immediately rather than letting two
// timers race.
export function useUndoableQueueAction(items: QueueItem[]) {
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<PendingQueueAction | null>(null);
  const pendingRef = useRef<PendingActionState | null>(null);

  const commit = useCallback((state: PendingActionState) => {
    clearTimeout(state.timeoutId);
    void recordQueueActionAction(state.decisionId, state.actionType, state.details);
  }, []);

  const performAction = useCallback(
    (item: QueueItem, actionType: ActionType, label: string, details?: Record<string, unknown>) => {
      if (pendingRef.current) commit(pendingRef.current);

      setHiddenIds((prev) => new Set(prev).add(item.decisionId));

      const timeoutId = setTimeout(() => {
        if (pendingRef.current?.decisionId === item.decisionId) {
          commit(pendingRef.current);
          pendingRef.current = null;
          setPending(null);
        }
      }, UNDO_WINDOW_MS);

      const state: PendingActionState = { decisionId: item.decisionId, label, actionType, details, timeoutId };
      pendingRef.current = state;
      setPending({ decisionId: item.decisionId, label });
    },
    [commit],
  );

  const undo = useCallback(() => {
    const state = pendingRef.current;
    if (!state) return;
    clearTimeout(state.timeoutId);
    pendingRef.current = null;
    setPending(null);
    setHiddenIds((prev) => {
      const next = new Set(prev);
      next.delete(state.decisionId);
      return next;
    });
  }, []);

  // A pending action must still commit if the workspace unmounts (e.g. a
  // real navigation away) before its timer fires -- otherwise the Skip
  // the rep already saw disappear from the UI would silently never be
  // recorded server-side.
  useEffect(() => {
    return () => {
      if (pendingRef.current) commit(pendingRef.current);
    };
  }, [commit]);

  const visibleItems = items.filter((item) => !hiddenIds.has(item.decisionId));

  return { visibleItems, pending, performAction, undo };
}
