// Gate 3 Increment 1.8 -- operators process a filled bar faster than a
// bare number. Native div, no charting library. Reused for both the
// global row and every team-override row.
export function RolloutPercentBar({ percent, label }: { percent: number; label?: string }) {
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-32 overflow-hidden rounded-full bg-gray-100">
        <div
          className="h-2 rounded-full bg-teal-600"
          style={{ width: `${clamped}%` }}
          role="progressbar"
          aria-valuenow={clamped}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={label ?? "Rollout percent"}
        />
      </div>
      <span className="text-xs font-medium text-gray-700">{percent}%</span>
    </div>
  );
}
