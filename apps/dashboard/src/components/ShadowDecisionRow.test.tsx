import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AdminListShadowDecisionsResponse } from "@argus/shared";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const { ShadowDecisionRow } = await import("./ShadowDecisionRow.js");

type Row = AdminListShadowDecisionsResponse["data"][number];

function row(overrides: Partial<Row> = {}): Row {
  return {
    id: "sd_1",
    teamId: "team_1",
    teamName: "DataFlow Inc.",
    decisionId: "dec_1",
    prospectId: "prospect_1",
    shadowVerdict: "WAIT",
    shadowConfidence: 52,
    shadowReasoning: "shadow reasoning",
    liveDecision: {
      verdict: "PASS",
      confidence: 54,
      reasoning: "live reasoning",
      recommendedAction: "wait_for_signal",
      createdAt: "2026-07-30T11:58:00.000Z",
    },
    verdictAgreement: false,
    confidenceDelta: -3,
    disagreementCategories: ["verdict_mismatch"],
    inferenceCostUsd: 0.1,
    processingTimeMs: 90000,
    createdAt: "2026-07-30T12:00:00.000Z",
    ...overrides,
  };
}

function renderRow(r: Row) {
  return render(
    <table>
      <tbody>
        <ShadowDecisionRow row={r} />
      </tbody>
    </table>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ShadowDecisionRow", () => {
  it("navigates to the detail page with the row's id when clicked", async () => {
    const user = userEvent.setup();
    renderRow(row({ id: "sd_42" }));

    await user.click(screen.getByRole("row"));

    expect(push).toHaveBeenCalledWith("/admin/shadow-decisions/sd_42");
  });

  it("renders both live and shadow verdicts and the team name", () => {
    renderRow(row({ teamName: "Acme Corp" }));

    expect(screen.getByText("PASS")).toBeInTheDocument();
    expect(screen.getByText("WAIT")).toBeInTheDocument();
    expect(screen.getByText("Acme Corp")).toBeInTheDocument();
  });

  it("renders a signed confidence delta", () => {
    renderRow(row({ confidenceDelta: 7 }));
    expect(screen.getByText("+7")).toBeInTheDocument();
  });
});
