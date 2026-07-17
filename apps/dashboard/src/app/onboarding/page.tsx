import { redirect } from "next/navigation";
import { api } from "../../lib/api-client";
import { OnboardingWizard } from "../../components/OnboardingWizard";

// Bible has no onboarding wireframe (see apps/api's webhook.repository.ts
// createUserWithPersonalTeam comment) -- Clerk's sign-up/sign-in both land
// here (fallbackRedirectUrl), and this route redirects straight to /queue
// once Team.onboardedAt is already set, so returning users -- and any
// teammate joining an already-onboarded team -- never see the wizard.
export default async function OnboardingPage() {
  const [team, icp] = await Promise.all([api.getTeam(), api.getIcp()]);

  if (team.onboardedAt) {
    redirect("/queue");
  }

  return <OnboardingWizard initialName={team.name} initialCriteria={icp.criteria} />;
}
