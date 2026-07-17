"use client";

import { useState, useTransition } from "react";
import { icpWeightsAreValid, type IcpCriterion } from "@argus/shared";
import { IcpCriteriaFields } from "./IcpCriteriaFields";
import { completeOnboardingAction } from "../app/onboarding/actions";

interface Props {
  initialName: string;
  initialCriteria: IcpCriterion[];
}

// Bible has no onboarding wireframe -- this fills that gap using the object
// model (§5.2 Team -> ICPDefinition) as the guide: a brand-new team needs a
// real company name (createUserWithPersonalTeam only ever auto-generates
// "X's Team") and, optionally, its first ICP. One combined submit, not a
// multi-step flow with its own progress indicator -- there's nothing to
// gate on between the two fields.
export function OnboardingWizard({ initialName, initialCriteria }: Props) {
  const [name, setName] = useState(initialName);
  const [criteria, setCriteria] = useState<IcpCriterion[]>(initialCriteria);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Empty criteria is a valid "skip ICP for now" state (icpWeightsAreValid
  // exempts it, same as icp.service.ts's server-side check) -- the Bible's
  // Cold-Start Strategy (§5.3) already covers Day-0 heuristic scoring when
  // there's no ICP yet, so onboarding doesn't need to block on it.
  const weightsValid = icpWeightsAreValid(criteria);
  const canSubmit = name.trim().length > 0 && weightsValid;

  function handleSubmit() {
    setError(null);
    startTransition(async () => {
      const result = await completeOnboardingAction({ name: name.trim(), criteria });
      if (result && !result.ok) {
        setError(result.error ?? "Failed to complete onboarding");
      }
    });
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="text-lg font-bold text-gray-900">Welcome to ARGUS</h1>
      <p className="mt-1 text-sm text-gray-600">
        Two quick things before your first decision: name your company, and tell us who you sell to.
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
        className="mt-8 rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40"
      >
        {isPending ? "Setting up…" : "Finish setup"}
      </button>
    </main>
  );
}
