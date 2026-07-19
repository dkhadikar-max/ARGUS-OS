import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { NavBar } from "../components/NavBar";
import { PostHogIdentify } from "../components/PostHogIdentify";
import { ExtensionAuthSync } from "../components/ExtensionAuthSync";
import "./globals.css";

export const metadata: Metadata = {
  title: "ARGUS AI",
  description: "The Decision Operating System for B2B Revenue Teams",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="en">
        <head>
          {/* Brand v1.0 §3 Typography: Satoshi isn't on Google Fonts, so it
              can't go through next/font/google -- Fontshare is Satoshi's
              own free, official CDN. Falls back to the brand doc's own
              specified stack (see globals.css body rule) if this fails. */}
          <link
            rel="stylesheet"
            href="https://api.fontshare.com/v2/css?f[]=satoshi@400,500,600,700,900&display=swap"
          />
        </head>
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
