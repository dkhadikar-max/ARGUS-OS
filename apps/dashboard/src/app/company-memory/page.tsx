import { api } from "../../lib/api-client";
import { Card } from "../../components/ui/Card";
import { PageHeader } from "../../components/ui/PageHeader";
import { StatLine } from "../../components/ui/StatLine";

// Bible §18 DSH-4 "Company Memory". Patterns, top-performing messages, risk
// flags, and ICP accuracy are all real, computed server-side (see README
// "Company Memory" for exactly what each one does and doesn't mean, and
// exactly why ICP accuracy can still show its own empty state for a team
// that hasn't edited its ICP since this feature shipped).
//
// Complete the Redesign (2026-08-02) -- restructured around StatLine (a
// structured stat line leads, description follows) instead of paragraph-
// first cards/tables, matching the same treatment already applied to the
// Queue workspace's Memory pane. Presentation-only change: every field
// shown here is exactly the same real data as before, just re-ordered.
// No chronological "what changed when" history feed is added -- confirmed
// (again) that no real event log exists anywhere in the backend, and
// icpAccuracy.lastUpdated is NOT a real timestamp (memory.service.ts sets
// it to `new Date()` fresh on every single call) so it must never be
// surfaced as a recency signal.
export default async function CompanyMemoryPage() {
  const memory = await api.getCompanyMemory();

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <PageHeader title="Memory" description="Patterns ARGUS has learned from your team's logged outcomes." />

      <section className="mb-8">
        <h2 className="text-section-label mb-3">Patterns</h2>
        {memory.patterns.length === 0 ? (
          <Card variant="dashed" className="p-8">
            <p className="text-sm font-medium text-gray-900">No patterns yet</p>
            <p className="mt-1 text-sm text-gray-500">
              Patterns appear here once your team has logged enough outcomes for ARGUS to spot a trend.
            </p>
          </Card>
        ) : (
          <ul className="space-y-3">
            {memory.patterns.map((pattern) => (
              <li key={pattern.id}>
                <StatLine label={pattern.type} stat={`${pattern.confidence}% confidence`}>
                  {pattern.description}
                </StatLine>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mb-8">
        <h2 className="text-section-label mb-3">Risk flags</h2>
        {memory.riskFlags.length === 0 ? (
          <Card variant="dashed" className="p-8">
            <p className="text-sm font-medium text-gray-900">No risk flags yet</p>
            <p className="mt-1 text-sm text-gray-500">
              This fills in once a recurring risk condition has appeared across enough decisions.
            </p>
          </Card>
        ) : (
          <ul className="space-y-3">
            {memory.riskFlags.map((flag) => (
              <li key={flag.id}>
                <StatLine label={flag.severity} stat={`${Math.round(flag.occurrenceRate * 100)}% occurrence`}>
                  {flag.condition} → {flag.recommendation}
                </StatLine>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mb-8">
        <h2 className="text-section-label mb-3">ICP accuracy</h2>
        {memory.icpAccuracy ? (
          <StatLine
            label="ICP accuracy"
            stat={`${Math.round(memory.icpAccuracy.current * 100)}% · ${memory.icpAccuracy.trend}`}
          >
            Based on {memory.icpAccuracy.sampleSize} decision{memory.icpAccuracy.sampleSize === 1 ? "" : "s"}
          </StatLine>
        ) : (
          <Card variant="dashed" className="p-8">
            <p className="text-sm font-medium text-gray-900">Not enough data yet</p>
            <p className="mt-1 text-sm text-gray-500">
              This fills in once your current ICP has at least 3 STRONG YES or YES decisions with a logged outcome —
              enough that one lucky (or unlucky) call doesn&apos;t read as a definitive accuracy score.
            </p>
          </Card>
        )}
      </section>

      <section>
        <h2 className="text-section-label mb-3">Top performing messages</h2>
        {memory.topPerformingMessages.length === 0 ? (
          <Card variant="dashed" className="p-8">
            <p className="text-sm font-medium text-gray-900">No patterns yet</p>
            <p className="mt-1 text-sm text-gray-500">
              This fills in once enough messages using the same personalization hook have a logged outcome.
            </p>
          </Card>
        ) : (
          <ul className="space-y-3">
            {memory.topPerformingMessages.map((message) => (
              <li key={message.pattern}>
                <StatLine label="Reply rate" stat={`${Math.round(message.replyRate * 100)}% · n=${message.sampleSize}`}>
                  {message.pattern}
                </StatLine>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8">
        <h2 className="text-section-label mb-3">Learning Agent report</h2>
        {memory.learningInsights ? (
          <Card className="space-y-4 p-4 text-sm">
            <p className="text-gray-500">
              Recommendations only &mdash; nothing here is applied automatically. Generated{" "}
              {new Date(memory.learningInsights.generatedAt).toLocaleDateString()}, priority:{" "}
              <span className="font-medium text-gray-900">{memory.learningInsights.priority}</span>.
            </p>

            {memory.learningInsights.systematic_errors.length > 0 && (
              <div>
                <h3 className="text-section-label mb-1">Systematic errors</h3>
                <ul className="list-inside list-disc space-y-1 text-gray-700">
                  {memory.learningInsights.systematic_errors.map((error, i) => (
                    <li key={i}>{error}</li>
                  ))}
                </ul>
              </div>
            )}

            {memory.learningInsights.patterns.length > 0 && (
              <div>
                <h3 className="text-section-label mb-1">Patterns found</h3>
                <ul className="space-y-2">
                  {memory.learningInsights.patterns.map((pattern, i) => (
                    <li key={i} className="rounded border border-gray-100 p-2">
                      <p className="text-gray-900">{pattern.pattern}</p>
                      <p className="mt-0.5 text-xs text-gray-500">{pattern.evidence}</p>
                      <p className="mt-0.5 text-xs text-gray-600">→ {pattern.recommendation}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {memory.learningInsights.prompt_adjustments.length > 0 && (
              <div>
                <h3 className="text-section-label mb-1">Suggested prompt adjustments</h3>
                <ul className="space-y-2">
                  {memory.learningInsights.prompt_adjustments.map((adj, i) => (
                    <li key={i} className="rounded border border-gray-100 p-2">
                      <p className="font-medium text-gray-900">{adj.agent}</p>
                      <p className="mt-0.5 text-xs text-gray-600">{adj.reason}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {memory.learningInsights.icp_recommendations.length > 0 && (
              <div>
                <h3 className="text-section-label mb-1">ICP recommendations</h3>
                <ul className="list-inside list-disc space-y-1 text-gray-700">
                  {memory.learningInsights.icp_recommendations.map((rec, i) => (
                    <li key={i}>{rec}</li>
                  ))}
                </ul>
              </div>
            )}
          </Card>
        ) : (
          <Card variant="dashed" className="p-8">
            <p className="text-sm font-medium text-gray-900">No report yet</p>
            <p className="mt-1 text-sm text-gray-500">
              The Learning Agent runs every 20 logged outcomes and analyzes what&apos;s working across your
              team&apos;s decisions.
            </p>
          </Card>
        )}
      </section>
    </main>
  );
}
