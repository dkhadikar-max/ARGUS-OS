import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6">
      <span className="text-sm font-bold text-gray-900">ARGUS</span>
      {/* /onboarding redirects straight to /queue once Team.onboardedAt is
          already set, so this is safe for returning users too -- one route
          decides where a signed-in user lands, not two separate targets
          that could drift out of sync. */}
      <SignIn fallbackRedirectUrl="/onboarding" />
    </div>
  );
}
