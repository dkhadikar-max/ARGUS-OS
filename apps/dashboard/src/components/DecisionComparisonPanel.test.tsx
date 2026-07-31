import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { DecisionComparisonPanel } from "./DecisionComparisonPanel.js";

describe("DecisionComparisonPanel", () => {
  it("renders both live and shadow verdicts, confidences, and reasoning side by side", () => {
    render(
      <DecisionComparisonPanel
        live={{ verdict: "PASS", confidence: 54, reasoning: "live reasoning", recommendedAction: "pass_and_move_on" }}
        shadow={{ verdict: "WAIT", confidence: 52, reasoning: "shadow reasoning", recommendedAction: "wait_for_signal" }}
      />,
    );

    expect(screen.getByText("Live")).toBeInTheDocument();
    expect(screen.getByText("Shadow")).toBeInTheDocument();
    expect(screen.getByText("PASS")).toBeInTheDocument();
    expect(screen.getByText("WAIT")).toBeInTheDocument();
    expect(screen.getByText("live reasoning")).toBeInTheDocument();
    expect(screen.getByText("shadow reasoning")).toBeInTheDocument();
  });

  it("omits the recommended action line when null", () => {
    render(
      <DecisionComparisonPanel
        live={{ verdict: "PASS", confidence: 54, reasoning: "live reasoning", recommendedAction: null }}
        shadow={{ verdict: "WAIT", confidence: 52, reasoning: "shadow reasoning", recommendedAction: null }}
      />,
    );

    expect(screen.queryByText(/_/)).not.toBeInTheDocument();
  });
});
