import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        obsidian: "#0A0E17",
        graphite: "#111827",
        slate: "#374151",
        ash: "#6B7280",
        pearl: "#F3F4F6",
        amber: {
          DEFAULT: "#D97706",
          glow: "#F59E0B",
        },
        signal: "#059669",
        alert: "#DC2626",
        caution: "#D97706",
        wait: "#6366F1",
        pass: "#6B7280",
        "hard-pass": "#1F2937",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
      fontSize: {
        display: ["64px", { lineHeight: "1.05", letterSpacing: "-0.03em" }],
        "display-sm": ["40px", { lineHeight: "1.1", letterSpacing: "-0.02em" }],
        heading: ["48px", { lineHeight: "1.1", letterSpacing: "-0.02em" }],
        "heading-sm": ["32px", { lineHeight: "1.15", letterSpacing: "-0.01em" }],
      },
      borderColor: {
        DEFAULT: "rgba(55, 65, 81, 0.5)",
        bright: "rgba(217, 119, 6, 0.3)",
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
