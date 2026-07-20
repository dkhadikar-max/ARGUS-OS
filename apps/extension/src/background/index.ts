import type { ExtensionMessage, ExtensionResponse, StoredAuth } from "../lib/messages.js";

// Bible §18 INF-1: environment is fixed at build time for a given release
// channel (dev/staging/prod), matching how the manifest's host_permissions
// must also be static per Chrome Web Store build. Was hardcoded to
// localhost with a comment saying this *should* vary by build — a real
// Chrome Web Store submission built this way would ship permanently
// pointed at a dev machine no end user has running. manifest.config.ts
// reads the exact same env var to keep host_permissions in sync with
// whatever URL this actually fetches.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000";
const DASHBOARD_URL = import.meta.env.VITE_DASHBOARD_URL ?? "http://localhost:3000";
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
    // A 401 here means the token this specific request used (captured in
    // `auth` above, before the fetch) expired or was revoked. Clearing it
    // means the *next* sidebar open correctly shows the sign-in prompt
    // instead of retrying a token that will never stop 401ing -- but only
    // if that's still the token in storage. The dashboard's auth-sync can
    // push a fresh one (AUTH_SET) while this request was in flight; blindly
    // clearing here would delete that newer, perfectly valid token instead
    // of the stale one that actually failed.
    if (response.status === 401) {
      const current = await getAuth();
      if (current?.token === auth?.token) {
        await chrome.storage.local.remove(AUTH_STORAGE_KEY);
      }
    }
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

      case "API_SHARE_DECISION":
        return {
          ok: true,
          data: await apiFetch(`/api/v1/decisions/${message.decisionId}/share`, { method: "POST" }),
        };

      case "API_EDIT_MESSAGE":
        return {
          ok: true,
          data: await apiFetch(`/api/v1/decisions/${message.decisionId}/message`, {
            method: "PATCH",
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

// Bible §18 EXT-5 "Auth & Sync": the dashboard (an ordinary web page, not
// part of this extension) reaches this via chrome.runtime.sendMessage(
// extensionId, ...), which Chrome routes here instead of onMessage above.
// manifest.config.ts's externally_connectable already restricts which
// origins Chrome will deliver these from, but that match is host-only (it
// can't distinguish app.argusai.online from a same-origin XSS on it) --
// sender.origin is re-checked here as defense in depth. Only the two auth
// message types are accepted; a compromised dashboard tab still can't reach
// the sidebar's actual API surface through this channel.
chrome.runtime.onMessageExternal.addListener((message: ExtensionMessage, sender, sendResponse) => {
  if (sender.origin !== DASHBOARD_URL) {
    sendResponse({ ok: false, error: "Unauthorized origin" });
    return;
  }
  if (message.type !== "AUTH_SET" && message.type !== "AUTH_CLEAR") {
    sendResponse({ ok: false, error: "Unsupported external message type" });
    return;
  }
  handleMessage(message).then(sendResponse);
  return true;
});
