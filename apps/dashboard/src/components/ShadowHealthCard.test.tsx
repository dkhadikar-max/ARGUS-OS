import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { AdminShadowHealthResponse } from "@argus/shared";
import { ShadowHealthCard } from "./ShadowHealthCard.js";

function health(overrides: Partial<AdminShadowHealthResponse> = {}): AdminShadowHealthResponse {
  return {
    scope: { teamId: null },
    enabled: true,
    samplePercent: 5,
    circuitBreakerState: "closed",
    lastDecisionAt: "2026-07-31T11:59:37.000Z",
    verdictAgreementRate24h: 0.964,
    totalShadowDecisions24h: 42,
    recentErrorCount1h: 0,
    ...overrides,
  };
}

describe("ShadowHealthCard", () => {
  it("shows Enabled with a green dot when enabled", () => {
    render(<ShadowHealthCard health={health({ enabled: true })} />);
    expect(screen.getByText("Enabled")).toBeInTheDocument();
  });

  it("shows Disabled when not enabled", () => {
    render(<ShadowHealthCard health={health({ enabled: false })} />);
    expect(screen.getByText("Disabled")).toBeInTheDocument();
  });

  it("renders sampling percent and error count", () => {
    render(<ShadowHealthCard health={health({ samplePercent: 5, recentErrorCount1h: 3 })} />);
    expect(screen.getByText("5%")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("renders rounded agreement percent when decisions exist in the window", () => {
    render(<ShadowHealthCard health={health({ totalShadowDecisions24h: 42, verdictAgreementRate24h: 0.964 })} />);
    expect(screen.getByText("96%")).toBeInTheDocument();
  });

  it("shows 'No data yet' instead of a misleading 0% when no decisions exist in the window", () => {
    render(<ShadowHealthCard health={health({ totalShadowDecisions24h: 0, verdictAgreementRate24h: 0 })} />);
    expect(screen.getByText("No data yet")).toBeInTheDocument();
    expect(screen.queryByText("0%")).not.toBeInTheDocument();
  });

  it("shows 'Never' for a null lastDecisionAt", () => {
    render(<ShadowHealthCard health={health({ lastDecisionAt: null })} />);
    expect(screen.getByText("Never")).toBeInTheDocument();
  });

  it.each([
    ["closed", "Healthy"],
    ["half_open", "Recovering"],
    ["open", "Open"],
  ] as const)("renders circuit breaker state %s as %s", (state, label) => {
    render(<ShadowHealthCard health={health({ circuitBreakerState: state })} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it("shows the per-instance caption", () => {
    render(<ShadowHealthCard health={health()} />);
    expect(screen.getByText(/per-instance snapshot/i)).toBeInTheDocument();
  });
});
