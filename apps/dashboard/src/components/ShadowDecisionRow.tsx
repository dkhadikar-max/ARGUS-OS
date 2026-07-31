"use client";

import { useRouter } from "next/navigation";
import type { AdminListShadowDecisionsResponse } from "@argus/shared";
import { TableCell, TableRow } from "@tremor/react";
import { VerdictBadge } from "./VerdictBadge";
import { DisagreementBadge } from "./DisagreementBadge";

type Row = AdminListShadowDecisionsResponse["data"][number];

// This app's first click-to-navigate table row -- extends QueueItemCard's
// already-used useRouter to its .push method for the first time (every
// prior use was router.refresh() only).
export function ShadowDecisionRow({ row }: { row: Row }) {
  const router = useRouter();

  return (
    <TableRow
      onClick={() => router.push(`/admin/shadow-decisions/${row.id}`)}
      className="cursor-pointer hover:bg-gray-50"
    >
      <TableCell>
        <VerdictBadge verdict={row.liveDecision.verdict} />
      </TableCell>
      <TableCell>
        <VerdictBadge verdict={row.shadowVerdict} />
      </TableCell>
      <TableCell>
        {row.confidenceDelta > 0 ? "+" : ""}
        {row.confidenceDelta}
      </TableCell>
      <TableCell>{row.teamName}</TableCell>
      <TableCell>
        <DisagreementBadge verdictAgreement={row.verdictAgreement} disagreementCategories={row.disagreementCategories} />
      </TableCell>
      <TableCell>{new Date(row.createdAt).toLocaleString()}</TableCell>
    </TableRow>
  );
}
