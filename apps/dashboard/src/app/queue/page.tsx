import { api } from "../../lib/api-client";
import { QueueWorkspace } from "../../components/QueueWorkspace";
import { PageHeader } from "../../components/ui/PageHeader";

// Decision Workspace -- Bible §18 DSH-2 "Queue page layout" +
// "Prospect cards with verdicts" (P0), now rendered as a persistent
// 3-pane workspace (Queue | Decision Workspace | Memory) instead of a
// scrolling card list. `/queue` stays the route -- already the nav entry
// point, no reason to invent a new URL. Company Memory is fetched here
// too (api.getCompanyMemory(), already a real, existing client method)
// so the Memory pane never needs a second page load.
export default async function QueuePage({
  searchParams,
}: {
  searchParams: Promise<{ slack?: string }>;
}) {
  const [queue, memory, slackStatus] = await Promise.all([
    api.getQueue(),
    api.getCompanyMemory(),
    api.getSlackStatus(),
  ]);
  const { slack } = await searchParams;

  return (
    <main className="mx-auto max-w-[1600px] px-4 py-8">
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

      <PageHeader
        title={`Queue — ${queue.stats.total} prospect${queue.stats.total === 1 ? "" : "s"}`}
        description={
          <>
            {queue.stats.strongYes} strong yes · {queue.stats.yes} yes · {queue.stats.wait} wait ·{" "}
            {queue.stats.pass} pass · {queue.stats.newSinceYesterday} new since yesterday
          </>
        }
        actions={
          slackStatus.connected ? (
            // getSlackIntegrationStatus only reads the stored DB flag -- it
            // never confirms the Slack-side installation is still live, so a
            // workspace admin uninstalling the app or revoking the token
            // leaves this stuck at "connected" with no way to recover. Kept
            // clickable (re-running /api/slack/install is an idempotent
            // upsert, per connectSlackIntegration) so there's always a path
            // to redo the handshake, the same way the unconnected state below
            // always had one.
            <a
              href="/api/slack/install"
              title="Reconnect Slack"
              className="shrink-0 rounded-md bg-green-50 px-3 py-1.5 text-sm font-medium text-green-800 hover:bg-green-100"
            >
              ✓ Slack connected
            </a>
          ) : (
            <a
              href="/api/slack/install"
              className="shrink-0 rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-700"
            >
              Connect Slack
            </a>
          )
        }
      />

      <QueueWorkspace items={queue.items} memory={memory} />
    </main>
  );
}
