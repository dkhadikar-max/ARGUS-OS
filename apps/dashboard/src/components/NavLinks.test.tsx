import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

let pathname = "/queue";
vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
}));

const { NavLinks } = await import("./NavLinks.js");

describe("NavLinks", () => {
  // Inactive links are ALSO "text-teal-700" on hover
  // ("hover:text-teal-700" contains that literal substring), so
  // distinguishing active vs. inactive checks for the inactive-only
  // "text-gray-600" marker (never present on an active link), not a naive
  // .not.toContain("text-teal-700").
  it("highlights the current route with the active teal treatment", () => {
    pathname = "/queue";
    render(<NavLinks />);
    const active = screen.getByRole("link", { name: "Queue" }).className;
    expect(active).toContain("text-teal-700");
    expect(active).not.toContain("text-gray-600");

    const inactive = screen.getByRole("link", { name: "Performance" }).className;
    expect(inactive).toContain("text-gray-600");
  });

  it("highlights Admin for any /admin sub-route, not just an exact match", () => {
    pathname = "/admin/shadow-rollout";
    render(<NavLinks />);
    const admin = screen.getByRole("link", { name: "Admin" }).className;
    expect(admin).toContain("text-teal-700");
    expect(admin).not.toContain("text-gray-600");
  });

  it("does not highlight Admin when on an unrelated route", () => {
    pathname = "/settings";
    render(<NavLinks />);
    const admin = screen.getByRole("link", { name: "Admin" }).className;
    expect(admin).toContain("text-gray-600");
  });

  it("renders all expected links", () => {
    pathname = "/queue";
    render(<NavLinks />);
    for (const label of ["Queue", "Performance", "Memory", "Settings", "Billing", "Admin"]) {
      expect(screen.getByRole("link", { name: label })).toBeInTheDocument();
    }
  });
});
