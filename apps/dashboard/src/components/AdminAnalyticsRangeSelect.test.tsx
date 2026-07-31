import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const push = vi.fn();
const searchParamsGet = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => ({ get: searchParamsGet, toString: () => "" }),
}));

const { AdminAnalyticsRangeSelect } = await import("./AdminAnalyticsRangeSelect.js");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AdminAnalyticsRangeSelect", () => {
  it("defaults to 7 days when no sinceDays param is present", () => {
    searchParamsGet.mockReturnValue(null);
    render(<AdminAnalyticsRangeSelect />);
    expect(screen.getByRole("combobox")).toHaveValue("7");
  });

  it("navigates to /admin/analytics with the selected sinceDays", async () => {
    searchParamsGet.mockReturnValue(null);
    const user = userEvent.setup();
    render(<AdminAnalyticsRangeSelect />);

    await user.selectOptions(screen.getByRole("combobox"), "30");

    expect(push).toHaveBeenCalledWith("/admin/analytics?sinceDays=30");
  });
});
