import type { Metadata } from "next";
import { Lato } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { NavBar } from "../components/NavBar";
import { PostHogIdentify } from "../components/PostHogIdentify";
import { ExtensionAuthSync } from "../components/ExtensionAuthSync";
import "./globals.css";

// Swapped in for Brand v1.0 §3's Satoshi (was loaded via a Fontshare CDN
// <link>) per direct feedback that it read as unfamiliar -- Lato is
// Slack's own UI typeface, and next/font self-hosts it at build time
// (no external CDN request, no font-swap layout shift). Feeds
// globals.css's --font-sans var, not apps/website -- scoped to the
// dashboard only, the surface this feedback was about.
const lato = Lato({
  subsets: ["latin"],
  weight: ["400", "700", "900"],
  variable: "--font-lato",
  display: "swap",
});

export const metadata: Metadata = {
  title: "ARGUS AI",
  description: "The Decision Operating System for B2B Revenue Teams",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="en" className={lato.variable}>
        <body className="min-h-screen bg-gray-50 text-gray-900 antialiased">
          <PostHogIdentify />
          <ExtensionAuthSync />
          <NavBar />
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
