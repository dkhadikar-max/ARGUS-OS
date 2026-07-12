import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PolicyRule } from "@argus/shared";

const updatePolicyAction = vi.fn();
vi.mock("../app/settings/actions", () => ({ updatePolicyAction }));

const { PolicyRulesEditor } = await import("./PolicyRulesEditor.js");

beforeEach(() => {
  vi.clearAllMocks();
  updatePolicyAction.mockResolvedValue({ ok: true });
});

// Each row renders three <select>s (field, operator, action), in that
// order -- unlike IcpCriteriaEditor's single operator select, so tests here
// pick by index rather than assuming there's only one combobox.
describe("PolicyRulesEditor", () => {
  it("renders a single-value text input for a non-'in' operator", () => {
    const rules: PolicyRule[] = [
      { field: "confidence", operator: "lte", value: 40, action: "FLAG", message: "Low confidence" },
    ];
    render(<PolicyRulesEditor initialRules={rules} />);

    expect(screen.getByPlaceholderText("value")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("value1, value2, value3")).not.toBeInTheDocument();
  });

  it("renders a comma-separated list input for the 'in' operator, seeded from an existing array", () => {
    const rules: PolicyRule[] = [
      { field: "verdict", operator: "in", value: ["PASS", "HARD_PASS"], action: "FLAG", message: "Low-fit verdict" },
    ];
    render(<PolicyRulesEditor initialRules={rules} />);

    const input = screen.getByPlaceholderText("value1, value2, value3") as HTMLInputElement;
    expect(input.value).toBe("PASS, HARD_PASS");
  });

  it("parses a comma-separated string into a real string[] and saves it as an array", async () => {
    const user = userEvent.setup();
    const rules: PolicyRule[] = [
      { field: "verdict", operator: "in", value: [], action: "FLAG", message: "Low-fit verdict" },
    ];
    render(<PolicyRulesEditor initialRules={rules} />);

    const input = screen.getByPlaceholderText("value1, value2, value3");
    await user.type(input, "PASS, HARD_PASS");
    await user.click(screen.getByRole("button", { name: "Save Policy" }));

    await waitFor(() => expect(updatePolicyAction).toHaveBeenCalled());
    const savedRules = updatePolicyAction.mock.calls[0]![0] as PolicyRule[];
    expect(savedRules[0]!.value).toEqual(["PASS", "HARD_PASS"]);
  });

  it("switching from 'in' to another operator collapses the array back to a plain string instead of losing the data", async () => {
    const user = userEvent.setup();
    const rules: PolicyRule[] = [
      { field: "verdict", operator: "in", value: ["PASS", "HARD_PASS"], action: "BLOCK", message: "Do not contact" },
    ];
    render(<PolicyRulesEditor initialRules={rules} />);

    const [, operatorSelect] = screen.getAllByRole("combobox");
    await user.selectOptions(operatorSelect!, "equals");

    expect(screen.queryByPlaceholderText("value1, value2, value3")).not.toBeInTheDocument();
    const input = screen.getByPlaceholderText("value") as HTMLInputElement;
    expect(input.value).toBe("PASS, HARD_PASS");
  });

  it("switching to 'in' from a plain string seeds a one-element array instead of discarding it", async () => {
    const user = userEvent.setup();
    const rules: PolicyRule[] = [
      { field: "verdict", operator: "equals", value: "HARD_PASS", action: "BLOCK", message: "Do not contact" },
    ];
    render(<PolicyRulesEditor initialRules={rules} />);

    const [, operatorSelect] = screen.getAllByRole("combobox");
    await user.selectOptions(operatorSelect!, "in");

    const input = screen.getByPlaceholderText("value1, value2, value3") as HTMLInputElement;
    expect(input.value).toBe("HARD_PASS");
  });

  it("adds a new row with sensible defaults and removes a row", async () => {
    const user = userEvent.setup();
    render(<PolicyRulesEditor initialRules={[]} />);

    expect(screen.queryByPlaceholderText("value")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Add rule" }));
    expect(screen.getByPlaceholderText("value")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Remove" }));
    expect(screen.queryByPlaceholderText("value")).not.toBeInTheDocument();
  });

  it("saves the field/operator/value/action/message for a simple rule", async () => {
    const user = userEvent.setup();
    const rules: PolicyRule[] = [
      { field: "confidence", operator: "lte", value: "", action: "FLAG", message: "" },
    ];
    render(<PolicyRulesEditor initialRules={rules} />);

    await user.type(screen.getByPlaceholderText("value"), "40");
    await user.type(screen.getByPlaceholderText("message shown to the rep"), "Low confidence");
    await user.click(screen.getByRole("button", { name: "Save Policy" }));

    await waitFor(() => expect(updatePolicyAction).toHaveBeenCalled());
    expect(updatePolicyAction.mock.calls[0]![0]).toEqual([
      { field: "confidence", operator: "lte", value: "40", action: "FLAG", message: "Low confidence" },
    ]);
  });

  it("surfaces the server's error when the save fails", async () => {
    const user = userEvent.setup();
    updatePolicyAction.mockResolvedValue({ ok: false, error: "Only a team admin can edit policy rules" });
    render(<PolicyRulesEditor initialRules={[]} />);

    await user.click(screen.getByRole("button", { name: "Save Policy" }));

    expect(await screen.findByText("Only a team admin can edit policy rules")).toBeInTheDocument();
  });
});
