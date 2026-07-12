"use client";

import { motion } from "framer-motion";

export function HeroSection() {
  return (
    <section className="relative z-10 min-h-screen flex items-center pt-16">
      <div className="max-w-[1200px] w-full mx-auto px-6 lg:px-12">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center">
          {/* Left: Text */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
          >
            <div className="flex items-center gap-2 mb-4">
              <div className="w-1.5 h-1.5 bg-amber rotate-45" />
              <span className="font-mono text-[11px] text-amber uppercase tracking-[0.15em]">
                Decision Operating System v3.0
              </span>
            </div>

            {/* Policy v2.1 Homepage Hierarchy, step 1 "Pain" (frozen, do not
                change): the concrete cost the rest of the page's evidence-
                and-reasoning pitch is answering. */}
            <p className="font-mono text-[13px] text-ash uppercase tracking-[0.1em] mb-4">
              40% of pipeline time is wasted on poor-fit prospects.
            </p>

            <h1 className="text-display text-pearl mb-6">
              Every revenue team has AI.
              <br />
              Nobody has a{" "}
              <strong className="text-amber font-semibold">
                Decision OS.
              </strong>
            </h1>

            {/* Policy v2.1 Homepage Hierarchy, step 2 "Promise" and the
                separately-frozen "One-Liner" — both quoted verbatim,
                do not change either. */}
            <p className="text-lg text-ash leading-relaxed max-w-[480px] mb-2">
              Know why before you act — every time.
            </p>
            <p className="text-lg text-pearl font-semibold leading-relaxed max-w-[480px] mb-10">
              Stop guessing. Start deciding with evidence.
            </p>

            {/* Policy v2.1 Homepage Hierarchy, step 5 "Path" (frozen):
                Free Assessment (primary) / Intelligence Sprint (secondary).
                Both scroll to the same CTA section below — "View the
                Evidence Chain" (→ #evidence) isn't lost, it's still one
                click away via the Evidence link already in the nav bar. */}
            <div className="flex flex-wrap gap-4 mb-12">
              <a
                href="#start"
                className="font-mono text-[13px] font-semibold px-8 py-4 bg-amber text-obsidian tracking-[0.05em] hover:bg-amber-glow transition-colors duration-200"
              >
                Free Assessment
              </a>
              <a
                href="#start"
                className="font-mono text-[13px] px-8 py-4 border border-slate text-ash hover:text-pearl hover:border-ash transition-colors duration-200"
              >
                Intelligence Sprint
              </a>
            </div>

            <div className="flex flex-wrap gap-6 font-mono text-[11px] text-slate">
              <span>&lt;10s verdict</span>
              <span>5-agent debate</span>
              <span>Decision Graph</span>
            </div>
          </motion.div>

          {/* Right: Sidebar Visual */}
          <motion.div
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, delay: 0.3, ease: "easeOut" }}
            className="flex items-center justify-center"
          >
            <SidebarMockup />
          </motion.div>
        </div>
      </div>
    </section>
  );
}

function SidebarMockup() {
  return (
    <div className="w-full max-w-[360px] border border-default bg-graphite/60 backdrop-blur-sm overflow-hidden">
      {/* Header */}
      <div className="h-10 border-b border-default flex items-center justify-between px-4">
        <span className="font-mono text-[10px] text-ash uppercase tracking-[0.1em]">
          ARGUS Sidebar
        </span>
        <div className="flex items-center gap-1.5 text-signal font-mono text-[10px]">
          <div className="w-1.5 h-1.5 rounded-full bg-signal animate-blink" />
          Live
        </div>
      </div>

      {/* Verdict Card */}
      <div className="m-4 p-4 border border-bright bg-amber/5">
        <div className="flex justify-between items-center mb-2">
          <span className="font-mono text-[10px] text-ash uppercase tracking-[0.1em]">
            Verdict
          </span>
          <span className="font-mono text-[10px] text-ash">94% conf</span>
        </div>
        <div className="font-mono text-lg font-semibold text-amber mb-1">
          STRONG YES
        </div>
        <div className="font-mono text-[10px] text-ash leading-relaxed">
          Weighted: ICP(40%) + Intent(35%) + Risk(15%) + Research(10%)
        </div>
      </div>

      {/* Evidence List */}
      <div className="mx-4 flex flex-col gap-2 mb-4">
        <EvidenceItem
          status="verified"
          text="ICP Match: 5/5 criteria"
          sub="Series B, 87 employees, VP Engineering"
        />
        <EvidenceItem
          status="verified"
          text="Intent Signal: Hiring 3 SREs"
          sub="Scaling pain confirmed (Apollo)"
        />
        <EvidenceItem
          status="caution"
          text="Risk: No previous engagement"
          sub="Cold outreach required"
        />
      </div>

      {/* Message Preview */}
      <div className="mx-4 p-3 border border-default bg-graphite text-xs leading-relaxed text-pearl mb-3">
        Hi Sarah — saw your recent post on scaling K8s. We helped{" "}
        <span className="text-amber">[Similar Company]</span> reduce infra
        costs by 40% during their Series B growth phase. Would you be open to a
        brief exchange on how you&apos;re approaching this?
      </div>

      {/* Message Actions */}
      <div className="mx-4 flex gap-2 mb-3">
        <button className="flex-1 py-2 font-mono text-[10px] border border-amber text-amber text-center hover:bg-amber/10 transition-colors">
          Copy
        </button>
        <button className="flex-1 py-2 font-mono text-[10px] border border-slate text-ash text-center hover:border-ash transition-colors">
          Edit
        </button>
        <button className="flex-1 py-2 font-mono text-[10px] border border-slate text-ash text-center hover:border-ash transition-colors">
          Regenerate
        </button>
      </div>

      {/* Verdict Actions */}
      <div className="mx-4 mb-4 grid grid-cols-5 gap-1">
        {["STRONG YES", "YES", "WAIT", "PASS", "HARD PASS"].map((v) => (
          <button
            key={v}
            className={`py-2 font-mono text-[9px] text-center border transition-colors ${
              v === "STRONG YES"
                ? "border-signal text-signal hover:bg-signal/10"
                : v === "WAIT"
                ? "border-wait text-wait hover:bg-wait/10"
                : v === "PASS"
                ? "border-pass text-pass hover:bg-pass/10"
                : "border-slate text-ash hover:border-ash"
            }`}
          >
            {v}
          </button>
        ))}
      </div>
    </div>
  );
}

function EvidenceItem({
  status,
  text,
  sub,
}: {
  status: "verified" | "caution";
  text: string;
  sub: string;
}) {
  const borderColor = status === "verified" ? "border-signal" : "border-caution";
  const iconColor = status === "verified" ? "#059669" : "#D97706";

  return (
    <div
      className={`flex items-start gap-2.5 font-mono text-[10px] text-ash p-2 border-l-2 ${borderColor} bg-slate/10`}
    >
      <svg
        className="w-3.5 h-3.5 flex-shrink-0 mt-px"
        viewBox="0 0 14 14"
        fill="none"
      >
        {status === "verified" ? (
          <path
            d="M2 7L5.5 10.5L12 3.5"
            stroke={iconColor}
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : (
          <>
            <path
              d="M7 3V8"
              stroke={iconColor}
              strokeWidth="1.5"
              strokeLinecap="round"
            />
            <circle cx="7" cy="11" r="0.8" fill={iconColor} />
          </>
        )}
      </svg>
      <div>
        <div className="text-pearl">{text}</div>
        <div className="text-ash">{sub}</div>
      </div>
    </div>
  );
}
