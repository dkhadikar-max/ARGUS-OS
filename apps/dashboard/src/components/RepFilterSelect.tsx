"use client";

import { useRouter, useSearchParams } from "next/navigation";

interface Props {
  reps: Array<{ userId: string; name: string }>;
}

// Bible §4.4 Manager Morgan persona: "Filter by rep, see decision history".
// A plain URL search param (?rep=userId), not client-side state, so the
// filter is a real server-side query (outcome.repository.ts's `listOutcomes`
// already supports `userId` -- this just wires an existing capability
// through, no new backend needed) and the page stays a Server Component.
export function RepFilterSelect({ reps }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selected = searchParams.get("rep") ?? "";

  function handleChange(userId: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (userId) {
      params.set("rep", userId);
    } else {
      params.delete("rep");
    }
    router.push(`/analytics${params.toString() ? `?${params.toString()}` : ""}`);
  }

  return (
    <select
      value={selected}
      onChange={(e) => handleChange(e.target.value)}
      className="rounded border border-gray-300 px-2 py-1.5 text-xs text-gray-700"
    >
      <option value="">All reps</option>
      {reps.map((rep) => (
        <option key={rep.userId} value={rep.userId}>
          {rep.name}
        </option>
      ))}
    </select>
  );
}
