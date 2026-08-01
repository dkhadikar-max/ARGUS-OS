import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { QueueItem } from "@argus/shared";
import { QueueRow } from "./QueueRow.js";

function item(overrides: Partial<QueueItem> = {}): QueueItem {
  return {
    rank: 1,
    decisionId: "dec_1",
    prospect: { name: "Sarah Chen", title: "VP Eng", companyName: "DataFlow", linkedInUrl: "https://linkedin.com/in/sarahchen" },
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

describe("QueueRow", () => {
  it("renders the prospect name, company, reason, and confidence", () => {
    render(<QueueRow item={item()} selected={false} onSelect={vi.fn()} />);
    expect(screen.getByText("Sarah Chen · DataFlow")).toBeInTheDocument();
    expect(screen.getByText("ICP match")).toBeInTheDocument();
    expect(screen.getByText("96%")).toBeInTheDocument();
  });

  it("calls onSelect when clicked", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<QueueRow item={item()} selected={false} onSelect={onSelect} />);

    await user.click(screen.getByRole("button"));

    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("marks the selected row with aria-current and the persistent selected styling", () => {
    render(<QueueRow item={item()} selected onSelect={vi.fn()} />);
    const button = screen.getByRole("button");
    expect(button).toHaveAttribute("aria-current", "true");
    expect(button.className).toContain("border-teal-600");
  });

  it("does not mark an unselected row with aria-current", () => {
    render(<QueueRow item={item()} selected={false} onSelect={vi.fn()} />);
    expect(screen.getByRole("button")).not.toHaveAttribute("aria-current");
  });

  it.each<[QueueItem["verdict"], string]>([
    ["STRONG_YES", "Contact"],
    ["WAIT", "Wait"],
    ["HARD_PASS", "Ignore"],
  ])("labels the verdict-bucket dot for %s as %s", (verdict, bucket) => {
    render(<QueueRow item={item({ verdict })} selected={false} onSelect={vi.fn()} />);
    expect(screen.getByTitle(bucket)).toBeInTheDocument();
  });
});
