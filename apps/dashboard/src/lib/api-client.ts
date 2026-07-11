import { auth } from "@clerk/nextjs/server";
import type {
  CompanyMemoryResponse,
  IcpResponse,
  QueueResponse,
  UpdateIcpRequest,
  UpdateUserPreferencesRequest,
  UserPreferencesResponse,
} from "@argus/shared";
import { env } from "./env";

export class ApiError extends Error {}

/**
 * Server-side only (Next.js Server Components / Route Handlers / Server
 * Actions). Uses the signed-in rep's own Clerk session token as the Bearer
 * credential — the same JWT auth path apps/api already verifies for the
 * extension (Bible §10.1), so the dashboard needs no separate service
 * credential.
 */
async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const { getToken } = await auth();
  const token = await getToken();
  if (!token) {
    throw new ApiError("Not authenticated");
  }

  const response = await fetch(`${env.API_BASE_URL}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...init?.headers },
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
  getPreferences: () => apiFetch<UserPreferencesResponse>("/api/v1/preferences"),
  updatePreferences: (payload: UpdateUserPreferencesRequest) =>
    apiFetch<UserPreferencesResponse>("/api/v1/preferences", {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  getIcp: () => apiFetch<IcpResponse>("/api/v1/icp"),
  updateIcp: (payload: UpdateIcpRequest) =>
    apiFetch<IcpResponse>("/api/v1/icp", { method: "PUT", body: JSON.stringify(payload) }),
};
