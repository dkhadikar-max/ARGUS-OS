import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import type { AdminShadowLiveMetricsResponse } from "@argus/shared";

const getShadowLiveMetricsAction = vi.fn();
vi.mock("../app/admin/shadow-health/actions", () => ({ getShadowLiveMetricsAction }));

const { ShadowLiveHealthPanel } = await import("./ShadowLiveHealthPanel.js");

function metrics(overrides: Partial<AdminShadowLiveMetricsResponse> = {}): AdminShadowLiveMetricsResponse {
  return {
    enabled: true,
    globalPercent: 5,
    maxConcurrent: 2,
    inFlightCount: 1,
    circuitBreakerState: "closed",
    timeoutThresholdMs: 180_000,
    timeoutCount1h: 0,
    dropCount1h: 0,
    errorCount1h: 0,
    totalAttempted1h: 10,
    errorRate1h: 0,
    p95LatencyMs1h: 842,
    hasQueue: false,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("ShadowLiveHealthPanel", () => {
  it("renders all fields from the initial payload", () => {
    render(<ShadowLiveHealthPanel initialMetrics={metrics()} />);

    expect(screen.getByText("Shadow mode ON")).toBeInTheDocument();
    expect(screen.getByText("5%")).toBeInTheDocument();
    expect(screen.getByText("Healthy")).toBeInTheDocument();
    expect(screen.getByText("842ms")).toBeInTheDocument();
    expect(screen.getByText("1 of 2 slots in use")).toBeInTheDocument();
    expect(screen.getByText("0.0%")).toBeInTheDocument();
    expect(screen.getByText("(0 of 10 attempted)")).toBeInTheDocument();
    expect(screen.getByText(/No queue/)).toBeInTheDocument();
  });

  it("shows a short explanation for the current circuit breaker state", () => {
    render(<ShadowLiveHealthPanel initialMetrics={metrics({ circuitBreakerState: "half_open" })} />);

    expect(screen.getByText("Recovering")).toBeInTheDocument();
    expect(screen.getByText("Testing recovery after previous failures.")).toBeInTheDocument();
  });

  it("shows the configured timeout threshold alongside the timeout count", () => {
    render(<ShadowLiveHealthPanel initialMetrics={metrics({ timeoutCount1h: 4, timeoutThresholdMs: 180_000 })} />);

    expect(screen.getByText("(180s threshold)")).toBeInTheDocument();
  });

  it("shows a per-instance caveat covering the in-flight/breaker/timeout/drop/error fields", () => {
    render(<ShadowLiveHealthPanel initialMetrics={metrics()} />);

    expect(screen.getByText(/per-instance snapshot/)).toBeInTheDocument();
  });

  it("shows 'Polling every 15s' when the tab is visible", () => {
    Object.defineProperty(document, "hidden", { value: false, configurable: true });
    render(<ShadowLiveHealthPanel initialMetrics={metrics()} />);

    expect(screen.getByText("Polling every 15s")).toBeInTheDocument();
    expect(screen.queryByText(/Paused/)).not.toBeInTheDocument();
  });

  it("shows 'Paused — tab hidden' instead of the polling label when the tab starts hidden", () => {
    Object.defineProperty(document, "hidden", { value: true, configurable: true });
    render(<ShadowLiveHealthPanel initialMetrics={metrics()} />);

    expect(screen.getByText("Paused — tab hidden")).toBeInTheDocument();
    expect(screen.queryByText("Polling every 15s")).not.toBeInTheDocument();
  });

  it("switches the label live when visibility changes", () => {
    Object.defineProperty(document, "hidden", { value: false, configurable: true });
    render(<ShadowLiveHealthPanel initialMetrics={metrics()} />);
    expect(screen.getByText("Polling every 15s")).toBeInTheDocument();

    Object.defineProperty(document, "hidden", { value: true, configurable: true });
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(screen.getByText("Paused — tab hidden")).toBeInTheDocument();
  });

  it("shows Shadow mode OFF when disabled", () => {
    render(<ShadowLiveHealthPanel initialMetrics={metrics({ enabled: false })} />);
    expect(screen.getByText("Shadow mode OFF")).toBeInTheDocument();
  });

  it("shows 'No data yet' for null p95LatencyMs1h and null errorRate1h, not a fabricated 0", () => {
    render(<ShadowLiveHealthPanel initialMetrics={metrics({ p95LatencyMs1h: null, errorRate1h: null, totalAttempted1h: 0 })} />);

    const noDataYet = screen.getAllByText("No data yet");
    expect(noDataYet).toHaveLength(2);
    expect(screen.queryByText(/attempted\)/)).not.toBeInTheDocument();
  });

  it("renders the real explanatory line when hasQueue is true (not hardcoded false)", () => {
    render(<ShadowLiveHealthPanel initialMetrics={metrics({ hasQueue: true })} />);
    expect(screen.getByText("A queue exists.")).toBeInTheDocument();
  });

  it("Refresh now re-fetches and renders the new values", async () => {
    getShadowLiveMetricsAction.mockResolvedValue({ ok: true, metrics: metrics({ globalPercent: 25 }) });
    render(<ShadowLiveHealthPanel initialMetrics={metrics({ globalPercent: 5 })} />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Refresh now" }));
    });

    expect(getShadowLiveMetricsAction).toHaveBeenCalledTimes(1);
    expect(screen.getByText("25%")).toBeInTheDocument();
  });

  it("a failed refresh keeps the last-known-good values and shows a stale indicator", async () => {
    getShadowLiveMetricsAction.mockResolvedValue({ ok: false, error: "network down" });
    render(<ShadowLiveHealthPanel initialMetrics={metrics({ globalPercent: 5 })} />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Refresh now" }));
    });

    expect(screen.getByText("5%")).toBeInTheDocument(); // unchanged
    expect(screen.getByText(/Last refresh failed/)).toBeInTheDocument();
  });

  it("polls again after the 15s interval while the tab is visible", async () => {
    vi.useFakeTimers();
    Object.defineProperty(document, "hidden", { value: false, configurable: true });
    getShadowLiveMetricsAction.mockResolvedValue({ ok: true, metrics: metrics() });
    render(<ShadowLiveHealthPanel initialMetrics={metrics()} />);

    expect(getShadowLiveMetricsAction).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });

    expect(getShadowLiveMetricsAction).toHaveBeenCalledTimes(1);
  });

  it("does not poll while the tab is hidden", async () => {
    vi.useFakeTimers();
    Object.defineProperty(document, "hidden", { value: true, configurable: true });
    getShadowLiveMetricsAction.mockResolvedValue({ ok: true, metrics: metrics() });
    render(<ShadowLiveHealthPanel initialMetrics={metrics()} />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });

    expect(getShadowLiveMetricsAction).not.toHaveBeenCalled();
  });
});
