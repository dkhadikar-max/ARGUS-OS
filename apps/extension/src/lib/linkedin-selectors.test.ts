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

  // Reproduces a second real-world markup variant (observed live on a
  // non-verified profile): the connection-degree badges ("1st", "2nd") sit
  // as separate sibling elements next to the name, rather than combined
  // into one child the way the "3rd" badge was in the fixture above. That
  // gave the name's own container 3 children by coincidence, which an
  // earlier version of findProfileCard's plain children.length >= 3 check
  // returned directly -- producing a title/company of "1st"/"2nd" instead
  // of the real headline and company.
  it("skips a name container whose extra children are only connection-degree badges", () => {
    setUrl("/in/tushar-chouhan/");
    document.title = "Tushar Chouhan | LinkedIn";
    document.body.innerHTML = `
      <main>
        <div>
          <div>
            <div><a href="/in/tushar-chouhan/"><h2>Tushar Chouhan</h2></a></div>
            <span>· 1st</span>
            <span>· 2nd</span>
          </div>
          <p>Full Stack Developer | MERN Stack | BCA Student</p>
          <p>Sigma web development</p>
          <div>Indore, Madhya Pradesh, India</div>
        </div>
      </main>
    `;

    const profile = extractProfileFromDom();
    expect(profile.name).toBe("Tushar Chouhan");
    expect(profile.title).toBe("Full Stack Developer | MERN Stack | BCA Student");
    expect(profile.companyName).toBe("Sigma web development");
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
