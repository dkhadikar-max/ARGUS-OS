"use client";

import { motion } from "framer-motion";

// Brand v1.0 §7 "Verdict States" defines STRONG YES and YES as two
// distinct Teal shades (#00F5E8 vs #00D1C8), not the same hue at different
// opacities -- teal-glow (the brighter shade) is used here specifically
// for STRONG YES to keep that distinction faithful.
const VERDICTS = [
  {
    label: "STRONG YES",
    range: "90-100",
    description: "High ICP fit + strong intent + low risk. Message immediately.",
    badgeClass:
      "bg-teal-glow/15 text-teal-glow border border-teal-glow/30",
  },
  {
    label: "YES",
    range: "70-89",
    description: "Good fit with manageable risk. Proceed with standard outreach.",
    badgeClass:
      "bg-signal/8 text-signal border border-signal/20",
  },
  {
    label: "WAIT",
    range: "50-69",
    description: "Potential fit but insufficient signal. Monitor for intent changes.",
    badgeClass: "bg-wait/8 text-wait border border-wait/20",
  },
  {
    label: "PASS",
    range: "30-49",
    description: "Poor fit or high risk. Do not invest time unless signal changes.",
    badgeClass: "bg-pass/8 text-pass border border-pass/20",
  },
  {
    label: "HARD PASS",
    range: "0-29",
    description: "Clear misalignment. Avoid to protect pipeline hygiene.",
    badgeClass:
      "bg-hard-pass/50 text-ash border border-slate",
  },
];

export function VerdictSpectrumSection() {
  return (
    <section id="reasoning" className="relative z-10 border-t border-default">
      <div className="max-w-[1200px] mx-auto px-6 lg:px-12 py-32">
        <div className="section-label">The Verdict Spectrum</div>
        <h2 className="text-heading text-pearl mb-16">
          Not just scores.
          <br />
          <strong className="font-semibold">Verdicts with reasoning.</strong>
        </h2>

        <div className="border border-default">
          <div className="grid grid-cols-1 md:grid-cols-5">
            {VERDICTS.map((v, i) => (
              <motion.div
                key={v.label}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: i * 0.1 }}
                className={`p-8 md:p-10 text-center border-b md:border-b-0 md:border-r border-default last:border-r-0 hover:bg-slate/15 transition-colors duration-300`}
              >
                <div
                  className={`inline-block font-mono text-[11px] font-semibold px-3 py-1.5 tracking-[0.05em] mb-4 ${v.badgeClass}`}
                >
                  {v.label}
                </div>
                <div className="font-mono text-3xl font-semibold text-pearl mb-2">
                  {v.range}
                </div>
                <div className="text-[13px] text-ash leading-relaxed">
                  {v.description}
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
