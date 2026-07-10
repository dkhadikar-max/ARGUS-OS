// Bible §19.1 QA checklist: "Loading skeleton states".
export default function QueueLoading() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6 animate-pulse space-y-2">
        <div className="h-5 w-48 rounded bg-gray-200" />
        <div className="h-4 w-64 rounded bg-gray-200" />
      </div>
      <ul className="space-y-3" aria-label="Loading queue" role="status">
        {Array.from({ length: 4 }, (_, i) => (
          <li key={i} className="animate-pulse rounded-lg border border-gray-200 bg-white p-4">
            <div className="h-4 w-24 rounded bg-gray-200" />
            <div className="mt-3 h-4 w-3/4 rounded bg-gray-200" />
            <div className="mt-2 h-3 w-1/2 rounded bg-gray-200" />
          </li>
        ))}
      </ul>
    </main>
  );
}
