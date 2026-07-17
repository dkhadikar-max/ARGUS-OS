import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      // ARGUS OS Brand Guidelines v1.0 (2026-07-17) supersedes the Bible
      // §1.2 visual identity these tokens originally held (Obsidian/Amber,
      // Peacock Glyph) -- same class names kept throughout every component
      // (obsidian/pearl/slate/etc.) to avoid a full rename across the
      // codebase; only the underlying hex values changed, plus two new
      // tokens (teal/teal-glow) for the brand's new primary accent.
      colors: {
        obsidian: "#0A1628", // Brand Navy
        graphite: "#0F1E35", // derived surface shade (brand doesn't define a card/surface tone)
        slate: "#2A3A4E", // brand's own verdict "PASS... fades to void" color, reused as connective tissue
        ash: "#8899AA", // matches the motion identity's own subtitle gray
        pearl: "#FFFFFF", // Brand White
        amber: {
          DEFAULT: "#F5A623", // Brand Amber (CTA, verdict highlight)
          glow: "#FFC15E",
        },
        teal: {
          DEFAULT: "#00D1C8", // Brand Teal (primary accent, evidence, AI)
          glow: "#00F5E8",
        },
        // Brand v1.0 defines only 5 tokens total (Teal/Navy/White/Gray/
        // Amber) -- no green, and only 4 verdict tiers (STRONG YES/YES/
        // WAIT/PASS) where this site has 5 (...plus HARD PASS). Values
        // below are derived, not in the brand doc:
        // - signal: unified into Teal itself (brand has no separate
        //   "positive outcome" green -- Teal already covers evidence/AI/
        //   positive signal semantically).
        // - alert: kept as the pre-brand red; removing all red would
        //   leave no way to signal "bad/error" at all.
        // - wait: Brand's own defined WAIT cyan.
        // - pass / hard-pass: Brand's PASS ("Core fades to void", #2A3A4E)
        //   reads as the *worst* end of the scale, not a middle tier --
        //   mapped to this site's HARD_PASS (the true give-up state)
        //   rather than its own PASS, with an intermediate shade derived
        //   for PASS itself.
        signal: "#00D1C8",
        alert: "#DC2626",
        caution: "#F5A623",
        wait: "#00A8E8",
        pass: "#3D4F63",
        "hard-pass": "#2A3A4E",
      },
      fontFamily: {
        // Brand v1.0 §3 Typography: 'Satoshi', system-ui, -apple-system,
        // 'Segoe UI', sans-serif -- loaded via Fontshare's CDN (layout.tsx),
        // since Satoshi isn't on Google Fonts / next/font. JetBrains Mono
        // is kept for evidence/verdict/timestamp display -- the brand doc
        // only specifies a UI sans-serif and is silent on monospace use,
        // not a conflict with the existing Bible-derived choice.
        sans: ["Satoshi", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
      fontSize: {
        display: ["64px", { lineHeight: "1.05", letterSpacing: "-0.03em" }],
        "display-sm": ["40px", { lineHeight: "1.1", letterSpacing: "-0.02em" }],
        heading: ["48px", { lineHeight: "1.1", letterSpacing: "-0.02em" }],
        "heading-sm": ["32px", { lineHeight: "1.15", letterSpacing: "-0.01em" }],
      },
      borderColor: {
        DEFAULT: "rgba(42, 58, 78, 0.5)", // new slate value at the same alpha
        bright: "rgba(0, 209, 200, 0.3)", // Brand Teal, replacing the old amber-tinted highlight border
      },
      animation: {
        "pulse-node": "pulseNode 4s ease-in-out infinite",
        "blink": "blink 2s infinite",
        "draw": "draw 0.8s ease-out forwards",
      },
      keyframes: {
        pulseNode: {
          "0%, 100%": { opacity: "0.3", transform: "rotate(45deg) scale(1)" },
          "50%": { opacity: "1", transform: "rotate(45deg) scale(1.2)" },
        },
        blink: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.3" },
        },
        draw: {
          "0%": { strokeDashoffset: "100" },
          "100%": { strokeDashoffset: "0" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
