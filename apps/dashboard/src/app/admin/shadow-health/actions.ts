"use server";

import type { AdminShadowLiveMetricsResponse } from "@argus/shared";
import { api, ApiError } from "../../../lib/api-client";

// Gate 3 Increment 1.9 -- called both for the initial Server Component
// fetch's data and repeatedly by ShadowLiveHealthPanel's client-side
// polling (apiFetch needs the Clerk session token, only available
// server-side, so the Client Component can't call api.getShadowLiveMetrics
// directly). No revalidatePath -- this is a pure read, not a mutation.
export async function getShadowLiveMetricsAction(): Promise<
  { ok: true; metrics: AdminShadowLiveMetricsResponse } | { ok: false; error: string }
> {
  try {
    const metrics = await api.getShadowLiveMetrics();
    return { ok: true, metrics };
  } catch (err) {
    return { ok: false, error: err instanceof ApiError ? err.message : "Failed to load live metrics" };
  }
}
