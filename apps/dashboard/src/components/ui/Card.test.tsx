import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Card } from "./Card.js";

describe("Card", () => {
  it("renders the default variant's border/bg classes", () => {
    render(<Card data-testid="card">content</Card>);
    const card = screen.getByTestId("card");
    expect(card.className).toContain("border-gray-200");
    expect(card.className).toContain("bg-white");
  });

  it("renders the dashed variant's classes", () => {
    render(
      <Card variant="dashed" data-testid="card">
        empty
      </Card>,
    );
    const card = screen.getByTestId("card");
    expect(card.className).toContain("border-dashed");
    expect(card.className).toContain("border-gray-300");
  });

  it("renders the error variant on the alert token, not default red", () => {
    render(
      <Card variant="error" data-testid="card">
        error
      </Card>,
    );
    const card = screen.getByTestId("card");
    expect(card.className).toContain("border-alert/30");
    expect(card.className).toContain("bg-alert/5");
  });

  it("merges caller-supplied className (e.g. padding) alongside the variant classes", () => {
    render(
      <Card className="p-6 shadow-sm" data-testid="card">
        content
      </Card>,
    );
    const card = screen.getByTestId("card");
    expect(card.className).toContain("p-6");
    expect(card.className).toContain("shadow-sm");
    expect(card.className).toContain("border-gray-200");
  });

  it("passes through other div props", () => {
    render(
      <Card role="alert" data-testid="card">
        content
      </Card>,
    );
    expect(screen.getByTestId("card")).toHaveAttribute("role", "alert");
  });
});
