"use client";

import { useEffect, useMemo, useState } from "react";
import type { QueueItem, Verdict } from "@argus/shared";
import { QueueItemCard } from "./QueueItemCard";
import { EmptyQueueState } from "./EmptyQueueState";
import { track } from "../lib/analytics";

const VERDICTS: Verdict[] = ["STRONG_YES", "YES", "WAIT", "PASS", "HARD_PASS"];
const VERDICT_LABEL: Record<Verdict, string> = {
  STRONG_YES: "Strong yes",
  YES: "Yes",
  WAIT: "Wait",
  PASS: "Pass",
  HARD_PASS: "Hard pass",
};

type SortBy = "priority" | "confidence" | "recency";

const SORTERS: Record<SortBy, (a: QueueItem, b: QueueItem) => number> = {
  // Server already returns items in priority order (`rank`) -- re-sorting
  // by rank just restores that default after a client-side sort.
  priority: (a, b) => a.rank - b.rank,
  confidence: (a, b) => b.confidence - a.confidence,
  recency: (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
};

// Bible §18 DSH-2 "Filter and sort controls" (P1). Filters/sorts entirely
// client-side against the already-fetched queue (a rep's daily queue is a
// small, bounded list -- this doesn't need a new API round-trip or
// server-side query params).
export function QueueList({ items }: { items: QueueItem[] }) {
  const [hiddenVerdicts, setHiddenVerdicts] = useState<Set<Verdict>>(new Set());
  const [sortBy, setSortBy] = useState<SortBy>("priority");

  // Bible §11.1 queue_viewed: "User opens Today Queue". Fires once, on
  // mount, not on every filter/sort change -- those aren't a distinct
  // event in the Bible's catalog. `filter_applied` is honestly always
  // false here: this page has no URL-persisted filter state, so every
  // fresh view genuinely starts unfiltered (the property exists for a
  // hypothetical bookmarked/shared filtered-view link, which isn't
  // supported yet). `time_spent_ms` (optional in the schema) isn't tracked
  // -- that needs page-visibility/beacon handling on unmount, more
  // lifecycle complexity than this pass's scope.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    track({ name: "queue_viewed", properties: { item_count: items.length, filter_applied: false } });
  }, []);

  const visibleItems = useMemo(() => {
    return items.filter((item) => !hiddenVerdicts.has(item.verdict)).sort(SORTERS[sortBy]);
  }, [items, hiddenVerdicts, sortBy]);

  function toggleVerdict(verdict: Verdict) {
    setHiddenVerdicts((prev) => {
      const next = new Set(prev);
      if (next.has(verdict)) next.delete(verdict);
      else next.add(verdict);
      return next;
    });
  }

  if (items.length === 0) {
    return <EmptyQueueState />;
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-4 rounded-lg border border-gray-200 bg-white p-3">
        <div className="flex flex-wrap gap-2">
          {VERDICTS.map((verdict) => (
            <button
              key={verdict}
              type="button"
              onClick={() => toggleVerdict(verdict)}
              aria-pressed={!hiddenVerdicts.has(verdict)}
              className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
                hiddenVerdicts.has(verdict)
                  ? "border-gray-200 text-gray-400"
                  : "border-blue-200 bg-blue-50 text-blue-700"
              }`}
            >
              {VERDICT_LABEL[verdict]}
            </button>
          ))}
        </div>

        <label className="ml-auto flex items-center gap-2 text-xs text-gray-600">
          Sort by
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortBy)}
            className="rounded border border-gray-300 px-2 py-1 text-xs"
          >
            <option value="priority">Priority</option>
            <option value="confidence">Confidence</option>
            <option value="recency">Most recent</option>
          </select>
        </label>
      </div>

      {visibleItems.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center">
          <p className="text-sm font-medium text-gray-900">No prospects match these filters</p>
          <p className="mt-1 text-sm text-gray-500">Clear a verdict filter above to see more.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {visibleItems.map((item) => (
            <QueueItemCard key={item.decisionId} item={item} />
          ))}
        </ul>
      )}
    </div>
  );
}
