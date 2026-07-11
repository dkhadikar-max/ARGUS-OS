import type {
  CreateActionRequest,
  CreateDecisionRequest,
  CreateOutcomeRequest,
  OverrideDecisionRequest,
} from "@argus/shared";

// Content scripts don't have CORS-free network access to the API, but the
// background service worker does (it's granted host_permissions in the
// manifest). Bible §18 EXT-5 "Background sync with API" — all requests are
// proxied through the background worker via chrome.runtime messaging.
export interface StoredAuth {
  token: string;
  userId: string;
  teamId: string;
}

export type ExtensionMessage =
  | { type: "AUTH_GET" }
  | { type: "AUTH_SET"; auth: StoredAuth }
  | { type: "AUTH_CLEAR" }
  | { type: "API_CREATE_DECISION"; payload: CreateDecisionRequest }
  | { type: "API_GET_DECISION"; decisionId: string }
  | { type: "API_OVERRIDE_DECISION"; decisionId: string; payload: OverrideDecisionRequest }
  | { type: "API_CREATE_OUTCOME"; payload: CreateOutcomeRequest }
  | { type: "API_RECORD_ACTION"; decisionId: string; payload: CreateActionRequest };

export type ExtensionResponse<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };
