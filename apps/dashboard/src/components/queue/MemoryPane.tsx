import type { CompanyMemoryPattern, CompanyMemoryResponse, DecisionResponse } from "@argus/shared";
import { Card } from "../ui/Card";
import { StatLine } from "../ui/StatLine";

const MAX_ROWS = 5;

// Best-effort relevance ordering, not a similarity engine: a pattern is
// promoted to the top if its description literally shares one of the
// selected prospect's real evidence signal strings (simple substring
// match). No score is invented for this -- there is no per-prospect
// similarity number anywhere in the backend, so none is shown here.
function isRelevant(pattern: CompanyMemoryPattern, evidenceSignals: string[]): boolean {
  const description = pattern.description.toLowerCase();
  return evidenceSignals.some((signal) => signal.length > 3 && description.includes(signal.toLowerCase()));
}

function orderByRelevance(patterns: CompanyMemoryPattern[], evidenceSignals: string[]): CompanyMemoryPattern[] {
  if (evidenceSignals.length === 0) return patterns;
  const relevant = patterns.filter((p) => isRelevant(p, evidenceSignals));
  const rest = patterns.filter((p) => !isRelevant(p, evidenceSignals));
  return [...relevant, ...rest];
}

// Decision Workspace, right pane -- built entirely from the real
// CompanyMemoryResponse already fetched once by QueueWorkspace (no new
// endpoint), re-filtered/re-ordered client-side per selection. External-
// review feedback, incorporated: each section leads with a short
// structured stat line (a conclusion), not a paragraph -- the underlying
// data is exactly as real as before, this only changes how it's led.
export function MemoryPane({ memory, decision }: { memory: CompanyMemoryResponse; decision: DecisionResponse | null }) {
  const evidenceSignals = decision?.evidence.map((e) => e.signal).filter(Boolean) ?? [];
  const patterns = orderByRelevance(memory.patterns, evidenceSignals).slice(0, MAX_ROWS);
  const playbooks = memory.topPerformingMessages.slice(0, MAX_ROWS);

  return (
    <div className="flex h-full flex-col overflow-y-auto p-4">
      <section>
        <h3 className="text-section-label">Patterns</h3>
        {patterns.length === 0 ? (
          <Card variant="dashed" className="mt-2 p-4">
            <p className="text-xs font-medium text-gray-900">No patterns yet</p>
            <p className="mt-1 text-xs text-gray-500">
              Patterns appear here once your team has logged enough outcomes for ARGUS to spot a trend.
            </p>
          </Card>
        ) : (
          <ul className="mt-2 space-y-2">
            {patterns.map((pattern) => (
              <li key={pattern.id}>
                <StatLine label={pattern.type} stat={`${pattern.confidence}% confidence`}>
                  {pattern.description}
                </StatLine>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-6">
        <h3 className="text-section-label">Playbooks</h3>
        {playbooks.length === 0 ? (
          <Card variant="dashed" className="mt-2 p-4">
            <p className="text-xs font-medium text-gray-900">No patterns yet</p>
            <p className="mt-1 text-xs text-gray-500">
              This fills in once enough messages using the same personalization hook have a logged outcome.
            </p>
          </Card>
        ) : (
          <ul className="mt-2 space-y-2">
            {playbooks.map((message) => (
              <li key={message.pattern} className="rounded-md border border-gray-200 bg-white p-2.5">
                <div className="text-xs font-medium text-teal-700">
                  {Math.round(message.replyRate * 100)}% reply rate — {message.sampleSize} sample
                  {message.sampleSize === 1 ? "" : "s"}
                </div>
                <p className="mt-1 text-sm text-gray-700">{message.pattern}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* No chronological "what changed when" feed -- there's no event
          log to source it from anywhere in the backend today. Building
          one is real future work, not fabricated here. */}
      <a href="/company-memory" className="mt-6 text-xs font-medium text-teal-700 hover:underline">
        View full history →
      </a>
    </div>
  );
}
