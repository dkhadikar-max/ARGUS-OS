"use client";

import { useEffect } from "react";
import { useAuth } from "@clerk/nextjs";
import { env } from "../lib/env";

interface ExtensionSession {
  token: string;
  userId: string;
  teamId: string;
}

type ExtensionAuthMessage = { type: "AUTH_SET"; auth: ExtensionSession } | { type: "AUTH_CLEAR" };

interface MinimalChromeRuntime {
  lastError?: { message?: string };
  sendMessage: (extensionId: string, message: ExtensionAuthMessage, callback?: () => void) => void;
}

function sendToExtension(message: ExtensionAuthMessage): void {
  const extensionId = env.NEXT_PUBLIC_EXTENSION_ID;
  if (!extensionId) return;

  const runtime = (window as unknown as { chrome?: { runtime?: MinimalChromeRuntime } }).chrome?.runtime;
  if (!runtime) return;

  runtime.sendMessage(extensionId, message, () => {
    // Reading lastError (even unused) suppresses Chrome's "Unchecked
    // runtime.lastError" console warning -- expected for every visitor who
    // doesn't have the ARGUS extension installed, which is most of them.
    void runtime.lastError;
  });
}

// Bible §18 EXT-5 "Auth & Sync": the sidebar (apps/extension) has no way to
// run Clerk's OAuth flow inside a Manifest V3 service worker, so this is the
// other half of that handshake -- mounted on every dashboard page, it pushes
// a fresh session to the extension via chrome.runtime.sendMessage whenever a
// rep is signed in, and clears it on sign-out. Requires manifest.config.ts's
// externally_connectable to list this origin, and NEXT_PUBLIC_EXTENSION_ID
// to be set to the installed extension's actual ID.
//
// Known limitation: Clerk's default session token expires in ~60s, and this
// component has no way to refresh it once the dashboard tab that pushed it
// is closed (the extension's service worker can't run Clerk's SDK to renew
// it). The sidebar stays authenticated only as long as the rep keeps
// revisiting the dashboard; apps/extension/src/background/index.ts clears
// the stale token on the first 401 so the sidebar re-prompts sign-in rather
// than looping on an expired token.
export function ExtensionAuthSync() {
  const { isLoaded, isSignedIn } = useAuth();

  useEffect(() => {
    // Clerk reports isSignedIn as undefined until the SDK finishes its own
    // load -- treating that as "signed out" fired a spurious AUTH_CLEAR on
    // every mount/navigation, wiping a perfectly valid cached token in the
    // extension for the brief window before Clerk resolves the real state.
    if (!isLoaded) return;
    if (!env.NEXT_PUBLIC_EXTENSION_ID) return;

    if (!isSignedIn) {
      sendToExtension({ type: "AUTH_CLEAR" });
      return;
    }

    fetch("/api/extension/session")
      .then((res) => (res.ok ? (res.json() as Promise<ExtensionSession>) : null))
      .then((session) => {
        if (session) sendToExtension({ type: "AUTH_SET", auth: session });
      })
      .catch(() => {
        // Best-effort -- no extension installed, or this origin isn't (yet)
        // in its externally_connectable list, is the common case.
      });
  }, [isLoaded, isSignedIn]);

  return null;
}
