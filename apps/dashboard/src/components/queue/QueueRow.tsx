"use client";

import type { QueueItem } from "@argus/shared";
import { verdictBucket, type VerdictBucket } from "../../lib/verdictBucket";

// Decision Workspace -- replaces QueueItemCard's list-item role. A
// single-line, inbox-style row (not a bordered card): the pane never
// grows taller than the viewport just to show a handful of prospects.
// Selected state is persistent (a left border + tint), not hover-only --
// the rep needs to see which row the center pane is showing at a glance.
const BUCKET_DOT_CLASSES: Record<VerdictBucket, string> = {
  Contact: "bg-teal-600",
  Wait: "bg-wait",
  Ignore: "bg-pass",
};

export function QueueRow({
  item,
  selected,
  onSelect,
}: {
  item: QueueItem;
  selected: boolean;
  onSelect: () => void;
}) {
  const bucket = verdictBucket(item.verdict);

  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-current={selected ? "true" : undefined}
        className={`flex w-full items-center gap-2 border-l-2 px-3 py-2 text-left ${
          selected ? "border-teal-600 bg-teal-50" : "border-transparent hover:bg-gray-50"
        }`}
      >
        <span
          className={`h-2 w-2 shrink-0 rounded-full ${BUCKET_DOT_CLASSES[bucket]}`}
          aria-hidden="true"
          title={bucket}
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-gray-900">
            {item.prospect.name}
            {item.prospect.companyName ? ` · ${item.prospect.companyName}` : ""}
          </span>
          <span className="block truncate text-xs text-gray-500">{item.reason}</span>
        </span>
        <span className="shrink-0 text-xs font-medium text-gray-500">{item.confidence}%</span>
      </button>
    </li>
  );
}
