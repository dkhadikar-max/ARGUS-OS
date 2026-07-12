import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { IcpCriterion } from "@argus/shared";

const updateIcpAction = vi.fn();
vi.mock("../app/settings/actions", () => ({ updateIcpAction }));

const { IcpCriteriaEditor } = await import("./IcpCriteriaEditor.js");

beforeEach(() => {
  vi.clearAllMocks();
  updateIcpAction.mockResolvedValue({ ok: true });
});

describe("IcpCriteriaEditor", () => {
  it("renders a single-value text input for a non-'in' operator", () => {
    const criteria: IcpCriterion[] = [{ field: "companySize", operator: "gte", value: 50, weight: 1 }];
    render(<IcpCriteriaEditor initialCriteria={criteria} />);

    expect(screen.getByPlaceholderText("value")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("value1, value2, value3")).not.toBeInTheDocument();
  });

  it("renders a comma-separated list input for the 'in' operator, seeded from an existing array", () => {
    const criteria: IcpCriterion[] = [
      { field: "industry", operator: "in", value: ["SaaS", "Fintech"], weight: 1 },
    ];
    render(<IcpCriteriaEditor initialCriteria={criteria} />);

    const input = screen.getByPlaceholderText("value1, value2, value3") as HTMLInputElement;
    expect(input.value).toBe("SaaS, Fintech");
  });

  it("parses a comma-separated string into a real string[] and saves it as an array (Bible §9.1 icpCriterionSchema)", async () => {
    const user = userEvent.setup();
    const criteria: IcpCriterion[] = [{ field: "industry", operator: "in", value: [], weight: 1 }];
    render(<IcpCriteriaEditor initialCriteria={criteria} />);

    const input = screen.getByPlaceholderText("value1, value2, value3");
    await user.type(input, "SaaS, Fintech,  Healthcare ");
    await user.click(screen.getByRole("button", { name: "Save ICP" }));

    await waitFor(() => expect(updateIcpAction).toHaveBeenCalled());
    const savedCriteria = updateIcpAction.mock.calls[0]![0] as IcpCriterion[];
    expect(savedCriteria[0]!.value).toEqual(["SaaS", "Fintech", "Healthcare"]);
  });

  it("switching from 'in' to another operator collapses the array back to a plain string instead of losing the data", async () => {
    const user = userEvent.setup();
    const criteria: IcpCriterion[] = [
      { field: "industry", operator: "in", value: ["SaaS", "Fintech"], weight: 1 },
    ];
    render(<IcpCriteriaEditor initialCriteria={criteria} />);

    await user.selectOptions(screen.getByRole("combobox"), "equals");

    expect(screen.queryByPlaceholderText("value1, value2, value3")).not.toBeInTheDocument();
    const input = screen.getByPlaceholderText("value") as HTMLInputElement;
    expect(input.value).toBe("SaaS, Fintech");
  });

  it("switching to 'in' from a plain string seeds a one-element array instead of discarding it", async () => {
    const user = userEvent.setup();
    const criteria: IcpCriterion[] = [{ field: "industry", operator: "equals", value: "SaaS", weight: 1 }];
    render(<IcpCriteriaEditor initialCriteria={criteria} />);

    await user.selectOptions(screen.getByRole("combobox"), "in");

    const input = screen.getByPlaceholderText("value1, value2, value3") as HTMLInputElement;
    expect(input.value).toBe("SaaS");
  });
});
