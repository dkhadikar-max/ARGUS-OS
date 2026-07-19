import { describe, it, expect, afterEach } from "vitest";
import { detectProfilePageType, extractProfileFromDom } from "./linkedin-selectors.js";

function setUrl(path: string) {
  window.history.pushState(null, "", path);
}

afterEach(() => {
  document.body.innerHTML = "";
  document.title = "";
});

describe("detectProfilePageType", () => {
  it("recognizes personal profile URLs", () => {
    expect(detectProfilePageType("https://www.linkedin.com/in/satyanadella/")).toBe("personal");
  });

  it("recognizes company URLs", () => {
    expect(detectProfilePageType("https://www.linkedin.com/company/microsoft/")).toBe("company");
  });

  it("recognizes recruiter URLs", () => {
    expect(detectProfilePageType("https://www.linkedin.com/talent/profile/abc123")).toBe("recruiter");
  });

  it("recognizes sales navigator URLs", () => {
    expect(detectProfilePageType("https://www.linkedin.com/sales/lead/abc123")).toBe("sales_nav");
  });

  it("returns null for unrelated URLs", () => {
    expect(detectProfilePageType("https://www.linkedin.com/feed/")).toBeNull();
  });
});

describe("extractProfileFromDom", () => {
  it("reads name/title/company via the old class-based markup", () => {
    setUrl("/in/satyanadella/");
    document.title = "Satya Nadella | LinkedIn";
    document.body.innerHTML = `
      <main>
        <h1>Satya Nadella</h1>
        <div class="pv-text-details__left-panel">
          <div class="text-body-medium">Chairman and CEO at Microsoft</div>
        </div>
        <a href="/company/microsoft/"><span aria-hidden="true">Microsoft</span></a>
      </main>
    `;

    const profile = extractProfileFromDom();
    expect(profile.name).toBe("Satya Nadella");
    expect(profile.title).toBe("Chairman and CEO at Microsoft");
    expect(profile.companyName).toBe("Microsoft");
    expect(profile.linkedInUrl).toContain("/in/satyanadella/");
  });

  // Reproduces LinkedIn's redesigned profile markup (observed live, no <h1>,
  // no stable classes, no /company/ link) that the selector-only approach
  // above completely misses -- this is the bug this file was rewritten to fix.
  it("falls back to document.title and DOM structure when no selector matches", () => {
    setUrl("/in/satyanadella/");
    document.title = "Satya Nadella | LinkedIn";
    document.body.innerHTML = `
      <main>
        <div>
          <div>
            <span>3rd</span>
            <div>
              <div>
                <a href="/in/satyanadella/">
                  <div>
                    <div><h2>Satya Nadella</h2></div>
                  </div>
                </a>
              </div>
            </div>
          </div>
          <p>Chairman and CEO at Microsoft</p>
          <p>Microsoft</p>
          <div><a href="/in/satyanadella/overlay/contact-info/">Redmond, Washington, United States</a></div>
        </div>
      </main>
    `;

    const profile = extractProfileFromDom();
    expect(profile.name).toBe("Satya Nadella");
    expect(profile.title).toBe("Chairman and CEO at Microsoft");
    expect(profile.companyName).toBe("Microsoft");
  });

  it("does not apply the personal-profile fallback on a company page", () => {
    setUrl("/company/microsoft/");
    document.title = "Microsoft | LinkedIn";
    document.body.innerHTML = `<main><div>No matching selectors here</div></main>`;

    const profile = extractProfileFromDom();
    expect(profile.name).toBeNull();
    expect(profile.title).toBeNull();
    expect(profile.companyName).toBeNull();
  });

  it("returns nulls when nothing matches and there is no fallback card", () => {
    setUrl("/in/someone/");
    document.title = "Someone | LinkedIn";
    document.body.innerHTML = `<main><div>Unrelated content</div></main>`;

    const profile = extractProfileFromDom();
    // No self-referencing link exists, so the structural fallback can't run --
    // only the document.title-derived name survives.
    expect(profile.name).toBe("Someone");
    expect(profile.title).toBeNull();
    expect(profile.companyName).toBeNull();
  });
});
