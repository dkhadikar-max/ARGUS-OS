"use client";

import { useMemo, useState } from "react";
import type { QueueItem } from "@argus/shared";
import { VERDICT_BUCKETS, verdictBucket, type VerdictBucket } from "../../lib/verdictBucket";
import { QueueRow } from "./QueueRow";

// A prospect at or above this confidence qualifies for the "High
// confidence" chip -- a client-side-only filter over already-fetched
// data (same as QueueList's own filters before it), not a new query
// param.
const HIGH_CONFIDENCE_THRESHOLD = 80;

// Decision Workspace, left pane -- inline GitHub-issues-style filter
// chips replace QueueList's toolbar Card. Bucket chips are independent
// toggles (multiple can be active at once, OR'd together); "High
// confidence" ANDs on top of whichever buckets are active. "My Team"
// from the original mockup is dropped -- the queue is already
// single-user-scoped (queue.repository.ts's getActiveDecisionsForUser),
// so a team filter has no real meaning here.
export function QueuePane({
  items,
  selectedId,
  onSelect,
}: {
  items: QueueItem[];
  selectedId: string | null;
  onSelect: (decisionId: string) => void;
}) {
  const [activeBuckets, setActiveBuckets] = useState<Set<VerdictBucket>>(new Set());
  const [highConfidenceOnly, setHighConfidenceOnly] = useState(false);

  function toggleBucket(bucket: VerdictBucket) {
    setActiveBuckets((prev) => {
      const next = new Set(prev);
      if (next.has(bucket)) next.delete(bucket);
      else next.add(bucket);
      return next;
    });
  }

  const hasFilters = activeBuckets.size > 0 || highConfidenceOnly;

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (activeBuckets.size > 0 && !activeBuckets.has(verdictBucket(item.verdict))) return false;
      if (highConfidenceOnly && item.confidence < HIGH_CONFIDENCE_THRESHOLD) return false;
      return true;
    });
  }, [items, activeBuckets, highConfidenceOnly]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap gap-1.5 border-b border-gray-200 px-3 py-2">
        <FilterChip
          label="All"
          active={!hasFilters}
          onClick={() => {
            setActiveBuckets(new Set());
            setHighConfidenceOnly(false);
          }}
        />
        {VERDICT_BUCKETS.map((bucket) => (
          <FilterChip key={bucket} label={bucket} active={activeBuckets.has(bucket)} onClick={() => toggleBucket(bucket)} />
        ))}
        <FilterChip
          label="High confidence"
          active={highConfidenceOnly}
          onClick={() => setHighConfidenceOnly((prev) => !prev)}
        />
      </div>

      {filteredItems.length === 0 ? (
        <p className="px-3 py-6 text-center text-xs text-gray-500">No prospects match these filters.</p>
      ) : (
        <ul className="flex-1 overflow-y-auto">
          {filteredItems.map((item) => (
            <QueueRow
              key={item.decisionId}
              item={item}
              selected={item.decisionId === selectedId}
              onSelect={() => onSelect(item.decisionId)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
        active ? "border-teal-200 bg-teal-50 text-teal-700" : "border-gray-200 text-gray-500 hover:bg-gray-50"
      }`}
    >
      {label}
    </button>
  );
}
