import { Card } from "./ui/Card";

// confidenceDelta is signed, computed as shadow - live (see
// decision-disagreement.ts), so it ranges roughly -100..100. Rendered as a
// bar from a shared center so the direction (shadow more/less confident) is
// visible at a glance, not just the number.
export function ConfidenceDeltaBar({ confidenceDelta }: { confidenceDelta: number }) {
  const magnitude = Math.min(Math.abs(confidenceDelta), 100);
  const positive = confidenceDelta >= 0;

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <p className="text-section-label">Confidence delta</p>
        <span className={`text-sm font-semibold ${positive ? "text-emerald-700" : "text-red-700"}`}>
          {positive ? "+" : ""}
          {confidenceDelta}
        </span>
      </div>
      <div className="relative mt-2 h-2 rounded-full bg-gray-100">
        <div className="absolute left-1/2 top-0 h-2 w-px bg-gray-300" />
        <div
          className={`absolute top-0 h-2 rounded-full ${positive ? "bg-emerald-500" : "bg-red-500"}`}
          style={
            positive
              ? { left: "50%", width: `${magnitude / 2}%` }
              : { right: "50%", width: `${magnitude / 2}%` }
          }
        />
      </div>
      <p className="mt-1 text-xs text-gray-400">Shadow {positive ? "more" : "less"} confident than live</p>
    </Card>
  );
}
