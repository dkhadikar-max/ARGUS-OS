"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/queue", label: "Today's Queue" },
  { href: "/analytics", label: "Analytics" },
  { href: "/company-memory", label: "Company Memory" },
  { href: "/settings", label: "Settings" },
  { href: "/billing", label: "Billing" },
  // Admin API Increment A -- always rendered, not conditionally hidden.
  // This dashboard has no safe client-visible way to know admin status
  // (ADMIN_EMAILS lives only in apps/api); a non-admin who clicks lands on
  // an honest 403 panel, since the API remains the real gate.
  { href: "/admin/shadow-decisions", label: "Admin", activeMatch: "/admin" as const },
];

// Design System Pass (2026-08-01) -- split out of NavBar.tsx (a Server
// Component, since it awaits auth()) so the link row can use usePathname()
// for active-route styling, matching AdminSubNav.tsx's already-correct
// border-teal-600/text-teal-700 pattern -- NavBar previously had no active
// state at all.
export function NavLinks() {
  const pathname = usePathname();

  return (
    <>
      {LINKS.map((link) => {
        const isActive = link.activeMatch ? pathname.startsWith(link.activeMatch) : pathname === link.href;
        return (
          <Link
            key={link.href}
            href={link.href}
            className={`text-sm font-medium ${isActive ? "text-teal-700" : "text-gray-600 hover:text-teal-700"}`}
          >
            {link.label}
          </Link>
        );
      })}
    </>
  );
}
