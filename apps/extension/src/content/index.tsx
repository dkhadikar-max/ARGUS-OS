import { createRoot, type Root } from "react-dom/client";
import { App } from "../sidebar/App.js";
import sidebarStyles from "../sidebar/styles.css?inline";
import { detectProfilePageType } from "../lib/linkedin-selectors.js";
import { watchForUrlChanges } from "./spa-observer.js";

const HOST_ID = "argus-sidebar-host";

let root: Root | null = null;
let hostEl: HTMLElement | null = null;

function mountSidebar() {
  if (hostEl) return; // already mounted

  const mountStartedAt = performance.now();

  hostEl = document.createElement("div");
  hostEl.id = HOST_ID;
  // Bible §18 EXT-1 "Position and styling (right sidebar, responsive)".
  hostEl.style.cssText =
    "position: fixed; top: 0; right: 0; width: 380px; height: 100vh; z-index: 2147483647;";

  document.documentElement.appendChild(hostEl);

  const shadowRoot = hostEl.attachShadow({ mode: "open" });
  const styleEl = document.createElement("style");
  styleEl.textContent = sidebarStyles;
  shadowRoot.appendChild(styleEl);

  const appContainer = document.createElement("div");
  appContainer.style.cssText = "height: 100%; box-shadow: -4px 0 16px rgba(0,0,0,0.12);";
  shadowRoot.appendChild(appContainer);

  root = createRoot(appContainer);
  root.render(<App onClose={unmountSidebar} mountStartedAt={mountStartedAt} />);
}

function unmountSidebar() {
  root?.unmount();
  hostEl?.remove();
  root = null;
  hostEl = null;
}

function syncSidebarToUrl(url: string) {
  const pageType = detectProfilePageType(url);
  if (pageType) {
    // Bible §19.1 QA: "Sidebar does not appear on non-profile pages" and
    // must re-render fresh evidence when navigating profile-to-profile.
    unmountSidebar();
    mountSidebar();
  } else {
    unmountSidebar();
  }
}

syncSidebarToUrl(window.location.href);
watchForUrlChanges(syncSidebarToUrl);
