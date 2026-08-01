import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CompanyMemoryResponse, DecisionResponse, QueueItem } from "@argus/shared";

const getFullDecisionAction = vi.fn();
const recordQueueActionAction = vi.fn();
vi.mock("../app/queue/actions", () => ({ getFullDecisionAction, recordQueueActionAction }));

vi.mock("./LiveQueueBanner", () => ({ LiveQueueBanner: () => null }));

const { QueueWorkspace } = await import("./QueueWorkspace.js");

function item(overrides: Partial<QueueItem> = {}): QueueItem {
  return {
    rank: 1,
    decisionId: "dec_1",
    prospect: { name: "Sarah Chen", title: null, companyName: "DataFlow", linkedInUrl: "https://linkedin.com/in/sarah" },
    verdict: "STRONG_YES",
    confidence: 96,
    priorityScore: 96,
    reason: "ICP match",
    lastActivity: "New since yesterday",
    suggestedAction: "Message now",
    messagePreview: null,
    createdAt: "2026-07-10T00:00:00Z",
    ...overrides,
  };
}

function fullDecision(id: string, overrides: Partial<DecisionResponse> = {}): DecisionResponse {
  return {
    id,
    status: "completed",
    prospect: { name: "Sarah Chen", title: null, companyName: "DataFlow", linkedInUrl: "u" },
    verdict: "STRONG_YES",
    confidence: 96,
    reasoning: "Strong fit for this team.",
    evidence: [],
    message: { linkedin: "Hi Sarah", email: null, tone: "professional", personalizationHooks: [] },
    recommendedAction: "message_now",
    processingTimeMs: 100,
    createdAt: "2026-07-10T00:00:00Z",
    ...overrides,
  };
}

const memory: CompanyMemoryResponse = {
  teamId: "team_1",
  generatedAt: "2026-07-10T00:00:00Z",
  patterns: [],
  riskFlags: [],
  icpAccuracy: null,
  topPerformingMessages: [],
  learningInsights: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  recordQueueActionAction.mockResolvedValue({ ok: true });
  getFullDecisionAction.mockImplementation((id: string) => Promise.resolve({ ok: true, decision: fullDecision(id) }));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("QueueWorkspace", () => {
  it("auto-selects the first item on load and fetches its full decision", async () => {
    const items = [item({ decisionId: "dec_1" }), item({ decisionId: "dec_2", prospect: { name: "Marcus", title: null, companyName: null, linkedInUrl: "u" } })];
    render(<QueueWorkspace items={items} memory={memory} />);

    expect(await screen.findByText("Strong fit for this team.")).toBeInTheDocument();
    expect(getFullDecisionAction).toHaveBeenCalledWith("dec_1");
  });

  it("clicking a different row updates the center pane without a page navigation", async () => {
    const user = userEvent.setup();
    const items = [
      item({ decisionId: "dec_1", prospect: { name: "Sarah Chen", title: null, companyName: "DataFlow", linkedInUrl: "u" } }),
      item({ decisionId: "dec_2", prospect: { name: "Marcus Lee", title: null, companyName: "Acme", linkedInUrl: "u" } }),
    ];
    render(<QueueWorkspace items={items} memory={memory} />);
    await screen.findByText("Strong fit for this team.");

    await user.click(screen.getByText("Marcus Lee · Acme"));

    await waitFor(() => expect(getFullDecisionAction).toHaveBeenCalledWith("dec_2"));
    expect(screen.getByRole("heading", { name: "Marcus Lee @ Acme" })).toBeInTheDocument();
  });

  it("Skip shows the undo toast and removes the row immediately", async () => {
    const user = userEvent.setup();
    const items = [item({ decisionId: "dec_1" })];
    render(<QueueWorkspace items={items} memory={memory} />);
    await screen.findByText("Strong fit for this team.");

    await user.click(screen.getByRole("button", { name: "Skip" }));

    expect(screen.getByText("Skipped Sarah Chen")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Undo" })).toBeInTheDocument();
    expect(recordQueueActionAction).not.toHaveBeenCalled();
  });

  it("letting the undo timer elapse commits the real action", async () => {
    vi.useFakeTimers();
    const items = [item({ decisionId: "dec_1" })];
    render(<QueueWorkspace items={items} memory={memory} />);

    act(() => {
      screen.getByRole("button", { name: "Skip" }).click();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    expect(recordQueueActionAction).toHaveBeenCalledWith("dec_1", "PASSED", undefined);
  });

  it("Undo cancels the pending action and restores the row -- the real action is never sent", async () => {
    const user = userEvent.setup();
    const items = [item({ decisionId: "dec_1" })];
    render(<QueueWorkspace items={items} memory={memory} />);
    await screen.findByText("Strong fit for this team.");

    await user.click(screen.getByRole("button", { name: "Skip" }));
    await user.click(screen.getByRole("button", { name: "Undo" }));

    expect(screen.queryByText("Skipped Sarah Chen")).not.toBeInTheDocument();
    expect(screen.getByText("Sarah Chen · DataFlow")).toBeInTheDocument();
    expect(recordQueueActionAction).not.toHaveBeenCalled();
  });

  it("moves selection to the next item after skipping the currently selected one", async () => {
    const user = userEvent.setup();
    const items = [
      item({ decisionId: "dec_1", prospect: { name: "Sarah Chen", title: null, companyName: "DataFlow", linkedInUrl: "u" } }),
      item({ decisionId: "dec_2", prospect: { name: "Marcus Lee", title: null, companyName: "Acme", linkedInUrl: "u" } }),
    ];
    render(<QueueWorkspace items={items} memory={memory} />);
    await screen.findByText("Strong fit for this team.");

    await user.click(screen.getByRole("button", { name: "Skip" }));

    await waitFor(() => expect(getFullDecisionAction).toHaveBeenCalledWith("dec_2"));
  });

  it("shows the frozen empty-queue copy when there are no items at all", () => {
    render(<QueueWorkspace items={[]} memory={memory} />);
    expect(screen.getByText("Your queue is empty")).toBeInTheDocument();
    expect(getFullDecisionAction).not.toHaveBeenCalled();
  });
});
