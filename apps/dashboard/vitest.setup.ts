import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

// @testing-library/react's own auto-cleanup relies on detecting a global
// afterEach, which this project doesn't have (tests import afterEach/etc.
// explicitly from "vitest" rather than setting test.globals: true) --
// without this, every rendered component from a prior test stays mounted
// in the DOM, so a later test's queries (e.g. getByRole) can match
// leftover elements from earlier tests and fail with a "multiple elements
// found" error that has nothing to do with the component under test.
afterEach(() => {
  cleanup();
});
