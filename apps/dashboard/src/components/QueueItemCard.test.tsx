import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { DecisionResponse, QueueItem } from "@argus/shared";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const getFullDecisionAction = vi.fn();
const recordQueueActionAction = vi.fn();
vi.mock("../app/queue/actions", () => ({ getFullDecisionAction, recordQueueActionAction }));

const track = vi.fn();
vi.mock("../lib/analytics", () => ({ track }));

const { QueueItemCard } = await import("./QueueItemCard.js");

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
    reasoning: "Strong fit, hiring SREs.",
    evidence: [],
    message: { linkedin: "Hi Sarah — saw your post", email: null, tone: "professional", personalizationHooks: [] },
    recommendedAction: "message_now",
    processingTimeMs: 3200,
    createdAt: "2026-07-10T00:00:00Z",
    ...overrides,
  };
}

// @testing-library/user-event's own setup() unconditionally installs its
// OWN navigator.clipboard stub (a real, working writeText, not a mock) via
// Clipboard.attachClipboardStubToView -- regardless of whether any
// clipboard-related action (copy/cut/paste) is ever used. Since that
// happens inside each test's own `userEvent.setup()` call, defining a mock
// clipboard in a shared beforeEach (which runs *before* that) gets silently
// overwritten the moment userEvent.setup() runs. Stubbing it again
// afterward, via this helper called after setup() in each test that needs
// it, makes this mock the last one installed.
function stubClipboard(): ReturnType<typeof vi.fn> {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
    writable: true,
  });
  return writeText;
}

beforeEach(() => {
  vi.clearAllMocks();
  recordQueueActionAction.mockResolvedValue({ ok: true });
});

describe("QueueItemCard", () => {
  it("always shows the 'View on LinkedIn' link, independent of any fetch (regression: this used to be gated behind a successful decision fetch)", () => {
    render(<QueueItemCard item={item} />);
    expect(screen.getByRole("link", { name: "View on LinkedIn ↗" })).toHaveAttribute(
      "href",
      "https://linkedin.com/in/sarahchen",
    );
  });

  it("clicking View fetches and expands the full decision, firing queue_item_clicked once", async () => {
    const user = userEvent.setup();
    getFullDecisionAction.mockResolvedValue({ ok: true, decision: fullDecision() });
    render(<QueueItemCard item={item} />);

    await user.click(screen.getByRole("button", { name: "View" }));

    expect(await screen.findByText("Strong fit, hiring SREs.")).toBeInTheDocument();
    expect(getFullDecisionAction).toHaveBeenCalledWith("dec_1");
    expect(track).toHaveBeenCalledWith({
      name: "queue_item_clicked",
      properties: { decision_id: "dec_1", rank: 1, verdict: "STRONG_YES" },
    });
    expect(screen.getByRole("button", { name: "Hide" })).toBeInTheDocument();
  });

  it("clicking View a second time toggles closed without re-fetching (decision already cached)", async () => {
    const user = userEvent.setup();
    getFullDecisionAction.mockResolvedValue({ ok: true, decision: fullDecision() });
    render(<QueueItemCard item={item} />);

    await user.click(screen.getByRole("button", { name: "View" }));
    await screen.findByText("Strong fit, hiring SREs.");
    await user.click(screen.getByRole("button", { name: "Hide" }));

    expect(screen.queryByText("Strong fit, hiring SREs.")).not.toBeInTheDocument();
    expect(getFullDecisionAction).toHaveBeenCalledTimes(1);
  });

  it("shows an error (and keeps the LinkedIn link visible) when the decision fetch fails", async () => {
    const user = userEvent.setup();
    getFullDecisionAction.mockResolvedValue({ ok: false, error: "Not authenticated" });
    render(<QueueItemCard item={item} />);

    await user.click(screen.getByRole("button", { name: "View" }));

    expect(await screen.findByText("Not authenticated")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View on LinkedIn ↗" })).toBeInTheDocument();
  });

  it("clicking Message copies the message body, records MESSAGE_COPIED with the right channel, and refreshes", async () => {
    const user = userEvent.setup();
    const writeText = stubClipboard();
    getFullDecisionAction.mockResolvedValue({ ok: true, decision: fullDecision() });
    render(<QueueItemCard item={item} />);

    await user.click(screen.getByRole("button", { name: "Message" }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith("Hi Sarah — saw your post"));
    expect(recordQueueActionAction).toHaveBeenCalledWith("dec_1", "MESSAGE_COPIED", { channel: "LINKEDIN" });
    expect(refresh).toHaveBeenCalled();
    expect(await screen.findByRole("button", { name: "Copied!" })).toBeInTheDocument();
  });

  it("shows an error and does nothing else when the decision has no message on either channel", async () => {
    const user = userEvent.setup();
    const writeText = stubClipboard();
    getFullDecisionAction.mockResolvedValue({
      ok: true,
      decision: fullDecision({ message: { linkedin: null, email: null, tone: "professional", personalizationHooks: [] } }),
    });
    render(<QueueItemCard item={item} />);

    await user.click(screen.getByRole("button", { name: "Message" }));

    expect(await screen.findByText("No message was generated for this decision.")).toBeInTheDocument();
    expect(writeText).not.toHaveBeenCalled();
    expect(recordQueueActionAction).not.toHaveBeenCalled();
  });

  it("clicking Snooze records SNOOZED and refreshes", async () => {
    const user = userEvent.setup();
    render(<QueueItemCard item={item} />);

    await user.click(screen.getByRole("button", { name: "Snooze" }));

    expect(recordQueueActionAction).toHaveBeenCalledWith("dec_1", "SNOOZED");
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("surfaces the server's error when recordQueueActionAction fails (regression: this used to be silently ignored)", async () => {
    const user = userEvent.setup();
    recordQueueActionAction.mockResolvedValue({ ok: false, error: "An action has already been recorded for this decision" });
    render(<QueueItemCard item={item} />);

    await user.click(screen.getByRole("button", { name: "Snooze" }));

    expect(await screen.findByText("An action has already been recorded for this decision")).toBeInTheDocument();
  });

  it("shows the Policy Engine's flags when expanded (Policy v2.1 L4, not the Bible)", async () => {
    const user = userEvent.setup();
    getFullDecisionAction.mockResolvedValue({
      ok: true,
      decision: fullDecision({
        policyFlags: [
          { field: "verdict", action: "BLOCK", message: "Do not contact HARD_PASS prospects" },
          { field: "confidence", action: "FLAG", message: "Very high confidence -- double-check evidence" },
        ],
      }),
    });
    render(<QueueItemCard item={item} />);

    await user.click(screen.getByRole("button", { name: "View" }));

    expect(await screen.findByText("Do not contact HARD_PASS prospects")).toBeInTheDocument();
    expect(screen.getByText("Very high confidence -- double-check evidence")).toBeInTheDocument();
  });

  it("shows no policy-flags section when the decision has none", async () => {
    const user = userEvent.setup();
    getFullDecisionAction.mockResolvedValue({ ok: true, decision: fullDecision({ policyFlags: [] }) });
    render(<QueueItemCard item={item} />);

    await user.click(screen.getByRole("button", { name: "View" }));

    await screen.findByText("Strong fit, hiring SREs.");
    expect(screen.queryByText(/BLOCK:|FLAG:|REQUIRE_APPROVAL:/)).not.toBeInTheDocument();
  });
});
