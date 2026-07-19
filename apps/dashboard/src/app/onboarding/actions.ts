"use server";

import { redirect } from "next/navigation";
import type { CompleteOnboardingRequest } from "@argus/shared";
import { api, ApiError } from "../../lib/api-client";

export interface OnboardingActionResult {
  ok: boolean;
  error?: string;
}

export interface SuggestCompanyContextActionResult {
  ok: boolean;
  suggested?: string;
  error?: string;
}

// Fetches the given website and asks Claude to draft a company profile --
// returned to the wizard for the user to edit/confirm, never saved directly
// (see packages/shared's suggestCompanyContextRequestSchema comment).
export async function suggestCompanyContextAction(
  websiteUrl: string,
): Promise<SuggestCompanyContextActionResult> {
  try {
    const { suggested } = await api.suggestCompanyContext({ websiteUrl });
    return { ok: true, suggested };
  } catch (err) {
    return { ok: false, error: err instanceof ApiError ? err.message : "Failed to generate a profile" };
  }
}

// Bible has no onboarding wireframe (see apps/api's
// webhook.repository.ts createUserWithPersonalTeam comment) -- this is the
// one combined submit (company name + initial ICP) the wizard calls.
// redirect() throws internally and never returns, so only the failure path
// below ever produces a result object for OnboardingWizard to render.
export async function completeOnboardingAction(
  payload: CompleteOnboardingRequest,
): Promise<OnboardingActionResult> {
  try {
    await api.completeOnboarding(payload);
  } catch (err) {
    return { ok: false, error: err instanceof ApiError ? err.message : "Failed to complete onboarding" };
  }

  redirect("/queue");
}
