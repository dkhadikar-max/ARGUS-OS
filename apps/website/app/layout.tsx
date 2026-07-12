import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
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
  description:
    "AI Revenue Intelligence that tells your team what to do next—and why. Analyze prospects, explain decisions, learn from outcomes, and build company-wide revenue intelligence.",
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
      <body className="bg-obsidian text-pearl antialiased">{children}</body>
    </html>
  );
}
