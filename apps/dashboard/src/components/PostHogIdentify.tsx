"use client";

import { useEffect } from "react";
import { useUser } from "@clerk/nextjs";
import { identify } from "../lib/analytics";

// Bible §11.1 event tracking needs every capture() attributed to the right
// rep. Clerk's own session is server-side (middleware/Server Components),
// but PostHog only runs in the browser -- this is the one place that
// bridges the two, via Clerk's client-side useUser() hook.
export function PostHogIdentify() {
  const { user } = useUser();

  useEffect(() => {
    if (user?.id) identify(user.id);
  }, [user?.id]);

  return null;
}
