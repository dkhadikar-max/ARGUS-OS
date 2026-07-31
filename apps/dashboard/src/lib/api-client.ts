import { auth } from "@clerk/nextjs/server";
import type {
  AdminListShadowDecisionsQuery,
  AdminListShadowDecisionsResponse,
  AdminShadowDecisionDetailResponse,
  CompanyMemoryResponse,
  CompleteOnboardingRequest,
  CreateActionRequest,
  CreateActionResponse,
  CreateCheckoutRequest,
  CreateCheckoutResponse,
  DecisionResponse,
  IcpResponse,
  ListOutcomesResponse,
  PolicyResponse,
  QueueResponse,
  SlackIntegrationStatusResponse,
  SuggestCompanyContextRequest,
  SuggestCompanyContextResponse,
  TeamResponse,
  UpdateCompanyContextRequest,
  UpdateIcpRequest,
  UpdatePolicyRequest,
  UpdateUserPreferencesRequest,
  UserPreferencesResponse,
} from "@argus/shared";
import { env } from "./env";

export class ApiError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
  }
}

/** True only for a real 403 ApiError -- the Admin API's requireAdmin gate.
 *  A pure helper so a Server Component's 403-vs-everything-else branch is
 *  independently testable, not only exercisable via an untested page.tsx. */
export function isForbiddenError(err: unknown): boolean {
  return err instanceof ApiError && err.status === 403;
}

/**
 * Server-side only (Next.js Server Components / Route Handlers / Server
 * Actions). Uses the signed-in rep's own Clerk session token as the Bearer
 * credential — the same JWT auth path apps/api already verifies for the
 * extension (Bible §10.1), so the dashboard needs no separate service
 * credential.
 */
async function apiFetch<T>(path: string, init?: RequestInit, presetToken?: string): Promise<T> {
  let token = presetToken;
  if (!token) {
    const { getToken } = await auth();
    token = (await getToken()) ?? undefined;
  }
  if (!token) {
    throw new ApiError("Not authenticated");
  }

  const response = await fetch(`${env.API_BASE_URL}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...init?.headers },
    cache: "no-store",
  });

  // A non-JSON body (e.g. a proxy/platform returning an HTML error page for
  // a 502/503, which happens during real infra hiccups) must not throw a
  // raw SyntaxError out of response.json() -- that bypasses the ApiError
  // wrapping below entirely and surfaces a generic, unhelpful crash instead
  // of a clear message. Parsed inside its own try/catch, checked against
  // response.ok (not assumed to have succeeded) either way.
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    if (!response.ok) {
      throw new ApiError(`Request failed with status ${response.status}`, response.status);
    }
    throw new ApiError("Response was not valid JSON");
  }

  if (!response.ok) {
    const message =
      typeof body === "object" && body && "error" in body
        ? (body as { error: { message: string } }).error.message
        : `Request failed with status ${response.status}`;
    throw new ApiError(message, response.status);
  }
  return body as T;
}

export const api = {
  getQueue: () => apiFetch<QueueResponse>("/api/v1/queue"),
  getSlackStatus: () => apiFetch<SlackIntegrationStatusResponse>("/api/v1/integrations/slack/status"),
  getCompanyMemory: () => apiFetch<CompanyMemoryResponse>("/api/v1/memory"),
  getPreferences: () => apiFetch<UserPreferencesResponse>("/api/v1/preferences"),
  updatePreferences: (payload: UpdateUserPreferencesRequest) =>
    apiFetch<UserPreferencesResponse>("/api/v1/preferences", {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  getIcp: () => apiFetch<IcpResponse>("/api/v1/icp"),
  updateIcp: (payload: UpdateIcpRequest) =>
    apiFetch<IcpResponse>("/api/v1/icp", { method: "PUT", body: JSON.stringify(payload) }),
  // Policy v2.1 L4 Policy Engine -- not the Bible, see packages/shared's
  // schemas/policy.ts.
  getPolicy: () => apiFetch<PolicyResponse>("/api/v1/policy"),
  updatePolicy: (payload: UpdatePolicyRequest) =>
    apiFetch<PolicyResponse>("/api/v1/policy", { method: "PUT", body: JSON.stringify(payload) }),
  // teamId is omitted -- outcome.routes.ts defaults it from the caller's
  // own JWT-resolved team when absent from the query string. userId scopes
  // just the `data` decision-history array server-side (Bible §4.4 Manager
  // Morgan "Filter by rep, see decision history") -- aggregations/accuracy
  // stay team-wide regardless, since outcome.service.ts's byVerdict/byRep
  // computations never read query.userId (see README "Analytics").
  getOutcomes: (params?: { userId?: string }) => {
    const query = new URLSearchParams({ limit: "20", offset: "0" });
    if (params?.userId) query.set("userId", params.userId);
    return apiFetch<ListOutcomesResponse>(`/api/v1/outcomes?${query.toString()}`);
  },
  getTeam: () => apiFetch<TeamResponse>("/api/v1/teams/me"),
  // Accepts an already-minted Clerk token instead of minting its own -- used
  // by /api/extension/session, which already has one from resolving its own
  // caller's identity and would otherwise mint a second token for the same
  // logical request on every dashboard page's auth-sync.
  getTeamWithToken: (token: string) => apiFetch<TeamResponse>("/api/v1/teams/me", undefined, token),
  completeOnboarding: (payload: CompleteOnboardingRequest) =>
    apiFetch<TeamResponse>("/api/v1/teams/me/onboarding", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  suggestCompanyContext: (payload: SuggestCompanyContextRequest) =>
    apiFetch<SuggestCompanyContextResponse>("/api/v1/teams/me/company-context/suggest", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateCompanyContext: (payload: UpdateCompanyContextRequest) =>
    apiFetch<TeamResponse>("/api/v1/teams/me/company-context", {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  createCheckout: (payload: CreateCheckoutRequest) =>
    apiFetch<CreateCheckoutResponse>("/api/v1/billing/checkout", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  getDecision: (decisionId: string) => apiFetch<DecisionResponse>(`/api/v1/decisions/${decisionId}`),
  recordAction: (decisionId: string, payload: CreateActionRequest) =>
    apiFetch<CreateActionResponse>(`/api/v1/decisions/${decisionId}/action`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  // Admin API Increment A -- cross-tenant Shadow Mode monitoring, gated
  // server-side by requireAdmin (email allowlist). A non-admin caller gets
  // a real 403 ApiError here, handled by isForbiddenError above.
  getShadowDecisions: (params?: Partial<AdminListShadowDecisionsQuery>) => {
    const query = new URLSearchParams();
    if (params?.teamId) query.set("teamId", params.teamId);
    if (params?.verdict) query.set("verdict", params.verdict);
    if (params?.verdictAgreement !== undefined) query.set("verdictAgreement", String(params.verdictAgreement));
    if (params?.from) query.set("from", params.from);
    if (params?.to) query.set("to", params.to);
    query.set("limit", String(params?.limit ?? 20));
    query.set("offset", String(params?.offset ?? 0));
    return apiFetch<AdminListShadowDecisionsResponse>(`/api/v1/admin/shadow-decisions?${query.toString()}`);
  },
  getShadowDecisionDetail: (id: string) =>
    apiFetch<AdminShadowDecisionDetailResponse>(`/api/v1/admin/shadow-decisions/${id}`),
};
