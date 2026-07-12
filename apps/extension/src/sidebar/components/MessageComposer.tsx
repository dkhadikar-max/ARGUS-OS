import { useState } from "react";
import type { Channel, DecisionResponse } from "@argus/shared";
import { track } from "../../lib/analytics.js";
import { api } from "../../lib/api-client.js";

interface Props {
  decisionId: string;
  message: DecisionResponse["message"];
  onRegenerate: () => void;
  regenerating: boolean;
}

type ActiveChannel = "linkedin" | "email";

const CHANNEL_TO_SCHEMA: Record<ActiveChannel, Channel> = {
  linkedin: "LINKEDIN",
  email: "EMAIL",
};

// A length swing bigger than this fraction of the original counts as a
// "major" edit rather than a "minor" one (Bible §11.1 message_edited's
// edit_type has only these two values and no defined threshold between
// them — 20% is a disclosed, not arbitrary, choice: enough to rule out
// typo-level fixes without requiring a full rewrite to count as "major").
const MAJOR_EDIT_THRESHOLD = 0.2;

// Bible §6.1 wireframe "MESSAGE (LinkedIn)" panel with
// [Copy] [Edit] [Regenerate] [Switch to Email] actions; §11.1 events
// message_copied / message_edited track each of these.
export function MessageComposer({ decisionId, message, onRegenerate, regenerating }: Props) {
  const [channel, setChannel] = useState<ActiveChannel>(
    message.linkedin ? "linkedin" : "email",
  );
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message[channel] ?? "");
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const original = message[channel] ?? "";
  const body = editing ? draft : original;
  const wasEdited = draft !== original;
  const otherChannel: ActiveChannel = channel === "linkedin" ? "email" : "linkedin";
  const hasOtherChannel = Boolean(message[otherChannel]);

  async function handleCopy() {
    await navigator.clipboard.writeText(body);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);

    track({
      name: "message_copied",
      properties: {
        decision_id: decisionId,
        channel: CHANNEL_TO_SCHEMA[channel],
        tone: message.tone,
        was_edited: wasEdited,
      },
    });

    // Bible §5.1/§5.2 Action Graph, §9.1 ActionTaken. Best-effort and never
    // awaited by the UI: a decision only ever gets one ActionTaken (@unique
    // decisionId), so a second copy -- or a Slack "Accept" on the same
    // decision -- is expected to fail here (DECISION_STALE) without
    // disrupting a copy that already succeeded.
    void api
      .recordAction(decisionId, {
        actionType: "MESSAGE_COPIED",
        details: { channel: CHANNEL_TO_SCHEMA[channel] },
      })
      .catch(() => undefined);
  }

  async function handleToggleEdit() {
    if (editing) {
      // Toggling off = "Save". Only a real length change counts as an edit.
      if (draft !== original) {
        const originalLength = original.length;
        const newLength = draft.length;
        const delta = Math.abs(newLength - originalLength);
        const editType = originalLength > 0 && delta / originalLength > MAJOR_EDIT_THRESHOLD ? "major" : "minor";

        track({
          name: "message_edited",
          properties: { decision_id: decisionId, edit_type: editType, original_length: originalLength, new_length: newLength },
        });

        // Bible §9.1 MessageDraft.wasEdited/editDiff, now actually persisted
        // (apps/api decision.service.ts editMessageDraft) instead of only
        // living in this component's local state. A save failure doesn't
        // block anything -- `draft` is still right here to copy -- but it's
        // surfaced rather than silently swallowed, since the rep otherwise
        // has no way to know ARGUS never saw their edit.
        setSaveError(null);
        setSaving(true);
        try {
          await api.editMessage(decisionId, { body: draft });
        } catch {
          setSaveError("Couldn't save this edit to ARGUS, but you can still copy it below.");
        } finally {
          setSaving(false);
        }
      }
      setEditing(false);
    } else {
      setSaveError(null);
      setEditing(true);
    }
  }

  function handleSwitchChannel() {
    setChannel(otherChannel);
    setDraft(message[otherChannel] ?? "");
    setEditing(false);
  }

  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
        Message ({channel === "linkedin" ? "LinkedIn" : "Email"})
      </h3>
      <div className="rounded-lg border border-gray-200 p-3">
        {editing ? (
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={5}
            className="w-full resize-none rounded border border-gray-200 p-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
          />
        ) : (
          <p className="whitespace-pre-wrap text-sm text-gray-800">{body || "No message generated."}</p>
        )}

        <div className="mt-3 flex flex-wrap gap-2 text-xs font-medium">
          <button
            type="button"
            onClick={handleCopy}
            disabled={!body}
            className="rounded bg-blue-600 px-3 py-1.5 text-white hover:bg-blue-700 disabled:opacity-40"
          >
            {copied ? "Copied!" : "Copy"}
          </button>
          <button
            type="button"
            onClick={handleToggleEdit}
            disabled={saving}
            className="rounded border border-gray-300 px-3 py-1.5 text-gray-700 hover:bg-gray-50 disabled:opacity-40"
          >
            {saving ? "Saving…" : editing ? "Save" : "Edit"}
          </button>
          <button
            type="button"
            onClick={onRegenerate}
            disabled={regenerating}
            className="rounded border border-gray-300 px-3 py-1.5 text-gray-700 hover:bg-gray-50 disabled:opacity-40"
          >
            {regenerating ? "Regenerating…" : "Regenerate"}
          </button>
          <button
            type="button"
            onClick={handleSwitchChannel}
            disabled={!hasOtherChannel}
            className="rounded border border-gray-300 px-3 py-1.5 text-gray-700 hover:bg-gray-50 disabled:opacity-40"
          >
            Switch to {otherChannel === "linkedin" ? "LinkedIn" : "Email"}
          </button>
        </div>
        {saveError && <p className="mt-2 text-xs text-red-600">{saveError}</p>}
      </div>
    </div>
  );
}
