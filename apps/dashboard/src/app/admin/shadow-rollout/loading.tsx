import { Card } from "../../../components/ui/Card";

// Mirrors app/queue/loading.tsx's skeleton shape.
export default function ShadowRolloutLoading() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-6 animate-pulse space-y-2">
        <div className="h-5 w-64 rounded bg-gray-200" />
        <div className="h-4 w-96 rounded bg-gray-200" />
      </div>
      <div className="animate-pulse space-y-4" aria-label="Loading rollout controller" role="status">
        {Array.from({ length: 3 }, (_, i) => (
          <Card key={i} className="h-24 p-4">
            <div className="h-4 w-40 rounded bg-gray-200" />
            <div className="mt-3 h-3 w-full rounded bg-gray-200" />
          </Card>
        ))}
      </div>
    </main>
  );
}
