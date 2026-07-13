import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "ARGUS AI — Decision Operating System for B2B Revenue Teams",
  // Policy v2.1 "Do Not Change": the One-Liner and Promise, quoted verbatim
  // -- replacing the previous "AI Revenue Intelligence" framing, which read
  // too close to the "Decision Intelligence" branding the Policy killed in
  // favor of "Decision Operating System."
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
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body className="bg-obsidian text-pearl antialiased">
        {children}
        <SpeedInsights />
      </body>
    </html>
  );
}
