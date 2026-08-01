import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AdminShadowRolloutResponse } from "@argus/shared";

const upsertShadowRolloutTeamOverrideAction = vi.fn();
const deleteShadowRolloutTeamOverrideAction = vi.fn();
vi.mock("../app/admin/shadow-rollout/actions", () => ({
  upsertShadowRolloutTeamOverrideAction,
  deleteShadowRolloutTeamOverrideAction,
}));

const { ShadowRolloutTeamOverridesTable } = await import("./ShadowRolloutTeamOverridesTable.js");

type Override = AdminShadowRolloutResponse["teamOverrides"][number];

function override(overrides: Partial<Override> = {}): Override {
  return {
    teamId: "team_1",
    teamName: "DataFlow Inc.",
    percent: 100,
    version: 1,
    reason: null,
    expiresAt: null,
    updatedAt: "2026-07-31T12:00:00.000Z",
    updatedBy: "user_1",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ShadowRolloutTeamOverridesTable", () => {
  it("shows an empty state when there are no overrides", () => {
    render(<ShadowRolloutTeamOverridesTable overrides={[]} />);
    expect(screen.getByText("No team overrides yet.")).toBeInTheDocument();
  });

  it("renders team name, percent, and reason for each override", () => {
    render(<ShadowRolloutTeamOverridesTable overrides={[override({ reason: "Customer validation" })]} />);

    expect(screen.getByText(/DataFlow Inc\./)).toBeInTheDocument();
    expect(screen.getByText("100%")).toBeInTheDocument();
    expect(screen.getByText("Customer validation")).toBeInTheDocument();
  });

  it("flags a past expiresAt as Expired", () => {
    render(<ShadowRolloutTeamOverridesTable overrides={[override({ expiresAt: "2020-01-01T00:00:00.000Z" })]} />);
    const list = within(screen.getByRole("list"));
    expect(list.getByText(/Expired/)).toBeInTheDocument();
  });

  it("shows a future expiresAt as Expires, not Expired", () => {
    const future = new Date(Date.now() + 86_400_000).toISOString();
    render(<ShadowRolloutTeamOverridesTable overrides={[override({ expiresAt: future })]} />);
    const list = within(screen.getByRole("list"));
    expect(list.getByText(/Expires/)).toBeInTheDocument();
    expect(list.queryByText(/Expired/)).not.toBeInTheDocument();
  });

  it("adds an override via the server action with the real teamId/percent", async () => {
    const user = userEvent.setup();
    upsertShadowRolloutTeamOverrideAction.mockResolvedValue({ ok: true });
    render(<ShadowRolloutTeamOverridesTable overrides={[]} />);

    await user.type(screen.getByPlaceholderText("Team ID"), "team_9");
    await user.click(screen.getByRole("button", { name: "Add override" }));

    expect(upsertShadowRolloutTeamOverrideAction).toHaveBeenCalledWith("team_9", { percent: 100, reason: undefined, expiresAt: undefined });
  });

  it("shows an error and does not clear the form when adding without a team ID", async () => {
    const user = userEvent.setup();
    render(<ShadowRolloutTeamOverridesTable overrides={[]} />);

    await user.click(screen.getByRole("button", { name: "Add override" }));

    expect(screen.getByText("Team ID is required")).toBeInTheDocument();
    expect(upsertShadowRolloutTeamOverrideAction).not.toHaveBeenCalled();
  });

  it("removes an override via the server action with the real teamId", async () => {
    const user = userEvent.setup();
    deleteShadowRolloutTeamOverrideAction.mockResolvedValue({ ok: true });
    render(<ShadowRolloutTeamOverridesTable overrides={[override({ teamId: "team_1" })]} />);

    await user.click(screen.getByRole("button", { name: "Remove" }));

    expect(deleteShadowRolloutTeamOverrideAction).toHaveBeenCalledWith("team_1");
  });
});
