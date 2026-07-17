"use client";

import { useState, useTransition } from "react";
import type { PaidPlanTier } from "@argus/shared";
import { createCheckoutAction } from "../app/billing/actions";

interface Props {
  plan: PaidPlanTier;
  label: string;
}

// Bible §18 DSH-5 "Billing page" (P2). A plain button, not a <form action>,
// since it needs to render an inline error if Dodo Payments rejects the
// checkout request -- createCheckoutAction only ever returns on failure
// (its success path is a redirect(), which throws and never returns here).
export function BillingPlanButton({ plan, label }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result = await createCheckoutAction(plan);
      if (result && !result.ok) {
        setError(result.error ?? "Failed to start checkout");
      }
    });
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className="w-full rounded bg-teal-600 px-3 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-40"
      >
        {isPending ? "Redirecting…" : label}
      </button>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}
