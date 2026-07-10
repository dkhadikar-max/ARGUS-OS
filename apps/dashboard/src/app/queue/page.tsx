import { api } from "../../lib/api-client";
import { QueueItemCard } from "../../components/QueueItemCard";
import { EmptyQueueState } from "../../components/EmptyQueueState";

// Bible §18 DSH-2 "Queue page layout" + "Prospect cards with verdicts" (P0).
// Filter/sort controls are an explicit P1 item — not built here.
export default async function QueuePage() {
  const queue = await api.getQueue();

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <header className="mb-6">
        <h1 className="text-lg font-bold text-gray-900">
          Today&apos;s Queue — {queue.stats.total} prospect{queue.stats.total === 1 ? "" : "s"}
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          {queue.stats.strongYes} strong yes · {queue.stats.yes} yes · {queue.stats.wait} wait ·{" "}
          {queue.stats.pass} pass · {queue.stats.newSinceYesterday} new since yesterday
        </p>
      </header>

      {queue.items.length === 0 ? (
        <EmptyQueueState />
      ) : (
        <ul className="space-y-3">
          {queue.items.map((item) => (
            <QueueItemCard key={item.decisionId} item={item} />
          ))}
        </ul>
      )}
    </main>
  );
}
