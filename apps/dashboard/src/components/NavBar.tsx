import { auth } from "@clerk/nextjs/server";
import { UserButton } from "@clerk/nextjs";
import { Logo } from "./Logo";
import { NavLinks } from "./NavLinks";

// Bible §18 DSH-1 "Next.js app shell". Server Component: only rendered for
// a signed-in session (sign-in/sign-up pages have none), so it never needs
// to be hidden client-side after the fact. Link rendering/active-state
// lives in NavLinks.tsx (a Client Component, since it needs usePathname())
// -- this component can't be "use client" itself, since it awaits auth().
//
// Design System Pass (2026-08-01) -- container widened from max-w-3xl to
// max-w-5xl: it previously underhung the content width on all 4 admin
// routes (which use max-w-5xl), a real visual mismatch, not a style
// preference.
export async function NavBar() {
  const { userId } = await auth();
  if (!userId) return null;

  return (
    <nav className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-6">
          <span className="flex items-center gap-2 text-sm font-bold text-navy">
            <Logo />
            ARGUS
          </span>
          <NavLinks />
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
