import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UndoToast } from "./UndoToast.js";

describe("UndoToast", () => {
  it("renders the message and an Undo button", () => {
    render(<UndoToast message="Skipped Stripe" onUndo={vi.fn()} />);
    expect(screen.getByText("Skipped Stripe")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Undo" })).toBeInTheDocument();
  });

  it("calls onUndo when the Undo button is clicked", async () => {
    const user = userEvent.setup();
    const onUndo = vi.fn();
    render(<UndoToast message="Skipped Stripe" onUndo={onUndo} />);

    await user.click(screen.getByRole("button", { name: "Undo" }));

    expect(onUndo).toHaveBeenCalledTimes(1);
  });
});
