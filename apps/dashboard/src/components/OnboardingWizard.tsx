"use client";

import { useState, useTransition } from "react";
import { icpWeightsAreValid, type IcpCriterion } from "@argus/shared";
import { IcpCriteriaFields } from "./IcpCriteriaFields";
import { completeOnboardingAction, suggestCompanyContextAction } from "../app/onboarding/actions";

interface Props {
  initialName: string;
  initialCriteria: IcpCriterion[];
}

// Bible has no onboarding wireframe -- this fills that gap using the object
// model (§5.2 Team -> ICPDefinition) as the guide: a brand-new team needs a
// real company name (createUserWithPersonalTeam only ever auto-generates
// "X's Team") and, optionally, its first ICP. Company context (also
// optional, not in the Bible -- see schema.prisma's Team.companyContext
// comment) rides along in the same submit. One combined submit, not a
// multi-step flow with its own progress indicator -- there's nothing to
// gate on between the fields.
export function OnboardingWizard({ initialName, initialCriteria }: Props) {
  const [name, setName] = useState(initialName);
  const [criteria, setCriteria] = useState<IcpCriterion[]>(initialCriteria);
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [companyContext, setCompanyContext] = useState("");
  const [suggestError, setSuggestError] = useState<string | null>(null);
  const [isSuggesting, startSuggesting] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Empty criteria is a valid "skip ICP for now" state (icpWeightsAreValid
  // exempts it, same as icp.service.ts's server-side check) -- the Bible's
  // Cold-Start Strategy (§5.3) already covers Day-0 heuristic scoring when
  // there's no ICP yet, so onboarding doesn't need to block on it.
  const weightsValid = icpWeightsAreValid(criteria);
  const canSubmit = name.trim().length > 0 && weightsValid;

  function handleSuggest() {
    if (!websiteUrl.trim()) return;
    setSuggestError(null);
    startSuggesting(async () => {
      const result = await suggestCompanyContextAction(websiteUrl.trim());
      if (result.ok && result.suggested) {
        setCompanyContext(result.suggested);
      } else {
        setSuggestError(result.error ?? "Failed to generate a profile");
      }
    });
  }

  function handleSubmit() {
    setError(null);
    startTransition(async () => {
      const result = await completeOnboardingAction({
        name: name.trim(),
        criteria,
        companyContext: companyContext.trim() || undefined,
      });
      if (result && !result.ok) {
        setError(result.error ?? "Failed to complete onboarding");
      }
    });
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="text-lg font-bold text-gray-900">Welcome to ARGUS</h1>
      <p className="mt-1 text-sm text-gray-600">
        A few quick things before your first decision: name your company, tell us what you sell, and who
        you sell it to.
      </p>

      <section className="mt-8">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Company name</h2>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Acme Inc."
          className="block w-full rounded border border-gray-300 px-3 py-2 text-sm"
        />
      </section>

      <section className="mt-8">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
          Company context
        </h2>
        <p className="mb-3 text-xs text-gray-500">
          Optional — helps Argus write outreach messages that reflect what you actually sell, instead of
          generic copy. Paste your website and we&apos;ll draft a starting point; edit it however you like.
        </p>
        <div className="flex gap-2">
          <input
            type="url"
            value={websiteUrl}
            onChange={(e) => setWebsiteUrl(e.target.value)}
            placeholder="https://acme.com"
            className="block w-full rounded border border-gray-300 px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={handleSuggest}
            disabled={isSuggesting || !websiteUrl.trim()}
            className="shrink-0 rounded border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
          >
            {isSuggesting ? "Reading…" : "Suggest"}
          </button>
        </div>
        {suggestError && <p className="mt-2 text-sm text-red-600">{suggestError}</p>}
        <textarea
          value={companyContext}
          onChange={(e) => setCompanyContext(e.target.value)}
          placeholder="What does your company sell, and to whom?"
          rows={4}
          className="mt-3 block w-full rounded border border-gray-300 px-3 py-2 text-sm"
        />
      </section>

      <section className="mt-8">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
          Ideal Customer Profile
        </h2>
        <p className="mb-3 text-xs text-gray-500">
          Optional for now — skip this and Argus falls back to heuristic scoring (Bible §5.3) until you add
          criteria in Settings.
        </p>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <IcpCriteriaFields criteria={criteria} onChange={setCriteria} />
        </div>
      </section>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={isPending || !canSubmit}
        className="mt-8 rounded bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-40"
      >
        {isPending ? "Setting up…" : "Finish setup"}
      </button>
    </main>
  );
}
