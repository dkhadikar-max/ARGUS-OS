import type { ExtensionMessage, ExtensionResponse, StoredAuth } from "../lib/messages.js";

// Bible §18 INF-1: environment is fixed at build time for a given release
// channel (dev/staging/prod), matching how the manifest's host_permissions
// must also be static per Chrome Web Store build.
const API_BASE_URL = "http://localhost:4000";
const AUTH_STORAGE_KEY = "argus_auth";

async function getAuth(): Promise<StoredAuth | null> {
  const stored = await chrome.storage.local.get(AUTH_STORAGE_KEY);
  return (stored[AUTH_STORAGE_KEY] as StoredAuth | undefined) ?? null;
}

async function apiFetch(path: string, init: RequestInit): Promise<unknown> {
  const auth = await getAuth();
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(auth ? { Authorization: `Bearer ${auth.token}` } : {}),
      ...init.headers,
    },
  });

  const body = await response.json();
  if (!response.ok) {
    const message =
      typeof body === "object" && body && "error" in body
        ? (body as { error: { message: string } }).error.message
        : `Request failed with status ${response.status}`;
    throw new Error(message);
  }
  return body;
}

async function handleMessage(message: ExtensionMessage): Promise<ExtensionResponse> {
  try {
    switch (message.type) {
      case "AUTH_GET":
        return { ok: true, data: await getAuth() };

      case "AUTH_SET":
        await chrome.storage.local.set({ [AUTH_STORAGE_KEY]: message.auth });
        return { ok: true, data: null };

      case "AUTH_CLEAR":
        await chrome.storage.local.remove(AUTH_STORAGE_KEY);
        return { ok: true, data: null };

      case "API_CREATE_DECISION":
        return {
          ok: true,
          data: await apiFetch("/api/v1/decisions", {
            method: "POST",
            body: JSON.stringify(message.payload),
          }),
        };

      case "API_GET_DECISION":
        return {
          ok: true,
          data: await apiFetch(`/api/v1/decisions/${message.decisionId}`, { method: "GET" }),
        };

      case "API_OVERRIDE_DECISION":
        return {
          ok: true,
          data: await apiFetch(`/api/v1/decisions/${message.decisionId}/override`, {
            method: "POST",
            body: JSON.stringify(message.payload),
          }),
        };

      case "API_CREATE_OUTCOME":
        return {
          ok: true,
          data: await apiFetch("/api/v1/outcomes", {
            method: "POST",
            body: JSON.stringify(message.payload),
          }),
        };

      case "API_RECORD_ACTION":
        return {
          ok: true,
          data: await apiFetch(`/api/v1/decisions/${message.decisionId}/action`, {
            method: "POST",
            body: JSON.stringify(message.payload),
          }),
        };

      default:
        return { ok: false, error: "Unknown message type" };
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
  handleMessage(message).then(sendResponse);
  return true; // keep the message channel open for the async response
});
