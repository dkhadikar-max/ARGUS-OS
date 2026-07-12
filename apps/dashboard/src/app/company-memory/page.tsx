import { api } from "../../lib/api-client";
import { PatternCard } from "../../components/PatternCard";

// Bible §18 DSH-4 "Company Memory". Patterns, top-performing messages, risk
// flags, and ICP accuracy are all real, computed server-side (see README
// "Company Memory" for exactly what each one does and doesn't mean, and
// exactly why ICP accuracy can still show its own empty state for a team
// that hasn't edited its ICP since this feature shipped).
export default async function CompanyMemoryPage() {
  const memory = await api.getCompanyMemory();

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <header className="mb-6">
        <h1 className="text-lg font-bold text-gray-900">Company Memory</h1>
        <p className="mt-1 text-sm text-gray-500">
          Patterns ARGUS has learned from your team&apos;s logged outcomes.
        </p>
      </header>

      <section className="mb-8">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Patterns</h2>
        {memory.patterns.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center">
            <p className="text-sm font-medium text-gray-900">No patterns yet</p>
            <p className="mt-1 text-sm text-gray-500">
              Patterns appear here once your team has logged enough outcomes for ARGUS to spot a trend.
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {memory.patterns.map((pattern) => (
              <PatternCard key={pattern.id} pattern={pattern} />
            ))}
          </ul>
        )}
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Risk flags</h2>
        {memory.riskFlags.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center">
            <p className="text-sm font-medium text-gray-900">No risk flags yet</p>
            <p className="mt-1 text-sm text-gray-500">
              This fills in once a recurring risk condition has appeared across enough decisions.
            </p>
          </div>
        ) : (
          <table className="w-full overflow-hidden rounded-lg border border-gray-200 bg-white text-sm">
            <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-2">Condition</th>
                <th className="px-4 py-2">Severity</th>
                <th className="px-4 py-2">Occurrence</th>
                <th className="px-4 py-2">Recommendation</th>
              </tr>
            </thead>
            <tbody>
              {memory.riskFlags.map((flag) => (
                <tr key={flag.id} className="border-t border-gray-100">
                  <td className="px-4 py-2">{flag.condition}</td>
                  <td className="px-4 py-2">{flag.severity}</td>
                  <td className="px-4 py-2">{Math.round(flag.occurrenceRate * 100)}%</td>
                  <td className="px-4 py-2">{flag.recommendation}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">ICP accuracy</h2>
        {memory.icpAccuracy ? (
          <p className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-700">
            {Math.round(memory.icpAccuracy.current * 100)}% ({memory.icpAccuracy.trend})
          </p>
        ) : (
          <div className="rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center">
            <p className="text-sm font-medium text-gray-900">Not enough data yet</p>
            <p className="mt-1 text-sm text-gray-500">
              This fills in once your current ICP has at least one STRONG YES or YES decision with a logged outcome.
            </p>
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
          Top performing messages
        </h2>
        {memory.topPerformingMessages.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center">
            <p className="text-sm font-medium text-gray-900">No patterns yet</p>
            <p className="mt-1 text-sm text-gray-500">
              This fills in once enough messages using the same personalization hook have a logged outcome.
            </p>
          </div>
        ) : (
          <table className="w-full overflow-hidden rounded-lg border border-gray-200 bg-white text-sm">
            <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-2">Personalization hook</th>
                <th className="px-4 py-2">Reply rate</th>
                <th className="px-4 py-2">Sample size</th>
              </tr>
            </thead>
            <tbody>
              {memory.topPerformingMessages.map((message) => (
                <tr key={message.pattern} className="border-t border-gray-100">
                  <td className="px-4 py-2">{message.pattern}</td>
                  <td className="px-4 py-2">{Math.round(message.replyRate * 100)}%</td>
                  <td className="px-4 py-2">{message.sampleSize}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
          Learning Agent report
        </h2>
        {memory.learningInsights ? (
          <div className="space-y-4 rounded-lg border border-gray-200 bg-white p-4 text-sm">
            <p className="text-gray-500">
              Recommendations only &mdash; nothing here is applied automatically. Generated{" "}
              {new Date(memory.learningInsights.generatedAt).toLocaleDateString()}, priority:{" "}
              <span className="font-medium text-gray-900">{memory.learningInsights.priority}</span>.
            </p>

            {memory.learningInsights.systematic_errors.length > 0 && (
              <div>
                <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Systematic errors
                </h3>
                <ul className="list-inside list-disc space-y-1 text-gray-700">
                  {memory.learningInsights.systematic_errors.map((error, i) => (
                    <li key={i}>{error}</li>
                  ))}
                </ul>
              </div>
            )}

            {memory.learningInsights.patterns.length > 0 && (
              <div>
                <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Patterns found
                </h3>
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
                <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Suggested prompt adjustments
                </h3>
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
                <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  ICP recommendations
                </h3>
                <ul className="list-inside list-disc space-y-1 text-gray-700">
                  {memory.learningInsights.icp_recommendations.map((rec, i) => (
                    <li key={i}>{rec}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center">
            <p className="text-sm font-medium text-gray-900">No report yet</p>
            <p className="mt-1 text-sm text-gray-500">
              The Learning Agent runs every 20 logged outcomes and analyzes what&apos;s working across your
              team&apos;s decisions.
            </p>
          </div>
        )}
      </section>
    </main>
  );
}
