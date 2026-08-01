import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { RolloutPercentBar } from "./RolloutPercentBar.js";

describe("RolloutPercentBar", () => {
  it("renders the numeric percent label", () => {
    render(<RolloutPercentBar percent={15} />);
    expect(screen.getByText("15%")).toBeInTheDocument();
  });

  it("sets the progressbar's aria-valuenow to the real percent", () => {
    render(<RolloutPercentBar percent={42} />);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "42");
  });

  it("clamps the visual bar width to 0-100 for an out-of-range percent, without crashing", () => {
    render(<RolloutPercentBar percent={150} />);
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveStyle({ width: "100%" });
    expect(screen.getByText("150%")).toBeInTheDocument(); // the label still shows the real value
  });
});
