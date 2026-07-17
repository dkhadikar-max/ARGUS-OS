"use client";

import { useState, useTransition } from "react";
import { icpWeightsAreValid, type IcpCriterion } from "@argus/shared";
import { updateIcpAction } from "../app/settings/actions";
import { IcpCriteriaFields } from "./IcpCriteriaFields";

interface Props {
  initialCriteria: IcpCriterion[];
}

// Bible §18 DSH-5 "Team ICP editor" (P1). A dynamic add/remove list needs
// client state, so this is the one part of Settings that isn't a plain
// <form action> like the preferences form. Row-editing UI itself lives in
// IcpCriteriaFields (shared with the onboarding wizard); this component
// owns the save button + updateIcpAction Server Action call.
export function IcpCriteriaEditor({ initialCriteria }: Props) {
  const [criteria, setCriteria] = useState<IcpCriterion[]>(initialCriteria);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  // Same check icp.service.ts throws on server-side -- disables Save
  // instead of only showing the warning text and letting the round-trip
  // fail with a VALIDATION_ERROR the server was always going to reject.
  const weightsValid = icpWeightsAreValid(criteria);

  function handleSave() {
    setMessage(null);
    startTransition(async () => {
      const result = await updateIcpAction(criteria);
      setMessage(
        result.ok
          ? { kind: "success", text: "ICP saved." }
          : { kind: "error", text: result.error ?? "Failed to save ICP." },
      );
    });
  }

  return (
    <div>
      <IcpCriteriaFields criteria={criteria} onChange={setCriteria} />

      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={isPending || !weightsValid}
          className="rounded bg-teal-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-700 disabled:opacity-40"
        >
          {isPending ? "Saving…" : "Save ICP"}
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
