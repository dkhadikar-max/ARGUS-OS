"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Complete the Redesign (2026-08-02) -- relabeled to the "four core
// nouns" (Queue/Memory/Performance/Settings); Billing and Admin are kept
// as-is (secondary utility links, not part of the core-noun set). hrefs
// are unchanged -- this is a label-only rename, no route moved.
const LINKS = [
  { href: "/queue", label: "Queue" },
  { href: "/analytics", label: "Performance" },
  { href: "/company-memory", label: "Memory" },
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
