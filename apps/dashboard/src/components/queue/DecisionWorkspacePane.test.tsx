import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { DecisionResponse, QueueItem } from "@argus/shared";
import { DecisionWorkspacePane } from "./DecisionWorkspacePane.js";

const item: QueueItem = {
  rank: 1,
  decisionId: "dec_1",
  prospect: {
    name: "Sarah Chen",
    title: "VP Engineering",
    companyName: "DataFlow",
    linkedInUrl: "https://linkedin.com/in/sarahchen",
  },
  verdict: "STRONG_YES",
  confidence: 96,
  priorityScore: 96,
  reason: "ICP match",
  lastActivity: "New since yesterday",
  suggestedAction: "Message now",
  messagePreview: "Hi Sarah...",
  createdAt: "2026-07-10T00:00:00Z",
};

function fullDecision(overrides: Partial<DecisionResponse> = {}): DecisionResponse {
  return {
    id: "dec_1",
    status: "completed",
    prospect: item.prospect,
    verdict: "STRONG_YES",
    confidence: 96,
    reasoning: "Strong fit. Hiring SREs. Recent funding round.",
    evidence: [{ id: "ev_1", type: "INTENT", signal: "Hiring SREs", relevance: "Team growth", confidence: 80 }],
    message: { linkedin: "Hi Sarah — saw your post", email: null, tone: "professional", personalizationHooks: [] },
    recommendedAction: "message_now",
    processingTimeMs: 3200,
    createdAt: "2026-07-10T00:00:00Z",
    ...overrides,
  };
}

function stubClipboard(): ReturnType<typeof vi.fn> {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true, writable: true });
  return writeText;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("DecisionWorkspacePane", () => {
  it("renders the header instantly from the QueueItem prop, independent of decision/loading state", () => {
    render(<DecisionWorkspacePane item={item} decision={null} loading error={null} onAction={vi.fn()} />);

    expect(screen.getByText("Sarah Chen, VP Engineering @ DataFlow")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View on LinkedIn ↗" })).toHaveAttribute(
      "href",
      "https://linkedin.com/in/sarahchen",
    );
  });

  it("shows a skeleton for the reasoning section while loading", () => {
    render(<DecisionWorkspacePane item={item} decision={null} loading error={null} onAction={vi.fn()} />);
    expect(screen.queryByText(/Strong fit/)).not.toBeInTheDocument();
  });

  it("shows reasoning and evidence count once decision data is available", () => {
    render(<DecisionWorkspacePane item={item} decision={fullDecision()} loading={false} error={null} onAction={vi.fn()} />);

    expect(screen.getByText("Strong fit. Hiring SREs.")).toBeInTheDocument();
    expect(screen.getByText("Evidence — 1 signal")).toBeInTheDocument();
  });

  it("Evidence is collapsed by default and expands on click", async () => {
    const user = userEvent.setup();
    render(<DecisionWorkspacePane item={item} decision={fullDecision()} loading={false} error={null} onAction={vi.fn()} />);

    expect(screen.queryByText("Hiring SREs")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Evidence/ }));

    expect(screen.getByText("Hiring SREs")).toBeInTheDocument();
  });

  it("clicking Message copies the draft and calls onAction with MESSAGE_COPIED", async () => {
    const onAction = vi.fn();
    const user = userEvent.setup();
    const writeText = stubClipboard();
    render(<DecisionWorkspacePane item={item} decision={fullDecision()} loading={false} error={null} onAction={onAction} />);

    await user.click(screen.getByRole("button", { name: "Message" }));

    expect(writeText).toHaveBeenCalledWith("Hi Sarah — saw your post");
    expect(onAction).toHaveBeenCalledWith(item, "MESSAGE_COPIED", "Messaged Sarah Chen", { channel: "LINKEDIN" });
    expect(await screen.findByRole("button", { name: "Copied!" })).toBeInTheDocument();
  });

  it("shows an error and does not call onAction when there's no message on either channel", async () => {
    const onAction = vi.fn();
    const user = userEvent.setup();
    const decision = fullDecision({ message: { linkedin: null, email: null, tone: "professional", personalizationHooks: [] } });
    render(<DecisionWorkspacePane item={item} decision={decision} loading={false} error={null} onAction={onAction} />);

    await user.click(screen.getByRole("button", { name: "Message" }));

    expect(await screen.findByText("No message was generated for this decision.")).toBeInTheDocument();
    expect(onAction).not.toHaveBeenCalled();
  });

  it("the Message button is disabled while loading", () => {
    render(<DecisionWorkspacePane item={item} decision={null} loading error={null} onAction={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Loading…" })).toBeDisabled();
  });

  it("Skip calls onAction with PASSED immediately, even while still loading", async () => {
    const onAction = vi.fn();
    const user = userEvent.setup();
    render(<DecisionWorkspacePane item={item} decision={null} loading error={null} onAction={onAction} />);

    await user.click(screen.getByRole("button", { name: "Skip" }));

    expect(onAction).toHaveBeenCalledWith(item, "PASSED", "Skipped Sarah Chen");
  });

  it("the More menu records a real ActionType and never shows a Call option", async () => {
    const onAction = vi.fn();
    const user = userEvent.setup();
    render(<DecisionWorkspacePane item={item} decision={fullDecision()} loading={false} error={null} onAction={onAction} />);

    await user.click(screen.getByRole("button", { name: "More" }));
    expect(screen.queryByText(/Call/)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Snooze" }));

    expect(onAction).toHaveBeenCalledWith(item, "SNOOZED", "Snooze — Sarah Chen");
  });

  it("always shows the honest pending-outcome line", () => {
    render(<DecisionWorkspacePane item={item} decision={fullDecision()} loading={false} error={null} onAction={vi.fn()} />);
    expect(screen.getByText("Pending — no outcome logged yet")).toBeInTheDocument();
  });

  it("keeps the header visible and shows the parent-supplied error when the fetch failed", () => {
    render(<DecisionWorkspacePane item={item} decision={null} loading={false} error="Not authenticated" onAction={vi.fn()} />);

    expect(screen.getByText("Not authenticated")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View on LinkedIn ↗" })).toBeInTheDocument();
  });

  it("resets local UI state (evidence expanded, more menu) when the selected item changes", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <DecisionWorkspacePane item={item} decision={fullDecision()} loading={false} error={null} onAction={vi.fn()} />,
    );
    await user.click(screen.getByRole("button", { name: /Evidence/ }));
    expect(screen.getByText("Hiring SREs")).toBeInTheDocument();

    const other: QueueItem = {
      ...item,
      decisionId: "dec_2",
      prospect: { name: "Marcus Lee", title: null, companyName: null, linkedInUrl: item.prospect.linkedInUrl },
    };
    rerender(<DecisionWorkspacePane item={other} decision={null} loading error={null} onAction={vi.fn()} />);

    expect(screen.getByText("Marcus Lee")).toBeInTheDocument();
    expect(screen.queryByText("Hiring SREs")).not.toBeInTheDocument();
  });
});
