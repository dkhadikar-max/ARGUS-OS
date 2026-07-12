"use client";

import { motion } from "framer-motion";

const GRAPHS = [
  {
    title: "Evidence Graph",
    description:
      "Captures all raw and derived signals about a prospect — firmographic, technographic, intent, and historical.",
    glyph: EvidenceGlyph,
  },
  {
    title: "Decision Graph",
    description:
      "The core asset — structured, auditable decisions with explicit reasoning chains and confidence scores.",
    glyph: DecisionGlyph,
  },
  {
    title: "Action Graph",
    description:
      "Links decisions to concrete actions — message drafts, outreach sequences, and CRM updates.",
    glyph: ActionGlyph,
  },
  {
    title: "Outcome Graph",
    description:
      "Ground truth that closes the learning loop — replies, meetings, opportunities, and closed revenue.",
    glyph: OutcomeGlyph,
  },
  {
    title: "Learning Graph",
    description:
      "Meta-layer that extracts patterns and improves future decisions based on historical outcomes.",
    glyph: LearningGlyph,
  },
];

export function FiveGraphsSection() {
  return (
    <section
      id="evidence"
      className="relative z-10 border-t border-default"
      style={{
        background:
          "linear-gradient(180deg, #0A0E17 0%, rgba(17,24,39,0.8) 100%)",
      }}
    >
      <div className="max-w-[1200px] mx-auto px-6 lg:px-12 py-32">
        <div className="section-label">The Five Graphs</div>
        <h2 className="text-heading text-pearl mb-16 max-w-[600px]">
          Every decision is a node.
          <br />
          <strong className="font-semibold">Every node is a lesson.</strong>
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          {GRAPHS.map((graph, i) => (
            <motion.div
              key={graph.title}
              id={graph.title === "Outcome Graph" ? "outcomes" : undefined}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
            >
              <GraphCard {...graph} />
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

function GraphCard({
  title,
  description,
  glyph: Glyph,
}: {
  title: string;
  description: string;
  glyph: React.FC<{ className?: string }>;
}) {
  return (
    <div className="group border border-default bg-graphite/40 p-6 relative overflow-hidden hover:border-bright transition-all duration-300">
      {/* Top accent line */}
      <div className="absolute top-0 left-0 right-0 h-0.5 bg-slate group-hover:bg-amber transition-colors duration-300" />

      <div className="mb-4 text-slate group-hover:text-amber transition-colors duration-300">
        <Glyph className="w-8 h-8" />
      </div>

      <h3 className="font-mono text-[13px] font-semibold text-pearl mb-2 tracking-tight">
        {title}
      </h3>
      <p className="text-[13px] leading-relaxed text-ash">{description}</p>
    </div>
  );
}

/* --- Custom Glyphs (Argus Glyphs) --- */

function EvidenceGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      className={className}
    >
      <circle cx="16" cy="16" r="6" />
      <circle cx="16" cy="16" r="12" strokeDasharray="4 4" />
      <path d="M16 4v4M16 24v4M4 16h4M24 16h4" />
      <path d="M8 8l2.5 2.5M21.5 21.5L24 24M24 8l-2.5 2.5M8 24l2.5-2.5" />
    </svg>
  );
}

function DecisionGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      className={className}
    >
      <path d="M8 24L16 8l8 16H8z" />
      <circle cx="16" cy="18" r="2" fill="currentColor" />
      <path d="M16 8v4" />
    </svg>
  );
}

function ActionGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      className={className}
    >
      <path d="M6 26V12l6-6 6 6v14" />
      <path d="M10 26v-8h4v8" />
      <path d="M18 26v-6h4v6" />
      <path d="M6 12h12" />
    </svg>
  );
}

function OutcomeGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      className={className}
    >
      <path d="M6 20c0-8 4-14 10-14s10 6 10 14" />
      <path d="M6 20h20" />
      <circle cx="16" cy="20" r="3" fill="currentColor" />
      <path d="M16 23v4" />
    </svg>
  );
}

function LearningGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      className={className}
    >
      <path d="M16 4v24" />
      <path d="M4 12l12-4 12 4" />
      <path d="M4 20l12-4 12 4" />
      <circle cx="16" cy="8" r="2" fill="currentColor" />
      <circle cx="16" cy="16" r="2" fill="currentColor" />
      <circle cx="16" cy="24" r="2" fill="currentColor" />
    </svg>
  );
}
