import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ShadowMetricsSummaryCards } from "./ShadowMetricsSummaryCards.js";

function metrics(overrides: Partial<Parameters<typeof ShadowMetricsSummaryCards>[0]["metrics"]> = {}) {
  return {
    totalShadowDecisions: 42,
    verdictAgreementRate: 0.75,
    avgConfidenceDelta: -3.2,
    p50ConfidenceDelta: -2,
    avgCostUsd: 0.0123,
    totalCostUsd: 0.52,
    ...overrides,
  };
}

describe("ShadowMetricsSummaryCards", () => {
  it("shows an empty state when totalShadowDecisions is 0", () => {
    render(<ShadowMetricsSummaryCards metrics={metrics({ totalShadowDecisions: 0 })} />);
    expect(screen.getByText("No shadow decisions in this window")).toBeInTheDocument();
  });

  it("renders the real values, not placeholders", () => {
    render(<ShadowMetricsSummaryCards metrics={metrics()} />);

    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText("75%")).toBeInTheDocument();
    expect(screen.getByText("-3.2")).toBeInTheDocument();
    expect(screen.getByText("Median -2")).toBeInTheDocument();
    expect(screen.getByText("$0.52")).toBeInTheDocument();
    expect(screen.getByText("$0.0123 / decision")).toBeInTheDocument();
  });

  it("signs a positive confidence delta", () => {
    render(<ShadowMetricsSummaryCards metrics={metrics({ avgConfidenceDelta: 4.5, p50ConfidenceDelta: 3 })} />);
    expect(screen.getByText("+4.5")).toBeInTheDocument();
    expect(screen.getByText("Median +3")).toBeInTheDocument();
  });
});
