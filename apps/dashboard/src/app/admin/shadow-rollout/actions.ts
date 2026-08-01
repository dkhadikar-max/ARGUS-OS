"use server";

import { revalidatePath } from "next/cache";
import type {
  AdminShadowRolloutPreviewResponse,
  UpdateShadowRolloutConfigRequest,
  UpsertShadowRolloutTeamOverrideRequest,
} from "@argus/shared";
import { api, ApiError } from "../../../lib/api-client";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

export async function updateShadowRolloutConfigAction(body: UpdateShadowRolloutConfigRequest): Promise<ActionResult> {
  try {
    await api.updateShadowRolloutConfig(body);
  } catch (err) {
    return { ok: false, error: err instanceof ApiError ? err.message : "Failed to update rollout config" };
  }
  revalidatePath("/admin/shadow-rollout");
  return { ok: true };
}

export async function upsertShadowRolloutTeamOverrideAction(
  teamId: string,
  body: UpsertShadowRolloutTeamOverrideRequest,
): Promise<ActionResult> {
  try {
    await api.upsertShadowRolloutTeamOverride(teamId, body);
  } catch (err) {
    return { ok: false, error: err instanceof ApiError ? err.message : "Failed to save team override" };
  }
  revalidatePath("/admin/shadow-rollout");
  return { ok: true };
}

export async function deleteShadowRolloutTeamOverrideAction(teamId: string): Promise<ActionResult> {
  try {
    await api.deleteShadowRolloutTeamOverride(teamId);
  } catch (err) {
    return { ok: false, error: err instanceof ApiError ? err.message : "Failed to remove team override" };
  }
  revalidatePath("/admin/shadow-rollout");
  return { ok: true };
}

export async function previewShadowRolloutAction(
  prospectId: string,
  teamId: string,
): Promise<{ ok: true; preview: AdminShadowRolloutPreviewResponse } | { ok: false; error: string }> {
  try {
    const preview = await api.previewShadowRollout(prospectId, teamId);
    return { ok: true, preview };
  } catch (err) {
    return { ok: false, error: err instanceof ApiError ? err.message : "Failed to compute preview" };
  }
}
