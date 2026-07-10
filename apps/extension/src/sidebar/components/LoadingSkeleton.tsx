// Bible §19.1 QA checklist: "Loading skeleton states" · §7.4 perf target:
// sidebar must render within 2s of page load, well before the ~3-8s verdict
// generation completes, so users always see structure immediately.
export function LoadingSkeleton() {
  return (
    <div className="animate-pulse space-y-4 p-4" role="status" aria-label="Generating verdict">
      <div className="h-16 rounded-lg bg-gray-200" />
      <div className="space-y-2">
        <div className="h-3 w-3/4 rounded bg-gray-200" />
        <div className="h-3 w-1/2 rounded bg-gray-200" />
        <div className="h-3 w-5/6 rounded bg-gray-200" />
      </div>
      <div className="h-24 rounded-lg bg-gray-200" />
      <div className="h-20 rounded-lg bg-gray-200" />
    </div>
  );
}
