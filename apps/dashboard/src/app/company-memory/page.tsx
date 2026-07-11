import { api } from "../../lib/api-client";
import { PatternCard } from "../../components/PatternCard";

// Bible §18 DSH-4 "Company Memory". Patterns display and the confidence-
// scored evidence behind each are real, computed from logged outcomes
// (see README "Company Memory"). Risk flags, ICP accuracy, and top-
// performing messages have no producer anywhere in this codebase yet --
// shown as honest empty states rather than fabricated data, and flagged
// in README rather than silently hidden.
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
              Risk-pattern detection across decisions isn&apos;t built yet — see the project README.
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

      <section>
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
    </main>
  );
}
