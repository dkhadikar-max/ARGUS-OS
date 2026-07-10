import { useState } from "react";
import type { DecisionResponse } from "@argus/shared";

interface Props {
  message: DecisionResponse["message"];
  onRegenerate: () => void;
  regenerating: boolean;
}

type ActiveChannel = "linkedin" | "email";

// Bible §6.1 wireframe "MESSAGE (LinkedIn)" panel with
// [Copy] [Edit] [Regenerate] [Switch to Email] actions; §11.1 events
// message_copied / message_edited track each of these.
export function MessageComposer({ message, onRegenerate, regenerating }: Props) {
  const [channel, setChannel] = useState<ActiveChannel>(
    message.linkedin ? "linkedin" : "email",
  );
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message[channel] ?? "");
  const [copied, setCopied] = useState(false);

  const body = editing ? draft : message[channel] ?? "";
  const otherChannel: ActiveChannel = channel === "linkedin" ? "email" : "linkedin";
  const hasOtherChannel = Boolean(message[otherChannel]);

  async function handleCopy() {
    await navigator.clipboard.writeText(body);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
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
            onClick={() => setEditing((prev) => !prev)}
            className="rounded border border-gray-300 px-3 py-1.5 text-gray-700 hover:bg-gray-50"
          >
            {editing ? "Save" : "Edit"}
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
      </div>
    </div>
  );
}
