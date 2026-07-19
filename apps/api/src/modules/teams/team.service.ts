import {
  AppError,
  icpWeightsAreValid,
  type CompleteOnboardingRequest,
  type TeamResponse,
} from "@argus/shared";
import { ADMIN_ROLES, type AuthContext } from "../../middleware/auth.js";
import { recordAudit, type RequestMeta } from "../../lib/audit.js";
import { completeTeamOnboarding, getTeam, updateCompanyContext } from "./team.repository.js";
import { suggestCompanyContextFromWebsite } from "./company-context.service.js";

function toTeamResponse(team: NonNullable<Awaited<ReturnType<typeof getTeam>>>): TeamResponse {
  return {
    id: team.id,
    name: team.name,
    slug: team.slug,
    plan: team.plan,
    billingStatus: team.billingStatus,
    onboardedAt: team.onboardedAt ? team.onboardedAt.toISOString() : null,
    companyContext: team.companyContext,
  };
}

function requireAdmin(auth: AuthContext, action: string): void {
  if (!auth.role || !ADMIN_ROLES.has(auth.role)) {
    throw new AppError("FORBIDDEN", `Only a team admin can ${action}`);
  }
}

export async function getTeamForUser(auth: AuthContext): Promise<TeamResponse> {
  const team = await getTeam(auth.teamId);
  if (!team) throw new AppError("NOT_FOUND", "Team not found");
  return toTeamResponse(team);
}

export async function completeOnboardingForTeam(
  auth: AuthContext,
  request: CompleteOnboardingRequest,
  meta?: RequestMeta,
): Promise<TeamResponse> {
  // Same gate icp.service.ts's updateIcpForTeam uses -- onboarding is "the
  // team admin sets the company up," and createUserWithPersonalTeam now
  // grants FOUNDER to a brand-new solo signup specifically so this doesn't
  // lock them out of their own team's setup.
  requireAdmin(auth, "complete onboarding");
  if (!icpWeightsAreValid(request.criteria)) {
    const sum = request.criteria.reduce((total, c) => total + c.weight, 0);
    throw new AppError("VALIDATION_ERROR", `Criteria weights must sum to 1 (currently ${sum.toFixed(2)})`);
  }

  const team = await completeTeamOnboarding(auth.teamId, {
    name: request.name,
    criteria: request.criteria,
    companyContext: request.companyContext,
  });

  await recordAudit({
    entityType: "team",
    entityId: auth.teamId,
    action: "onboarded",
    actorId: auth.userId ?? "system",
    afterState: { name: team.name, criteriaCount: request.criteria.length },
    meta,
  });

  return toTeamResponse(team);
}

export async function suggestCompanyContext(auth: AuthContext, websiteUrl: string): Promise<string> {
  requireAdmin(auth, "generate a company profile");
  return suggestCompanyContextFromWebsite(websiteUrl);
}

export async function updateCompanyContextForTeam(
  auth: AuthContext,
  companyContext: string | undefined,
  meta?: RequestMeta,
): Promise<TeamResponse> {
  requireAdmin(auth, "edit the company profile");
  const team = await updateCompanyContext(auth.teamId, companyContext);

  await recordAudit({
    entityType: "team",
    entityId: auth.teamId,
    action: "company_context_updated",
    actorId: auth.userId ?? "system",
    afterState: { companyContextLength: companyContext?.length ?? 0 },
    meta,
  });

  return toTeamResponse(team);
}
