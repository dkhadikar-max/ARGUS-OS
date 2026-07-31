import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { AdminListShadowDecisionsResponse } from "@argus/shared";

vi.mock("./ShadowDecisionRow", () => ({
  ShadowDecisionRow: ({ row }: { row: AdminListShadowDecisionsResponse["data"][number] }) => (
    <tr>
      <td>{row.id}</td>
    </tr>
  ),
}));

const { ShadowDecisionsTable } = await import("./ShadowDecisionsTable.js");

function response(overrides: Partial<AdminListShadowDecisionsResponse> = {}): AdminListShadowDecisionsResponse {
  return {
    data: [],
    pagination: { total: 0, limit: 20, offset: 0, hasMore: false },
    ...overrides,
  };
}

function rowFixture(id: string): AdminListShadowDecisionsResponse["data"][number] {
  return {
    id,
    teamId: "team_1",
    teamName: "DataFlow Inc.",
    decisionId: "dec_1",
    prospectId: "prospect_1",
    shadowVerdict: "WAIT",
    shadowConfidence: 52,
    shadowReasoning: "shadow reasoning",
    liveDecision: { verdict: "PASS", confidence: 54, reasoning: "live reasoning", recommendedAction: null, createdAt: "2026-07-30T11:58:00.000Z" },
    verdictAgreement: false,
    confidenceDelta: -3,
    disagreementCategories: ["verdict_mismatch"],
    inferenceCostUsd: 0.1,
    processingTimeMs: 90000,
    createdAt: "2026-07-30T12:00:00.000Z",
  };
}

describe("ShadowDecisionsTable", () => {
  it("shows an empty state when there are no rows", () => {
    render(<ShadowDecisionsTable data={response()} />);
    expect(screen.getByText("No shadow decisions yet")).toBeInTheDocument();
  });

  it("renders one row per item", () => {
    render(
      <ShadowDecisionsTable
        data={response({ data: [rowFixture("sd_1"), rowFixture("sd_2")], pagination: { total: 2, limit: 20, offset: 0, hasMore: false } })}
      />,
    );
    expect(screen.getByText("sd_1")).toBeInTheDocument();
    expect(screen.getByText("sd_2")).toBeInTheDocument();
  });

  it("disables Previous at offset 0 and Next when hasMore is false", () => {
    render(
      <ShadowDecisionsTable
        data={response({ data: [rowFixture("sd_1")], pagination: { total: 1, limit: 20, offset: 0, hasMore: false } })}
      />,
    );
    expect(screen.getByRole("link", { name: "Previous" })).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("link", { name: "Next" })).toHaveAttribute("aria-disabled", "true");
  });

  it("links Next to the correct offset when hasMore is true", () => {
    render(
      <ShadowDecisionsTable
        data={response({ data: [rowFixture("sd_1")], pagination: { total: 50, limit: 20, offset: 0, hasMore: true } })}
      />,
    );
    expect(screen.getByRole("link", { name: "Next" })).toHaveAttribute("href", "/admin/shadow-decisions?offset=20");
  });
});
