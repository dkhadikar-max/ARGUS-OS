import { api } from "../../lib/api-client";
import { PatternCard } from "../../components/PatternCard";

// Bible §18 DSH-4 "Company Memory". Patterns, top-performing messages, and
// now risk flags are all real, computed server-side (see README "Company
// Memory" for exactly what each one does and doesn't mean). ICP accuracy
// still has no producer anywhere in this codebase yet -- shown as an
// honest empty state rather than fabricated data, and flagged in README
// rather than silently hidden.
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
            <p className="text-sm font-medium text-gray-900">Not tracked yet</p>
            <p className="mt-1 text-sm text-gray-500">
              ICP accuracy needs versioned ICP history this codebase doesn&apos;t track yet — see the project README.
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
    </main>
  );
}
