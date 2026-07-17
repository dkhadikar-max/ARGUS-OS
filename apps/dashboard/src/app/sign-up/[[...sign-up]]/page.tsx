import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6">
      <span className="text-sm font-bold text-gray-900">ARGUS</span>
      {/* Every brand-new signup lands on /onboarding (Bible has no
          onboarding wireframe -- see webhook.repository.ts's
          createUserWithPersonalTeam comment) instead of straight into the
          app, so a fresh personal team gets a real name + first ICP before
          the Today Queue. */}
      <SignUp fallbackRedirectUrl="/onboarding" />
    </div>
  );
}
