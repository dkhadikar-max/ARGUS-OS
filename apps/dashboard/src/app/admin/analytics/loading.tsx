// Mirrors app/queue/loading.tsx's skeleton shape.
export default function AdminAnalyticsLoading() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-6 animate-pulse space-y-2">
        <div className="h-5 w-56 rounded bg-gray-200" />
        <div className="h-4 w-72 rounded bg-gray-200" />
      </div>
      <div className="grid animate-pulse grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Loading analytics" role="status">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-24 rounded-lg border border-gray-200 bg-white p-4">
            <div className="h-3 w-20 rounded bg-gray-200" />
            <div className="mt-3 h-6 w-16 rounded bg-gray-200" />
          </div>
        ))}
      </div>
    </main>
  );
}
