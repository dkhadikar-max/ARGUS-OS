import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ExecutionTraceView } from "./ExecutionTraceView.js";

beforeEach(() => {
  vi.clearAllMocks();
});

function stubClipboard(): ReturnType<typeof vi.fn> {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
    writable: true,
  });
  return writeText;
}

const baseProps = {
  executionId: "exec_1",
  controllerAction: "stop",
  controllerTargetCapability: null,
  controllerReasons: ["Confidence (78) above threshold (70)"],
};

describe("ExecutionTraceView", () => {
  it("renders the summary fields from real top-level fields, not parsed from the trace blob", () => {
    render(<ExecutionTraceView {...baseProps} executionTrace={{ unrelated: "field" }} />);

    expect(screen.getByText("exec_1")).toBeInTheDocument();
    expect(screen.getByText("stop")).toBeInTheDocument();
    expect(screen.getByText("Confidence (78) above threshold (70)")).toBeInTheDocument();
  });

  it("renders stage durations when executionTrace.timings is present", () => {
    render(
      <ExecutionTraceView
        {...baseProps}
        executionTrace={{ timings: [{ stage: "research", latencyMs: 1200 }, { stage: "risk", latencyMs: 800 }] }}
      />,
    );

    expect(screen.getByText("Stage durations")).toBeInTheDocument();
    expect(screen.getByText("research")).toBeInTheDocument();
    expect(screen.getByText("1200ms")).toBeInTheDocument();
  });

  it("omits stage durations when executionTrace has no valid timings array", () => {
    render(<ExecutionTraceView {...baseProps} executionTrace={{ timings: "not-an-array" }} />);
    expect(screen.queryByText("Stage durations")).not.toBeInTheDocument();
  });

  it("shows 'No execution trace recorded' for null, without a raw-trace toggle", () => {
    render(<ExecutionTraceView {...baseProps} executionTrace={null} />);
    expect(screen.getByText("No execution trace recorded.")).toBeInTheDocument();
    expect(screen.queryByText("Show raw trace")).not.toBeInTheDocument();
  });

  it("keeps the raw trace collapsed by default, and copies it once expanded", async () => {
    const user = userEvent.setup();
    const writeText = stubClipboard();
    const executionTrace = { requestId: "exec_1", timings: [] };
    render(<ExecutionTraceView {...baseProps} executionTrace={executionTrace} />);

    const details = screen.getByText("Show raw trace").closest("details");
    expect(details).not.toHaveAttribute("open");

    await user.click(screen.getByText("Show raw trace"));
    await user.click(screen.getByRole("button", { name: "Copy" }));

    expect(writeText).toHaveBeenCalledWith(JSON.stringify(executionTrace, null, 2));
  });
});
