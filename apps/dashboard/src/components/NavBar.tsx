import Link from "next/link";
import { auth } from "@clerk/nextjs/server";

// Bible §18 DSH-1 "Next.js app shell". Server Component: only rendered for
// a signed-in session (sign-in/sign-up pages have none), so it never needs
// to be hidden client-side after the fact.
export async function NavBar() {
  const { userId } = await auth();
  if (!userId) return null;

  return (
    <nav className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-3xl items-center gap-6 px-4 py-3">
        <span className="text-sm font-bold text-gray-900">ARGUS</span>
        <Link href="/queue" className="text-sm font-medium text-gray-600 hover:text-gray-900">
          Today&apos;s Queue
        </Link>
        <Link href="/company-memory" className="text-sm font-medium text-gray-600 hover:text-gray-900">
          Company Memory
        </Link>
      </div>
    </nav>
  );
}
