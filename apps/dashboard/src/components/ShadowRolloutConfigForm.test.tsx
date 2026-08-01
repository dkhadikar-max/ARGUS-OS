import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const updateShadowRolloutConfigAction = vi.fn();
vi.mock("../app/admin/shadow-rollout/actions", () => ({ updateShadowRolloutConfigAction }));

const { ShadowRolloutConfigForm } = await import("./ShadowRolloutConfigForm.js");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ShadowRolloutConfigForm", () => {
  it("renders the initial enabled/percent/version state", () => {
    render(<ShadowRolloutConfigForm enabled={true} globalPercent={5} version={3} />);

    expect(screen.getByRole("checkbox")).toBeChecked();
    expect(screen.getByDisplayValue("5")).toBeInTheDocument();
    expect(screen.getByText("Config v3")).toBeInTheDocument();
  });

  it("saves the current enabled/percent via the server action, and shows Saved on success", async () => {
    const user = userEvent.setup();
    updateShadowRolloutConfigAction.mockResolvedValue({ ok: true });
    render(<ShadowRolloutConfigForm enabled={false} globalPercent={0} version={1} />);

    await user.click(screen.getByRole("checkbox"));
    const percentInput = screen.getByDisplayValue("0");
    await user.clear(percentInput);
    await user.type(percentInput, "25");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(updateShadowRolloutConfigAction).toHaveBeenCalledWith({ enabled: true, globalPercent: 25 });
    expect(await screen.findByText("Saved!")).toBeInTheDocument();
  });

  it("shows the real error message when the server action fails", async () => {
    const user = userEvent.setup();
    updateShadowRolloutConfigAction.mockResolvedValue({ ok: false, error: "globalPercent must be an integer between 0 and 100" });
    render(<ShadowRolloutConfigForm enabled={true} globalPercent={5} version={1} />);

    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("globalPercent must be an integer between 0 and 100")).toBeInTheDocument();
  });
});
