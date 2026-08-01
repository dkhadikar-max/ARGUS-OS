import type { ReactNode } from "react";

// Complete the Redesign (2026-08-02) -- extracted from queue/MemoryPane.tsx's
// original inline markup so the Queue workspace's Memory pane and the full
// /company-memory page share one "structured stat leads, description
// follows" row instead of two independently-styled copies of the same
// pattern. Purely presentational -- callers own what real data goes in
// `stat`/children; this never computes or fabricates a number itself.
export function StatLine({ label, stat, children }: { label: string; stat: string; children: ReactNode }) {
  return (
    <div className="rounded-md border border-gray-200 bg-white p-2.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-section-label">{label}</span>
        <span className="font-medium text-teal-700">{stat}</span>
      </div>
      <p className="mt-1 text-sm text-gray-700">{children}</p>
    </div>
  );
}
