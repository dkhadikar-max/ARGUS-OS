import { api } from "../../lib/api-client";
import { QueueItemCard } from "../../components/QueueItemCard";
import { EmptyQueueState } from "../../components/EmptyQueueState";

// Bible §18 DSH-2 "Queue page layout" + "Prospect cards with verdicts" (P0).
// Filter/sort controls are an explicit P1 item — not built here.
export default async function QueuePage({
  searchParams,
}: {
  searchParams: Promise<{ slack?: string }>;
}) {
  const queue = await api.getQueue();
  const { slack } = await searchParams;

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      {slack === "connected" && (
        <p className="mb-4 rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">
          Slack connected — alerts and slash commands are live for your team.
        </p>
      )}
      {slack === "error" && (
        <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
          Couldn&apos;t connect Slack. Please try again.
        </p>
      )}

      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-bold text-gray-900">
            Today&apos;s Queue — {queue.stats.total} prospect{queue.stats.total === 1 ? "" : "s"}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {queue.stats.strongYes} strong yes · {queue.stats.yes} yes · {queue.stats.wait} wait ·{" "}
            {queue.stats.pass} pass · {queue.stats.newSinceYesterday} new since yesterday
          </p>
        </div>
        <a
          href="/api/slack/install"
          className="shrink-0 rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-700"
        >
          Connect Slack
        </a>
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
