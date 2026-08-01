import Link from "next/link";
import type { AdminListShadowDecisionsResponse } from "@argus/shared";
import { Table, TableBody, TableHead, TableHeaderCell, TableRow } from "@tremor/react";
import { ShadowDecisionRow } from "./ShadowDecisionRow";
import { Card } from "./ui/Card";

// Receives already-fetched data as a prop -- no client refetch. Pagination
// is query-param Links, matching RepFilterSelect/analytics's existing
// query-param-driven convention, not client state.
export function ShadowDecisionsTable({ data }: { data: AdminListShadowDecisionsResponse }) {
  const { pagination } = data;
  const prevOffset = Math.max(0, pagination.offset - pagination.limit);
  const nextOffset = pagination.offset + pagination.limit;

  if (data.data.length === 0) {
    return (
      <Card variant="dashed" className="p-8">
        <p className="text-sm font-medium text-gray-900">No shadow decisions yet</p>
        <p className="mt-1 text-sm text-gray-500">
          Rows appear here once Shadow Mode starts sampling live traffic (SHADOW_SAMPLE_RATE_PERCENT &gt; 0).
        </p>
      </Card>
    );
  }

  return (
    <div>
      <Table>
        <TableHead>
          <TableRow>
            <TableHeaderCell>Live verdict</TableHeaderCell>
            <TableHeaderCell>Shadow verdict</TableHeaderCell>
            <TableHeaderCell>Confidence delta</TableHeaderCell>
            <TableHeaderCell>Team</TableHeaderCell>
            <TableHeaderCell>Disagreement</TableHeaderCell>
            <TableHeaderCell>Timestamp</TableHeaderCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {data.data.map((row) => (
            <ShadowDecisionRow key={row.id} row={row} />
          ))}
        </TableBody>
      </Table>

      <div className="mt-4 flex items-center justify-between text-sm text-gray-600">
        <span>
          Showing {pagination.offset + 1}–{pagination.offset + data.data.length} of {pagination.total}
        </span>
        <div className="flex gap-2">
          <Link
            href={`/admin/shadow-decisions?offset=${prevOffset}`}
            aria-disabled={pagination.offset === 0}
            className={`rounded border border-gray-300 px-3 py-1.5 font-medium ${
              pagination.offset === 0 ? "pointer-events-none opacity-40" : "text-gray-700 hover:bg-gray-50"
            }`}
          >
            Previous
          </Link>
          <Link
            href={`/admin/shadow-decisions?offset=${nextOffset}`}
            aria-disabled={!pagination.hasMore}
            className={`rounded border border-gray-300 px-3 py-1.5 font-medium ${
              !pagination.hasMore ? "pointer-events-none opacity-40" : "text-gray-700 hover:bg-gray-50"
            }`}
          >
            Next
          </Link>
        </div>
      </div>
    </div>
  );
}
