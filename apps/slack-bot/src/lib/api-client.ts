import type {
  CreateActionRequest,
  CreateActionResponse,
  CreateDecisionRequest,
  CreateOutcomeRequest,
  CreateOutcomeResponse,
  DecisionResponse,
  OverrideDecisionRequest,
  OverrideDecisionResponse,
  QueueResponse,
  SlackTeamResolution,
  SlackUserResolution,
  LinkSlackUserRequest,
  LinkSlackUserResponse,
} from "@argus/shared";
import { env } from "../config/env.js";

async function request<T>(path: string, init: RequestInit): Promise<T> {
  const response = await fetch(`${env.API_BASE_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init.headers },
  });

  const body = await response.json();
  if (!response.ok) {
    const message =
      typeof body === "object" && body && "error" in body
        ? (body as { error: { message: string } }).error.message
        : `Request failed with status ${response.status}`;
    throw new Error(message);
  }
  return body as T;
}

/** Server-to-server calls, protected by INTERNAL_SERVICE_TOKEN (Bible §18). */
export const integrationsApi = {
  resolveTeam: (slackTeamId: string) =>
    request<SlackTeamResolution>(`/api/v1/integrations/slack/team/${slackTeamId}`, {
      method: "GET",
      headers: { "x-internal-token": env.INTERNAL_SERVICE_TOKEN },
    }),

  resolveByArgusTeam: (argusTeamId: string) =>
    request<SlackTeamResolution | null>(`/api/v1/integrations/slack/by-argus-team/${argusTeamId}`, {
      method: "GET",
      headers: { "x-internal-token": env.INTERNAL_SERVICE_TOKEN },
    }),

  resolveUser: (slackTeamId: string, slackUserId: string) =>
    request<SlackUserResolution>(
      `/api/v1/integrations/slack/user/${slackTeamId}/${slackUserId}`,
      { method: "GET", headers: { "x-internal-token": env.INTERNAL_SERVICE_TOKEN } },
    ),

  linkUser: (payload: LinkSlackUserRequest) =>
    request<LinkSlackUserResponse>("/api/v1/integrations/slack/link-user", {
      method: "POST",
      headers: { "x-internal-token": env.INTERNAL_SERVICE_TOKEN },
      body: JSON.stringify(payload),
    }),
};

interface TeamCredentials {
  apiKey: string;
  actingUserId?: string;
}

function authHeaders({ apiKey, actingUserId }: TeamCredentials): Record<string, string> {
  return {
    "x-api-key": apiKey,
    ...(actingUserId ? { "x-acting-user-id": actingUserId } : {}),
  };
}

/** Business-logic calls, attributed to a specific team (and, when known, a
 *  specific rep) via the acting-user API-key extension (apps/api §10.1). */
export const argusApi = {
  createDecision: (creds: TeamCredentials, payload: CreateDecisionRequest) =>
    request<DecisionResponse>("/api/v1/decisions", {
      method: "POST",
      headers: authHeaders(creds),
      body: JSON.stringify(payload),
    }),

  getDecision: (creds: TeamCredentials, decisionId: string) =>
    request<DecisionResponse>(`/api/v1/decisions/${decisionId}`, {
      method: "GET",
      headers: authHeaders(creds),
    }),

  overrideDecision: (creds: TeamCredentials, decisionId: string, payload: OverrideDecisionRequest) =>
    request<OverrideDecisionResponse>(`/api/v1/decisions/${decisionId}/override`, {
      method: "POST",
      headers: authHeaders(creds),
      body: JSON.stringify(payload),
    }),

  createOutcome: (creds: TeamCredentials, payload: CreateOutcomeRequest) =>
    request<CreateOutcomeResponse>("/api/v1/outcomes", {
      method: "POST",
      headers: authHeaders(creds),
      body: JSON.stringify(payload),
    }),

  getQueue: (creds: TeamCredentials) =>
    request<QueueResponse>("/api/v1/queue", { method: "GET", headers: authHeaders(creds) }),

  recordAction: (creds: TeamCredentials, decisionId: string, payload: CreateActionRequest) =>
    request<CreateActionResponse>(`/api/v1/decisions/${decisionId}/action`, {
      method: "POST",
      headers: authHeaders(creds),
      body: JSON.stringify(payload),
    }),
};
