"use client";

import { useMemo } from "react";

interface Node {
  top: string;
  left: string;
  variant: "active" | "signal" | "alert" | "default";
}

const NODES: Node[] = [
  { top: "20%", left: "15%", variant: "active" },
  { top: "35%", left: "80%", variant: "signal" },
  { top: "60%", left: "25%", variant: "alert" },
  { top: "45%", left: "55%", variant: "default" },
  { top: "75%", left: "70%", variant: "active" },
  { top: "15%", left: "45%", variant: "default" },
  { top: "85%", left: "40%", variant: "signal" },
  { top: "30%", left: "65%", variant: "default" },
  { top: "55%", left: "10%", variant: "active" },
  { top: "70%", left: "90%", variant: "default" },
];

function EvidenceNode({ node }: { node: Node }) {
  // Brand v1.0: "active" (a lively evidence point) now uses Teal, the
  // brand's primary accent for evidence/AI -- "signal" already resolves to
  // Teal too via the token change in tailwind.config.ts (brand has no
  // separate green), so its shadow color is updated to match.
  const variantClasses = {
    active: "border-teal shadow-[0_0_12px_rgba(0,209,200,0.4)] bg-teal/10",
    signal: "border-signal shadow-[0_0_8px_rgba(0,209,200,0.3)]",
    alert: "border-alert shadow-[0_0_8px_rgba(220,38,38,0.3)]",
    default: "border-slate",
  };

  return (
    <div
      className={`absolute w-2 h-2 border-[1.5px] rotate-45 animate-pulse-node ${variantClasses[node.variant]}`}
      style={{ top: node.top, left: node.left }}
    />
  );
}

export function EvidenceField() {
  const nodes = useMemo(() => NODES, []);

  return (
    <div className="fixed inset-0 pointer-events-none z-0 opacity-40">
      {/* Grid */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `
            linear-gradient(rgba(42,58,78,0.1) 1px, transparent 1px),
            linear-gradient(90deg, rgba(42,58,78,0.1) 1px, transparent 1px)
          `,
          backgroundSize: "60px 60px",
        }}
      />
      {/* Vignette */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at 50% 50%, transparent 0%, #0A1628 70%)",
        }}
      />
      {/* Evidence Nodes */}
      {nodes.map((node, i) => (
        <EvidenceNode key={i} node={node} />
      ))}
    </div>
  );
}
