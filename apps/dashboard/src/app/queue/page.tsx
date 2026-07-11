import { api } from "../../lib/api-client";
import { QueueList } from "../../components/QueueList";
import { LiveQueueBanner } from "../../components/LiveQueueBanner";

// Bible §18 DSH-2 "Queue page layout" + "Prospect cards with verdicts" (P0)
// + "Filter and sort controls" (P1, components/QueueList.tsx).
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

      <LiveQueueBanner />

      <QueueList items={queue.items} />
    </main>
  );
}
