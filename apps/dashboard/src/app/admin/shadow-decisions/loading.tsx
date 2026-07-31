// Mirrors app/queue/loading.tsx's skeleton shape.
export default function ShadowDecisionsLoading() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-6 animate-pulse space-y-2">
        <div className="h-5 w-48 rounded bg-gray-200" />
        <div className="h-4 w-64 rounded bg-gray-200" />
      </div>
      <div className="animate-pulse space-y-3" aria-label="Loading shadow decisions" role="status">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="h-10 rounded bg-gray-200" />
        ))}
      </div>
    </main>
  );
}
