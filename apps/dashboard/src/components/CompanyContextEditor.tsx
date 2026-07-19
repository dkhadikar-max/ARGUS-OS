"use client";

import { useState, useTransition } from "react";
import { updateCompanyContextAction, suggestCompanyContextAction } from "../app/settings/actions";

interface Props {
  initialCompanyContext: string | null;
}

// Not the Bible (see schema.prisma's Team.companyContext comment) -- same
// "client state + save button" shape as IcpCriteriaEditor, for a single
// free-text field rather than a dynamic list. The website-fetch button
// mirrors OnboardingWizard's, for teams that were already onboarded before
// this field existed and have no other way to run the AI suggestion.
export function CompanyContextEditor({ initialCompanyContext }: Props) {
  const [companyContext, setCompanyContext] = useState(initialCompanyContext ?? "");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [suggestError, setSuggestError] = useState<string | null>(null);
  const [isSuggesting, startSuggesting] = useTransition();
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSuggest() {
    if (!websiteUrl.trim()) return;
    setSuggestError(null);
    startSuggesting(async () => {
      const result = await suggestCompanyContextAction(websiteUrl.trim());
      if (result.ok && result.suggested) {
        setCompanyContext(result.suggested);
      } else {
        setSuggestError(result.error ?? "Failed to generate a profile");
      }
    });
  }

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
      <div className="mb-3 flex gap-2">
        <input
          type="url"
          value={websiteUrl}
          onChange={(e) => setWebsiteUrl(e.target.value)}
          placeholder="https://acme.com"
          className="block w-full rounded border border-gray-300 px-3 py-2 text-sm"
        />
        <button
          type="button"
          onClick={handleSuggest}
          disabled={isSuggesting || !websiteUrl.trim()}
          className="shrink-0 rounded border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
        >
          {isSuggesting ? "Reading…" : "Suggest"}
        </button>
      </div>
      {suggestError && <p className="mb-3 text-xs text-red-600">{suggestError}</p>}

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
