import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const previewShadowRolloutAction = vi.fn();
vi.mock("../app/admin/shadow-rollout/actions", () => ({ previewShadowRolloutAction }));

const { ShadowRolloutPreviewTool } = await import("./ShadowRolloutPreviewTool.js");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ShadowRolloutPreviewTool", () => {
  it("shows an error and does not call the action when either field is empty", async () => {
    const user = userEvent.setup();
    render(<ShadowRolloutPreviewTool />);

    await user.click(screen.getByRole("button", { name: "Run preview" }));

    expect(screen.getByText("Both prospect ID and team ID are required")).toBeInTheDocument();
    expect(previewShadowRolloutAction).not.toHaveBeenCalled();
  });

  it("calls the action with the real prospectId/teamId and renders the full breakdown on success", async () => {
    const user = userEvent.setup();
    previewShadowRolloutAction.mockResolvedValue({
      ok: true,
      preview: {
        enabled: true,
        globalPercent: 5,
        override: { teamId: "team_1", percent: 100, reason: "Customer validation", expiresAt: null },
        effectivePercent: 100,
        bucket: 17,
        sampled: true,
      },
    });
    render(<ShadowRolloutPreviewTool />);

    await user.type(screen.getByPlaceholderText("Prospect ID"), "prospect_1");
    await user.type(screen.getByPlaceholderText("Team ID"), "team_1");
    await user.click(screen.getByRole("button", { name: "Run preview" }));

    expect(previewShadowRolloutAction).toHaveBeenCalledWith("prospect_1", "team_1");
    expect(await screen.findByText("YES")).toBeInTheDocument();
    expect(screen.getByText("17")).toBeInTheDocument();
    // Both Override and Effective % render "100%" here -- real, not a bug.
    expect(screen.getAllByText("100%")).toHaveLength(2);
  });

  it("shows NO for a real not-sampled result", async () => {
    const user = userEvent.setup();
    previewShadowRolloutAction.mockResolvedValue({
      ok: true,
      preview: { enabled: true, globalPercent: 5, override: null, effectivePercent: 5, bucket: 63, sampled: false },
    });
    render(<ShadowRolloutPreviewTool />);

    await user.type(screen.getByPlaceholderText("Prospect ID"), "prospect_1");
    await user.type(screen.getByPlaceholderText("Team ID"), "team_1");
    await user.click(screen.getByRole("button", { name: "Run preview" }));

    expect(await screen.findByText("NO")).toBeInTheDocument();
    expect(screen.getByText("none")).toBeInTheDocument(); // no override
  });

  it("shows the real error message when the action fails", async () => {
    const user = userEvent.setup();
    previewShadowRolloutAction.mockResolvedValue({ ok: false, error: "Failed to compute preview" });
    render(<ShadowRolloutPreviewTool />);

    await user.type(screen.getByPlaceholderText("Prospect ID"), "prospect_1");
    await user.type(screen.getByPlaceholderText("Team ID"), "team_1");
    await user.click(screen.getByRole("button", { name: "Run preview" }));

    expect(await screen.findByText("Failed to compute preview")).toBeInTheDocument();
  });
});
