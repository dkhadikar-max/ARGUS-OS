import { describe, expect, it } from "vitest";
import { isOriginAllowed } from "./cors.js";

const allowed = ["chrome-extension://", "https://your-dashboard.vercel.app"];

describe("isOriginAllowed", () => {
  it("allows an exact https:// origin match", () => {
    expect(isOriginAllowed("https://your-dashboard.vercel.app", allowed)).toBe(true);
  });

  it("rejects a bypass attempt that merely starts with an allowed https:// origin (the real, fixed vulnerability)", () => {
    expect(isOriginAllowed("https://your-dashboard.vercel.app.evil.com", allowed)).toBe(false);
  });

  it("rejects an origin that merely contains an allowed origin as a substring elsewhere", () => {
    expect(isOriginAllowed("https://evil.com?x=https://your-dashboard.vercel.app", allowed)).toBe(false);
  });

  it("still allows a prefix match for chrome-extension:// origins, since the extension id varies per build", () => {
    expect(isOriginAllowed("chrome-extension://abcdefghijklmnop", allowed)).toBe(true);
  });

  it("rejects an origin that doesn't match anything", () => {
    expect(isOriginAllowed("https://totally-unrelated.com", allowed)).toBe(false);
  });
});
