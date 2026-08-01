import { Card } from "./ui/Card";

interface Side {
  processingTimeMs: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  inferenceCostUsd: number | null;
}

interface Props {
  live: Side;
  shadow: Side;
  model: string;
}

function formatMetric(side: Side): string {
  const parts: string[] = [];
  if (side.processingTimeMs != null) parts.push(`${(side.processingTimeMs / 1000).toFixed(1)}s`);
  if (side.inputTokens != null && side.outputTokens != null) {
    parts.push(`${side.inputTokens.toLocaleString()} in / ${side.outputTokens.toLocaleString()} out tokens`);
  }
  if (side.inferenceCostUsd != null) parts.push(`$${side.inferenceCostUsd.toFixed(4)}`);
  return parts.length > 0 ? parts.join(" · ") : "No metadata recorded";
}

// model is one shared field (not per-side) -- both live and shadow runs
// use the same configured model in the real schema shape.
export function DecisionMetadataFooter({ live, shadow, model }: Props) {
  return (
    <Card className="p-4 text-xs text-gray-500">
      <p>Model: {model}</p>
      <p className="mt-1">Live: {formatMetric(live)}</p>
      <p className="mt-1">Shadow: {formatMetric(shadow)}</p>
    </Card>
  );
}
