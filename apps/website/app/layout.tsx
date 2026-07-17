import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";
import "./globals.css";

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "ARGUS AI — Decision Operating System for B2B Revenue Teams",
  description:
    "Stop guessing. Start deciding with evidence. ARGUS is the Decision Operating System for B2B revenue teams — know why before you act, every time.",
  keywords: [
    "AI sales tool",
    "revenue intelligence",
    "sales copilot",
    "decision operating system",
    "outbound AI",
    "B2B sales intelligence",
  ],
  openGraph: {
    title: "ARGUS AI — Decision Operating System",
    description: "Every revenue team has AI. Nobody has a Decision OS.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={jetbrainsMono.variable}>
      <head>
        {/* Brand v1.0 §3 Typography: Satoshi isn't on Google Fonts, so it
            can't go through next/font/google like JetBrains Mono below --
            Fontshare is Satoshi's own free, official CDN (same "link an
            external stylesheet" pattern as Google Fonts, just a different
            host). Falls back to the brand doc's own specified stack
            (system-ui/-apple-system/Segoe UI/sans-serif) if this fails to
            load. */}
        <link
          rel="stylesheet"
          href="https://api.fontshare.com/v2/css?f[]=satoshi@400,500,600,700,900&display=swap"
        />
      </head>
      <body className="bg-obsidian text-pearl antialiased">{children}</body>
    </html>
  );
}