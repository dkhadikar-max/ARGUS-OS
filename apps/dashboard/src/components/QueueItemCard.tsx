import type { QueueItem } from "@argus/shared";
import { VerdictBadge } from "./VerdictBadge";

// Bible §6.2 Today Queue wireframe: "#1 STRONG YES 96% Sarah Chen, VP Eng
// @ DataFlow — New since yesterday · ICP match · Intent hot — [View]
// [Message] [Snooze]". The View/Message/Snooze buttons in the wireframe
// assume an ActionTaken write path that Bible §10 never contracts (see
// README "Known gaps") — rather than wire up buttons with no working
// handler behind them, this links out to the one action that's real
// today: the prospect's actual LinkedIn profile.
export function QueueItemCard({ item }: { item: QueueItem }) {
  return (
    <li className="flex items-start justify-between gap-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-400">#{item.rank}</span>
          <VerdictBadge verdict={item.verdict} />
          <span className="text-sm font-medium text-gray-600">{item.confidence}%</span>
        </div>
        <p className="mt-2 truncate text-sm font-semibold text-gray-900">
          {item.prospect.name}
          {item.prospect.title ? `, ${item.prospect.title}` : ""}
          {item.prospect.companyName ? ` @ ${item.prospect.companyName}` : ""}
        </p>
        <p className="mt-1 text-sm text-gray-500">
          {item.reason} · {item.lastActivity}
        </p>
        <p className="mt-1 text-xs font-medium text-blue-700">{item.suggestedAction}</p>
      </div>
      <a
        href={item.prospect.linkedInUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="shrink-0 rounded border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
      >
        View on LinkedIn
      </a>
    </li>
  );
}
