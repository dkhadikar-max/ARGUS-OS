"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/admin/shadow-decisions", label: "Shadow Decisions" },
  { href: "/admin/analytics", label: "Analytics" },
];

// Lightweight in-section nav -- the top-level NavBar's single "Admin" link
// stays pointed at /admin/shadow-decisions as the primary entry point; this
// switches between the two admin pages without adding more top-level links.
export function AdminSubNav() {
  const pathname = usePathname();

  return (
    <div className="mb-4 flex gap-4 border-b border-gray-200 text-sm">
      {LINKS.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className={`border-b-2 px-1 pb-2 font-medium ${
            pathname === link.href ? "border-teal-600 text-teal-700" : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          {link.label}
        </Link>
      ))}
    </div>
  );
}
