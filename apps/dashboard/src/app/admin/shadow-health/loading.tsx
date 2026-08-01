// Mirrors app/admin/shadow-rollout/loading.tsx's skeleton shape.
export default function ShadowHealthLoading() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-6 animate-pulse space-y-2">
        <div className="h-5 w-48 rounded bg-gray-200" />
        <div className="h-4 w-96 rounded bg-gray-200" />
      </div>
      <div className="animate-pulse space-y-4" aria-label="Loading shadow health" role="status">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-20 rounded-lg border border-gray-200 bg-white p-4">
            <div className="h-4 w-32 rounded bg-gray-200" />
            <div className="mt-3 h-3 w-full rounded bg-gray-200" />
          </div>
        ))}
      </div>
    </main>
  );
}
