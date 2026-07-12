"use client";

import { motion } from "framer-motion";

// ARGUS Unanimous Policy v2.1 §"FINAL GTM" — "Three Entry Paths (Do Not
// Change)". This supersedes the SaaS-tier Free/Starter/Pro/Enterprise CTA
// that lived here before: that table (Bible §13.2) is still the real
// ongoing subscription plan a customer lands on, but it isn't what the
// Policy's own frozen Homepage Hierarchy calls for at the "Path" step --
// the entry motion is these three paths, keyed to company size/budget/
// signal, not the subscription tiers themselves. Reuses the exact same
// bordered-grid-of-cards pattern this section (and VerdictSpectrumSection)
// already established, just 3 columns instead of 4.
//
// Unlike the SaaS tiers earlier today, dollar amounts here are shown
// deliberately: the Policy explicitly prices all three ("Do Not Change")
// and the earlier instruction to withhold pricing applied to the Bible's
// subscription tiers specifically, not this separately-frozen GTM policy.
const PATHS = [
  {
    name: "Free Decision Assessment",
    price: "$0",
    target: "10-50 employees, no budget yet",
    signal: "First contact",
    cta: { label: "Start Free Assessment", subject: "Free Decision Assessment Request" },
  },
  {
    name: "Intelligence Sprint",
    price: "$7,500",
    target: "50-200 employees, tool budget",
    signal: "Qualified",
    cta: { label: "Book the Intelligence Sprint", subject: "Intelligence Sprint Request" },
  },
  {
    name: "Enterprise Engagement",
    price: "$25,000+",
    target: "200+ employees, CRO / procurement",
    signal: "Security review",
    cta: { label: "Talk to Enterprise Sales", subject: "Enterprise Engagement Inquiry" },
  },
];

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
            Three ways in, matched to where your team is today — from a free
            first look to a full enterprise engagement.
          </p>

          <div className="border border-default">
            <div className="grid grid-cols-1 md:grid-cols-3">
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
                  <div className="font-mono text-3xl font-semibold text-amber mb-4">
                    {path.price}
                  </div>
                  <div className="font-mono text-[11px] text-ash mb-1">
                    {path.target}
                  </div>
                  <div className="font-mono text-[11px] text-signal mb-8">
                    Signal: {path.signal}
                  </div>
                  <a
                    href={`mailto:hello@argusos.com?subject=${encodeURIComponent(path.cta.subject)}`}
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
