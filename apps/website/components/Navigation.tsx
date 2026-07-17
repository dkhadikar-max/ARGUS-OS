"use client";

import { Logo } from "./Logo";

const NAV_LINKS = [
  { label: "Evidence", href: "#evidence" },
  { label: "Reasoning", href: "#reasoning" },
  { label: "Outcomes", href: "#outcomes" },
  { label: "Memory", href: "#memory" },
];

export function Navigation() {
  return (
    <nav className="fixed top-0 left-0 right-0 h-16 border-b border-default bg-obsidian/85 backdrop-blur-xl z-50 flex items-center justify-between px-6 lg:px-12">
      <div className="flex items-center gap-3">
        <Logo className="w-7 h-7 text-pearl" />
        <span className="font-mono font-semibold text-lg tracking-tight text-pearl">
          ARGUS
        </span>
      </div>

      <div className="hidden md:flex items-center gap-8">
        {NAV_LINKS.map((link) => (
          <a
            key={link.label}
            href={link.href}
            className="font-mono text-[13px] text-ash hover:text-amber transition-colors duration-200"
          >
            {link.label}
          </a>
        ))}
      </div>

      <a
        href="#start"
        className="font-mono text-xs font-semibold px-5 py-2.5 bg-amber text-obsidian tracking-[0.05em] uppercase hover:bg-amber-glow transition-colors duration-200"
      >
        Start Free
      </a>
    </nav>
  );
}
