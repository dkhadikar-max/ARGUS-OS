import { auth } from "@clerk/nextjs/server";
import type { CompanyMemoryResponse, QueueResponse } from "@argus/shared";
import { env } from "./env";

export class ApiError extends Error {}

/**
 * Server-side only (Next.js Server Components / Route Handlers). Uses the
 * signed-in rep's own Clerk session token as the Bearer credential — the
 * same JWT auth path apps/api already verifies for the extension (Bible
 * §10.1), so the dashboard needs no separate service credential.
 */
async function apiFetch<T>(path: string): Promise<T> {
  const { getToken } = await auth();
  const token = await getToken();
  if (!token) {
    throw new ApiError("Not authenticated");
  }

  const response = await fetch(`${env.API_BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  const body = await response.json();
  if (!response.ok) {
    const message =
      typeof body === "object" && body && "error" in body
        ? (body as { error: { message: string } }).error.message
        : `Request failed with status ${response.status}`;
    throw new ApiError(message);
  }
  return body as T;
}

export const api = {
  getQueue: () => apiFetch<QueueResponse>("/api/v1/queue"),
  getCompanyMemory: () => apiFetch<CompanyMemoryResponse>("/api/v1/memory"),
};
