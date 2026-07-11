"use server";

import { revalidatePath } from "next/cache";
import type { ActionType, DecisionResponse } from "@argus/shared";
import { api, ApiError } from "../../lib/api-client";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

// Bible §6.2 Today Queue wireframe's [View]/[Message] buttons both need the
// full decision (message body, evidence, reasoning) the queue list response
// doesn't carry -- `messagePreview` there is truncated to 120 chars, just
// enough for the card summary. Fetched lazily, on the rep's first click,
// rather than eagerly for every card on page load.
export async function getFullDecisionAction(
  decisionId: string,
): Promise<{ ok: true; decision: DecisionResponse } | { ok: false; error: string }> {
  try {
    const decision = await api.getDecision(decisionId);
    return { ok: true, decision };
  } catch (err) {
    return { ok: false, error: err instanceof ApiError ? err.message : "Failed to load decision" };
  }
}

// Bible §5.1/§5.2 Action Graph, §9.1 ActionTaken -- backs the wireframe's
// [Message] (MESSAGE_COPIED) and [Snooze] (SNOOZED) buttons. Revalidates
// /queue: queue.repository.ts already excludes any decision with an
// ActionTaken row, so recording either one is what makes the card actually
// leave Today's Queue (matching the wireframe's own "PASSED / WAITING /
// MESSAGED / WON" footer buckets), not a separate client-side removal.
export async function recordQueueActionAction(
  decisionId: string,
  actionType: ActionType,
  details?: Record<string, unknown>,
): Promise<ActionResult> {
  try {
    await api.recordAction(decisionId, { actionType, details: details ?? null });
  } catch (err) {
    // DECISION_STALE (already acted on elsewhere -- Slack, the extension) is
    // expected, not an error worth surfacing loudly: it means this decision
    // already has an ActionTaken row, so it's already excluded from
    // queue.repository.ts's query -- still revalidate so this list catches
    // up to that, the same as a successful record here would cause.
    revalidatePath("/queue");
    return { ok: false, error: err instanceof ApiError ? err.message : "Failed to record action" };
  }

  revalidatePath("/queue");
  return { ok: true };
}
