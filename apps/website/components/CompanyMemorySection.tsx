"use client";

import { motion } from "framer-motion";

const PATTERNS = [
  {
    title: "Series B SaaS with 50-150 employees",
    meta: [
      "→ STRONG YES accuracy: 78% (12 decisions)",
      "→ Avg time to meeting: 4.2 days",
      "→ Best message tone: Bold, specific metric",
    ],
    type: "pattern" as const,
  },
  {
    title: "Fortune 500, new title < 6 months",
    meta: [
      "→ PASS accuracy: 91% (9 decisions)",
      "→ Reason: Long procurement cycles, low close rate",
    ],
    type: "pattern" as const,
  },
];

const RISKS = [
  {
    title: "Director title + >1000 employees",
    meta: [
      "23% meeting rate vs. 45% team average",
      "Recommendation: Require additional intent signal",
    ],
  },
  {
    title: "No tech stack overlap + Series A",
    meta: [
      "Close rate: 4% vs. 22% baseline",
      "Recommendation: Auto-PASS unless strong intent",
    ],
  },
];

const STATS = [
  { value: "243", label: "Decisions" },
  { value: "84%", label: "Accuracy" },
  { value: "12", label: "Patterns" },
];

export function CompanyMemorySection() {
  return (
    <section
      id="memory"
      className="relative z-10 border-t border-default bg-graphite"
    >
      <div className="max-w-[1200px] mx-auto px-6 lg:px-12 py-32">
        <div className="section-label">Company Memory</div>
        <h2 className="text-heading text-pearl mb-6">
          Your organization becomes smarter.
          <br />
          <strong className="font-semibold">Not the AI.</strong>
        </h2>
        <p className="text-lg text-ash max-w-[540px] mb-16 leading-relaxed">
          Every decision your team makes becomes permanent institutional
          intelligence. New hires start with the wisdom of your best veterans.
          Departures don&apos;t erase judgment.
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
          {/* Patterns Panel */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <div className="border border-default bg-obsidian p-6">
              <div className="flex justify-between items-center pb-3 border-b border-default mb-4">
                <span className="font-mono text-[10px] text-ash uppercase tracking-[0.1em]">
                  PATTERNS (last 30 days)
                </span>
                <span className="font-mono text-[10px] text-teal">Live</span>
              </div>

              {PATTERNS.map((p, i) => (
                <div
                  key={i}
                  className="p-3 border-l-2 border-teal bg-teal/5 mb-3"
                >
                  <div className="font-mono text-[11px] text-pearl font-semibold mb-1">
                    {p.title}
                  </div>
                  <div className="font-mono text-[10px] text-ash leading-relaxed">
                    {p.meta.map((m, j) => (
                      <div key={j}>{m}</div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Risk Panel */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            <div className="border border-default bg-obsidian p-6">
              <div className="flex justify-between items-center pb-3 border-b border-default mb-4">
                <span className="font-mono text-[10px] text-ash uppercase tracking-[0.1em]">
                  RISK FLAGS (auto-generated)
                </span>
                <span className="font-mono text-[10px] text-alert">Active</span>
              </div>

              {RISKS.map((r, i) => (
                <div
                  key={i}
                  className="p-3 border-l-2 border-alert bg-alert/5 mb-3"
                >
                  <div className="font-mono text-[11px] text-pearl font-semibold mb-1">
                    {r.title}
                  </div>
                  <div className="font-mono text-[10px] text-ash leading-relaxed">
                    {r.meta.map((m, j) => (
                      <div key={j}>{m}</div>
                    ))}
                  </div>
                </div>
              ))}

              {/* Stats */}
              <div className="grid grid-cols-3 gap-4 mt-6">
                {STATS.map((s) => (
                  <div key={s.label} className="text-center p-4 border border-default">
                    <div className="font-mono text-2xl font-semibold text-pearl">
                      {s.value}
                    </div>
                    <div className="font-mono text-[10px] text-ash uppercase tracking-[0.05em] mt-1">
                      {s.label}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
