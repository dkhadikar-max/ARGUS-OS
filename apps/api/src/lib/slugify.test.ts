import { describe, expect, it } from "vitest";
import { slugify } from "./slugify.js";

describe("slugify", () => {
  it("lowercases and replaces runs of non-alphanumerics with a single dash", () => {
    expect(slugify("Sarah Chen!!  DataFlow")).toBe("sarah-chen-dataflow");
  });

  it("trims a leading/trailing dash left over from a leading/trailing non-alphanumeric character", () => {
    expect(slugify("!Unusual procurement process!")).toBe("unusual-procurement-process");
  });

  it("caps length at 40 characters", () => {
    const long = "a".repeat(60);
    expect(slugify(long)).toHaveLength(40);
  });
});
