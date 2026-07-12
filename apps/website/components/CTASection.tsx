"use client";

import { motion } from "framer-motion";

// Bible §13.2 Pricing Tiers — plan names, seat/decision caps, and feature
// summaries (dollar amounts deliberately omitted for now, per instruction).
// The earlier version of this section (a "$7,500 Revenue Sprint" audit) had
// no basis anywhere in the Bible; this replaces it with the Bible's actual
// plan structure, reusing the same "bordered grid of cards" pattern
// VerdictSpectrumSection already established on this page rather than
// introducing a new layout.
const PLANS = [
  {
    name: "Free",
    seats: "1 seat",
    decisions: "50 decisions/mo",
    features: ["Basic verdict", "LinkedIn only", "No Slack"],
  },
  {
    name: "Starter",
    seats: "3 seats",
    decisions: "500 decisions/mo",
    features: ["Full verdict", "Slack bot", "Queue", "Basic memory"],
  },
  {
    name: "Pro",
    seats: "10 seats",
    decisions: "2,500 decisions/mo",
    features: ["Full debate view", "Team analytics", "CRM sync"],
  },
  {
    name: "Enterprise",
    seats: "Unlimited seats",
    decisions: "10,000 decisions/mo",
    features: ["Custom ICP", "API access", "SSO", "Priority support"],
  },
];

export function CTASection() {
  return (
    <section
      id="plans"
      className="relative z-10 border-t border-default text-center"
    >
      <div className="max-w-[1200px] mx-auto px-6 lg:px-12 py-32">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <div className="section-label">Plans</div>
          <h2 className="text-heading text-pearl mb-6">
            Begin with <strong className="font-semibold">evidence.</strong>
          </h2>
          <p className="text-lg text-ash mb-16 max-w-[540px] mx-auto">
            Every plan runs on the same Decision Graph reasoning — begin free,
            upgrade as your team grows.
          </p>

          <div className="border border-default">
            <div className="grid grid-cols-1 md:grid-cols-4">
              {PLANS.map((plan, i) => (
                <motion.div
                  key={plan.name}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: i * 0.1 }}
                  className="p-8 md:p-10 text-left border-b md:border-b-0 md:border-r border-default last:border-r-0 hover:bg-slate/15 transition-colors duration-300"
                >
                  <div className="font-mono text-[13px] font-semibold text-pearl uppercase tracking-[0.05em] mb-2">
                    {plan.name}
                  </div>
                  <div className="font-mono text-[11px] text-ash mb-6">
                    {plan.seats} · {plan.decisions}
                  </div>
                  <ul className="space-y-2">
                    {plan.features.map((feature) => (
                      <li
                        key={feature}
                        className="text-[13px] text-ash leading-relaxed flex items-start gap-2"
                      >
                        <span className="text-amber font-mono font-semibold leading-none mt-0.5">
                          ›
                        </span>
                        {feature}
                      </li>
                    ))}
                  </ul>
                </motion.div>
              ))}
            </div>
          </div>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-6">
            <a
              href="mailto:hello@argusos.com?subject=Start%20My%20ARGUS%20Trial"
              className="px-8 py-4 bg-amber text-obsidian font-mono text-sm font-semibold tracking-[0.05em] uppercase hover:bg-amber-glow transition-colors duration-200"
            >
              Start Free
            </a>
            <a
              href="mailto:sales@argusos.com?subject=Enterprise%20Inquiry"
              className="font-mono text-[13px] text-ash hover:text-pearl transition-colors duration-200"
            >
              Enterprise? Talk to sales →
            </a>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
