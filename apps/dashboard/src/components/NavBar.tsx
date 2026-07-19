import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { UserButton } from "@clerk/nextjs";
import { Logo } from "./Logo";

// Bible §18 DSH-1 "Next.js app shell". Server Component: only rendered for
// a signed-in session (sign-in/sign-up pages have none), so it never needs
// to be hidden client-side after the fact.
export async function NavBar() {
  const { userId } = await auth();
  if (!userId) return null;

  return (
    <nav className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-6">
          <span className="flex items-center gap-2 text-sm font-bold text-navy">
            <Logo />
            ARGUS
          </span>
          <Link href="/queue" className="text-sm font-medium text-gray-600 hover:text-teal-700">
            Today&apos;s Queue
          </Link>
          <Link href="/analytics" className="text-sm font-medium text-gray-600 hover:text-teal-700">
            Analytics
          </Link>
          <Link href="/company-memory" className="text-sm font-medium text-gray-600 hover:text-teal-700">
            Company Memory
          </Link>
          <Link href="/settings" className="text-sm font-medium text-gray-600 hover:text-teal-700">
            Settings
          </Link>
          <Link href="/billing" className="text-sm font-medium text-gray-600 hover:text-teal-700">
            Billing
          </Link>
        </div>
        {/* No Bible wireframe covers this, but Clerk's own UserButton is
            the standard "account + sign out" affordance and there was
            previously no way to sign out of the dashboard at all. Redirect
            target isn't a UserButton prop in this Clerk version -- it's
            controlled by the Clerk Dashboard's Paths settings instead. */}
        <UserButton />
      </div>
    </nav>
  );
}
