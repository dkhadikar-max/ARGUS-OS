"use client";

import { motion } from "framer-motion";

// Bible §13.2 Pricing Tiers — the ARGUS Unanimous Policy v2.1 "Three Entry
// Paths (Do Not Change)" GTM pricing (Free Assessment $0 / Intelligence
// Sprint $7,500 / Enterprise Engagement $25,000+) is deferred until the
// Phase 3 enterprise motion (2026-07-17 decision) in favor of showing the
// Bible's actual subscription tiers here today. Reuses the exact same
// bordered-grid-of-cards pattern this section (and VerdictSpectrumSection)
// already established, 4 columns instead of 3.
const PATHS = [
  {
    name: "Free",
    price: "$0",
    cadence: "",
    seats: "1 seat",
    decisions: "50 decisions/mo",
    features: "Basic verdict, LinkedIn only, no Slack",
    leadPath: "FREE" as const,
    cta: { label: "Start Free", subject: "Free Plan Signup" },
  },
  {
    name: "Starter",
    price: "$49",
    cadence: "/mo",
    seats: "3 seats",
    decisions: "500 decisions/mo",
    features: "Full verdict, Slack bot, queue, basic memory",
    leadPath: "STARTER" as const,
    cta: { label: "Start Starter", subject: "Starter Plan Signup" },
  },
  {
    name: "Pro",
    price: "$149",
    cadence: "/mo",
    seats: "10 seats",
    decisions: "2,500 decisions/mo",
    features: "Full debate view, team analytics, CRM sync",
    leadPath: "PRO" as const,
    cta: { label: "Start Pro", subject: "Pro Plan Signup" },
  },
  {
    name: "Enterprise",
    price: "$499",
    cadence: "/mo",
    seats: "Unlimited seats",
    decisions: "10,000 decisions/mo",
    features: "Custom ICP, API access, SSO, priority support",
    leadPath: "ENTERPRISE" as const,
    cta: { label: "Talk to Sales", subject: "Enterprise Plan Inquiry" },
  },
];

// No form fields exist on this single click, so there's no lead identity to
// send yet -- the visitor's actual identity only exists in whatever email
// they send next. Best-effort and never blocks the mailto: navigation: a
// failed request here must not stop someone from actually reaching out.
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

function recordLeadClick(path: (typeof PATHS)[number]["leadPath"]) {
  fetch(`${API_URL}/api/v1/leads`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path }),
  }).catch(() => {
    // Best-effort: the mailto: link below is the real call-to-action.
  });
}

export function CTASection() {
  return (
    <section
      id="start"
      className="relative z-10 border-t border-default text-center"
    >
      <div className="max-w-[1200px] mx-auto px-6 lg:px-12 py-32">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <div className="section-label">Get Started</div>
          <h2 className="text-heading text-pearl mb-6">
            Begin with <strong className="font-semibold">evidence.</strong>
          </h2>
          <p className="text-lg text-ash mb-16 max-w-[540px] mx-auto">
            Plans that scale with your team — from a free first look to full
            enterprise control.
          </p>

          <div className="border border-default">
            <div className="grid grid-cols-1 md:grid-cols-4">
              {PATHS.map((path, i) => (
                <motion.div
                  key={path.name}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: i * 0.1 }}
                  className="p-8 md:p-10 text-left border-b md:border-b-0 md:border-r border-default last:border-r-0 hover:bg-slate/15 transition-colors duration-300 flex flex-col"
                >
                  <div className="font-mono text-[13px] font-semibold text-pearl uppercase tracking-[0.05em] mb-2">
                    {path.name}
                  </div>
                  <div className="mb-4">
                    <span className="font-mono text-3xl font-semibold text-amber">
                      {path.price}
                    </span>
                    <span className="font-mono text-[13px] text-ash">{path.cadence}</span>
                  </div>
                  <div className="font-mono text-[11px] text-ash mb-1">
                    {path.seats} · {path.decisions}
                  </div>
                  <div className="font-mono text-[11px] text-signal mb-8">
                    {path.features}
                  </div>
                  <a
                    href={`mailto:${path.name === "Enterprise" ? "sales" : "hello"}@argusos.com?subject=${encodeURIComponent(path.cta.subject)}`}
                    onClick={() => recordLeadClick(path.leadPath)}
                    className="mt-auto block w-full py-3 border border-amber text-amber text-center font-mono text-[13px] font-semibold tracking-[0.05em] hover:bg-amber/10 transition-colors duration-200"
                  >
                    {path.cta.label}
                  </a>
                </motion.div>
              ))}
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
