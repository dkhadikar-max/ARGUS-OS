import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PageHeader } from "./PageHeader.js";

describe("PageHeader", () => {
  it("renders the title", () => {
    render(<PageHeader title="Analytics" />);
    expect(screen.getByRole("heading", { level: 1, name: "Analytics" })).toBeInTheDocument();
  });

  it("renders the description when given", () => {
    render(<PageHeader title="Analytics" description="Real, computed server-side." />);
    expect(screen.getByText("Real, computed server-side.")).toBeInTheDocument();
  });

  it("omits the description paragraph when not given", () => {
    render(<PageHeader title="Analytics" />);
    expect(screen.queryByText(/computed server-side/)).not.toBeInTheDocument();
  });

  it("renders actions alongside the title in a flex layout when given", () => {
    render(<PageHeader title="Today's Queue" actions={<button type="button">Connect Slack</button>} />);
    expect(screen.getByRole("heading", { name: "Today's Queue" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Connect Slack" })).toBeInTheDocument();
  });

  it("renders description as arbitrary ReactNode, not just plain text", () => {
    render(<PageHeader title="Billing" description={<span data-testid="plan">FREE</span>} />);
    expect(screen.getByTestId("plan")).toHaveTextContent("FREE");
  });
});
