"use server";

import { revalidatePath } from "next/cache";
import type { IcpCriterion, MessageTone, PolicyRule, UpdateIcpRequest, UpdatePolicyRequest, UpdateUserPreferencesRequest } from "@argus/shared";
import { api, ApiError } from "../../lib/api-client";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

// Bible §18 DSH-5 "User preferences form" (P1). A plain <form action={...}>
// submission -- every field is a fixed select/checkbox, so no client-side
// state is needed beyond what the browser's own form elements already
// hold. React 18 (this app's pinned version) has no useActionState, so
// this can't return inline success/error state the way updateIcpAction
// below does when bound directly to <form action>; it either succeeds
// (the page revalidates with the new saved values) or throws, which
// Next's own error boundary surfaces.
export async function updatePreferencesAction(formData: FormData): Promise<void> {
  const payload: UpdateUserPreferencesRequest = {
    messageTone: formData.get("messageTone") as MessageTone,
    messageLength: formData.get("messageLength") as UpdateUserPreferencesRequest["messageLength"],
    autoVerdict: formData.get("autoVerdict") === "on",
    sidebarPosition: formData.get("sidebarPosition") as UpdateUserPreferencesRequest["sidebarPosition"],
    defaultChannel: formData.get("defaultChannel") as UpdateUserPreferencesRequest["defaultChannel"],
    digestFrequency: formData.get("digestFrequency") as UpdateUserPreferencesRequest["digestFrequency"],
  };

  await api.updatePreferences(payload);
  revalidatePath("/settings");
}

// Bible §18 DSH-5 "Team ICP editor" (P1). Called directly from the
// IcpCriteriaEditor Client Component (a dynamic add/remove list needs real
// client state, unlike the preferences form above), not via <form action>.
export async function updateIcpAction(criteria: IcpCriterion[]): Promise<ActionResult> {
  const payload: UpdateIcpRequest = { criteria };

  try {
    await api.updateIcp(payload);
  } catch (err) {
    return { ok: false, error: err instanceof ApiError ? err.message : "Failed to save ICP" };
  }

  revalidatePath("/settings");
  return { ok: true };
}

// Policy v2.1 L4 Policy Engine (not the Bible) -- same "Client Component
// calls the action directly" pattern as updateIcpAction above, for the
// same reason (a dynamic add/remove rule list needs real client state).
export async function updatePolicyAction(rules: PolicyRule[]): Promise<ActionResult> {
  const payload: UpdatePolicyRequest = { rules };

  try {
    await api.updatePolicy(payload);
  } catch (err) {
    return { ok: false, error: err instanceof ApiError ? err.message : "Failed to save policy" };
  }

  revalidatePath("/settings");
  return { ok: true };
}
