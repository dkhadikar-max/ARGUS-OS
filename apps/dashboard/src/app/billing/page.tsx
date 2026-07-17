import type { PaidPlanTier } from "@argus/shared";
import { api } from "../../lib/api-client";
import { BillingPlanButton } from "../../components/BillingPlanButton";

// Bible §13.2 Pricing Tiers, §18 DSH-5 "Billing page" (P2). Checkout is
// Dodo Payments, not Stripe (unavailable in India) -- see apps/api's
// billing module. Only the 3 paid tiers need a checkout; Free ($0) is
// already what every team starts on.
const PAID_PLANS: Array<{
  plan: PaidPlanTier;
  name: string;
  price: string;
  seats: string;
  decisions: string;
  features: string;
}> = [
  {
    plan: "STARTER",
    name: "Starter",
    price: "$49/mo",
    seats: "3 seats",
    decisions: "500 decisions/mo",
    features: "Full verdict, Slack bot, queue, basic memory",
  },
  {
    plan: "PRO",
    name: "Pro",
    price: "$149/mo",
    seats: "10 seats",
    decisions: "2,500 decisions/mo",
    features: "Full debate view, team analytics, CRM sync",
  },
  {
    plan: "ENTERPRISE",
    name: "Enterprise",
    price: "$499/mo",
    seats: "Unlimited seats",
    decisions: "10,000 decisions/mo",
    features: "Custom ICP, API access, SSO, priority support",
  },
];

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string }>;
}) {
  const team = await api.getTeam();
  const { checkout } = await searchParams;

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      {checkout === "complete" && (
        <p className="mb-4 rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">
          Payment received — your plan will update as soon as Dodo Payments confirms the subscription.
        </p>
      )}
      {checkout === "cancelled" && (
        <p className="mb-4 rounded-md bg-yellow-50 px-3 py-2 text-sm text-yellow-800">
          Checkout was cancelled — your plan hasn&apos;t changed.
        </p>
      )}

      <header className="mb-6">
        <h1 className="text-lg font-bold text-gray-900">Billing</h1>
        <p className="mt-1 text-sm text-gray-500">
          Current plan: <span className="font-medium text-gray-900">{team.plan}</span>
        </p>
      </header>

      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Free</div>
        <p className="text-sm text-gray-600">$0 — 1 seat, 50 decisions/mo. Basic verdict, LinkedIn only, no Slack.</p>
        {team.plan === "FREE" && <p className="mt-2 text-xs font-medium text-blue-700">Current plan</p>}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
        {PAID_PLANS.map((p) => (
          <div key={p.plan} className="flex flex-col rounded-lg border border-gray-200 bg-white p-4">
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">{p.name}</div>
            <div className="mb-2 text-xl font-bold text-gray-900">{p.price}</div>
            <p className="mb-1 text-xs text-gray-500">
              {p.seats} · {p.decisions}
            </p>
            <p className="mb-4 text-xs text-gray-600">{p.features}</p>
            {team.plan === p.plan ? (
              <p className="mt-auto text-xs font-medium text-blue-700">Current plan</p>
            ) : (
              <div className="mt-auto">
                <BillingPlanButton plan={p.plan} label={`Upgrade to ${p.name}`} />
              </div>
            )}
          </div>
        ))}
      </div>
    </main>
  );
}
