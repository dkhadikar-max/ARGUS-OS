import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AgentOutputsView } from "./AgentOutputsView.js";

beforeEach(() => {
  vi.clearAllMocks();
});

// userEvent.setup() unconditionally installs its own navigator.clipboard
// stub, overwriting anything defined beforehand -- must be (re)stubbed
// after setup(), matching QueueItemCard.test.tsx's established convention.
function stubClipboard(): ReturnType<typeof vi.fn> {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
    writable: true,
  });
  return writeText;
}

describe("AgentOutputsView", () => {
  it("renders a real object collapsed by default, with the raw JSON not visible until expanded", () => {
    render(<AgentOutputsView title="Live agent output" agentOutputs={{ judge: { verdict: "PASS" } }} />);

    expect(screen.getByText("Live agent output")).toBeInTheDocument();
    const details = screen.getByText("Live agent output").closest("details");
    expect(details).not.toHaveAttribute("open");
  });

  it("shows 'No agent output recorded' for null", () => {
    render(<AgentOutputsView title="Live agent output" agentOutputs={null} />);
    expect(screen.getByText("No agent output recorded.")).toBeInTheDocument();
  });

  it("shows 'No agent output recorded' for undefined", () => {
    render(<AgentOutputsView title="Live agent output" agentOutputs={undefined} />);
    expect(screen.getByText("No agent output recorded.")).toBeInTheDocument();
  });

  it("copies the formatted JSON to the clipboard when the copy button is clicked after expanding", async () => {
    const user = userEvent.setup();
    const writeText = stubClipboard();
    render(<AgentOutputsView title="Shadow agent output" agentOutputs={{ judge: { verdict: "WAIT" } }} />);

    await user.click(screen.getByText("Shadow agent output"));
    await user.click(screen.getByRole("button", { name: "Copy" }));

    expect(writeText).toHaveBeenCalledWith(JSON.stringify({ judge: { verdict: "WAIT" } }, null, 2));
  });
});
