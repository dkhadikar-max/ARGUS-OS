import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { NavBar } from "../components/NavBar";
import "./globals.css";

export const metadata: Metadata = {
  title: "ARGUS AI",
  description: "The Decision Operating System for B2B Revenue Teams",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body className="min-h-screen bg-gray-50 text-gray-900 antialiased">
          <NavBar />
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
