"use client";

import { useRouter, useSearchParams } from "next/navigation";

const RANGES = [
  { value: "7", label: "Last 7 days" },
  { value: "14", label: "Last 14 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
];

// Same URL-search-param pattern as RepFilterSelect -- a real server-side
// query (adminShadowMetricsQuerySchema already supports sinceDays), not
// client-side state, so the page stays a Server Component.
export function AdminAnalyticsRangeSelect() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selected = searchParams.get("sinceDays") ?? "7";

  function handleChange(sinceDays: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("sinceDays", sinceDays);
    router.push(`/admin/analytics?${params.toString()}`);
  }

  return (
    <select
      value={selected}
      onChange={(e) => handleChange(e.target.value)}
      className="rounded border border-gray-300 px-2 py-1.5 text-xs text-gray-700"
    >
      {RANGES.map((range) => (
        <option key={range.value} value={range.value}>
          {range.label}
        </option>
      ))}
    </select>
  );
}
