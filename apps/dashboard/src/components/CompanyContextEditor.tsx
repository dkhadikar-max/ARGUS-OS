"use client";

import { useState, useTransition } from "react";
import { updateCompanyContextAction } from "../app/settings/actions";

interface Props {
  initialCompanyContext: string | null;
}

// Not the Bible (see schema.prisma's Team.companyContext comment) -- same
// "client state + save button" shape as IcpCriteriaEditor, for a single
// free-text field rather than a dynamic list.
export function CompanyContextEditor({ initialCompanyContext }: Props) {
  const [companyContext, setCompanyContext] = useState(initialCompanyContext ?? "");
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    setMessage(null);
    startTransition(async () => {
      const result = await updateCompanyContextAction(companyContext);
      setMessage(
        result.ok
          ? { kind: "success", text: "Company context saved." }
          : { kind: "error", text: result.error ?? "Failed to save company context." },
      );
    });
  }

  return (
    <div>
      <textarea
        value={companyContext}
        onChange={(e) => setCompanyContext(e.target.value)}
        placeholder="What does your company sell, and to whom?"
        rows={4}
        className="block w-full rounded border border-gray-300 px-3 py-2 text-sm"
      />

      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={isPending}
          className="rounded bg-teal-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-700 disabled:opacity-40"
        >
          {isPending ? "Saving…" : "Save company context"}
        </button>
        {message && (
          <span className={`text-xs ${message.kind === "success" ? "text-green-700" : "text-red-600"}`}>
            {message.text}
          </span>
        )}
      </div>
    </div>
  );
}
