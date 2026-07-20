import { useState } from "react";
import type { ExtractedProfile } from "../../lib/linkedin-selectors.js";

export interface ProfileCorrection {
  name: string | null;
  title: string | null;
  companyName: string | null;
}

interface Props {
  profile: ExtractedProfile;
  onCorrect: (corrected: ProfileCorrection) => void;
  disabled: boolean;
}

// Bible §16.1 Risk #4's own prescribed mitigation for a bad LinkedIn scrape
// ("degrade gracefully with warning... allow manual data entry") was never
// built -- a wrong extraction previously fed straight into the decision
// with no way for the rep to notice or fix it. linkedin-selectors.ts's own
// history this session (three separate real-world layout variants broke
// its heuristic, one after another) is exactly why: no amount of selector
// cleverness can guarantee correctness against a LinkedIn redesign nobody
// has seen yet. A human catching a wrong value in a couple of seconds is
// the one fix that survives any future markup change, since it doesn't
// depend on guessing DOM structure at all.
export function ProfileConfirmation({ profile, onCorrect, disabled }: Props) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(profile.name ?? "");
  const [title, setTitle] = useState(profile.title ?? "");
  const [companyName, setCompanyName] = useState(profile.companyName ?? "");

  if (!editing) {
    const summary = [profile.name, profile.title, profile.companyName].filter(Boolean).join(" · ");
    return (
      <div className="flex items-center justify-between gap-2 border-b border-gray-100 bg-gray-50 px-4 py-2 text-xs text-gray-600">
        <span className="truncate" title={summary || undefined}>
          {summary || "Couldn't read a name, title, or company from this page"}
        </span>
        <button
          type="button"
          onClick={() => setEditing(true)}
          disabled={disabled}
          className="shrink-0 font-medium text-blue-700 hover:underline disabled:opacity-50"
        >
          Not right? Edit
        </button>
      </div>
    );
  }

  function handleSave() {
    setEditing(false);
    onCorrect({
      name: name.trim() || null,
      title: title.trim() || null,
      companyName: companyName.trim() || null,
    });
  }

  return (
    <div className="space-y-2 border-b border-gray-100 bg-gray-50 p-3">
      <label className="block text-xs font-medium text-gray-600">
        Name
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-0.5 w-full rounded border border-gray-300 px-2 py-1 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
        />
      </label>
      <label className="block text-xs font-medium text-gray-600">
        Title
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="mt-0.5 w-full rounded border border-gray-300 px-2 py-1 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
        />
      </label>
      <label className="block text-xs font-medium text-gray-600">
        Company
        <input
          value={companyName}
          onChange={(e) => setCompanyName(e.target.value)}
          className="mt-0.5 w-full rounded border border-gray-300 px-2 py-1 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
        />
      </label>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleSave}
          className="rounded bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
        >
          Save &amp; re-analyze
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="rounded border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
