import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { QueueItem } from "@argus/shared";
import { QueuePane } from "./QueuePane.js";

function item(overrides: Partial<QueueItem> = {}): QueueItem {
  return {
    rank: 1,
    decisionId: "dec_1",
    prospect: { name: "Sarah", title: null, companyName: null, linkedInUrl: "u" },
    verdict: "STRONG_YES",
    confidence: 90,
    priorityScore: 90,
    reason: "ICP match",
    lastActivity: "New since yesterday",
    suggestedAction: "Message now",
    messagePreview: null,
    createdAt: "2026-07-10T00:00:00Z",
    ...overrides,
  };
}

const items: QueueItem[] = [
  item({ decisionId: "dec_1", verdict: "STRONG_YES", confidence: 95, prospect: { name: "Sarah", title: null, companyName: null, linkedInUrl: "u" } }),
  item({ decisionId: "dec_2", verdict: "WAIT", confidence: 60, prospect: { name: "Marcus", title: null, companyName: null, linkedInUrl: "u" } }),
  item({ decisionId: "dec_3", verdict: "HARD_PASS", confidence: 85, prospect: { name: "Priya", title: null, companyName: null, linkedInUrl: "u" } }),
];

describe("QueuePane", () => {
  it("renders every item with no filters active", () => {
    render(<QueuePane items={items} selectedId={null} onSelect={vi.fn()} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
  });

  it("calls onSelect with the decisionId when a row is clicked", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<QueuePane items={items} selectedId={null} onSelect={onSelect} />);

    await user.click(screen.getByText("Sarah"));

    expect(onSelect).toHaveBeenCalledWith("dec_1");
  });

  it("filters to a single bucket when its chip is clicked", async () => {
    const user = userEvent.setup();
    render(<QueuePane items={items} selectedId={null} onSelect={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Wait" }));

    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByText("Marcus")).toBeInTheDocument();
  });

  it("combines a bucket filter with High confidence (AND)", async () => {
    const user = userEvent.setup();
    render(<QueuePane items={items} selectedId={null} onSelect={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Ignore" }));
    await user.click(screen.getByRole("button", { name: "High confidence" }));

    // Priya: HARD_PASS (Ignore bucket) + 85% confidence -- passes both.
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByText("Priya")).toBeInTheDocument();
  });

  it("clicking All resets every active filter", async () => {
    const user = userEvent.setup();
    render(<QueuePane items={items} selectedId={null} onSelect={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Wait" }));
    await user.click(screen.getByRole("button", { name: "All" }));

    expect(screen.getAllByRole("listitem")).toHaveLength(3);
  });

  it("shows a no-match message when filters exclude every item", async () => {
    const user = userEvent.setup();
    render(<QueuePane items={[item({ verdict: "STRONG_YES" })]} selectedId={null} onSelect={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Wait" }));

    expect(screen.getByText("No prospects match these filters.")).toBeInTheDocument();
  });
});
