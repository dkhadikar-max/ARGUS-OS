import { loadEnv } from "vite";
import { defineManifest } from "@crxjs/vite-plugin";
import pkg from "./package.json" with { type: "json" };

// Bible §16.1 Risk #12 (Chrome Store rejection): "Follow Manifest V3
// guidelines; minimal permissions". We request only what the sidebar and
// auth sync actually need — no "tabs", no broad "<all_urls>" host access.
//
// A function (not a static object) so host_permissions can read the same
// VITE_API_BASE_URL env var src/background/index.ts fetches against
// (loadEnv, not import.meta.env: this file runs in Vite's Node config
// context, which doesn't have import.meta.env). Was a static object with
// host_permissions hardcoded to localhost — harmless in dev, but a real
// Chrome Web Store submission built that way would declare permission for
// a URL no end user's machine has listening, alongside code that (before
// this same pass) was hardcoded to fetch that same unreachable URL.
export default defineManifest(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiBaseUrl = env["VITE_API_BASE_URL"] || "http://localhost:4000";

  return {
    manifest_version: 3,
    name: "ARGUS AI — Decision Operating System",
    version: pkg.version,
    description:
      "Verdict, evidence, and a personalized message on every LinkedIn profile — in under 10 seconds.",
    icons: {
      16: "icon-16.png",
      32: "icon-32.png",
      48: "icon-48.png",
      128: "icon-128.png",
    },
    action: {
      default_title: "ARGUS AI",
      default_icon: {
        16: "icon-16.png",
        32: "icon-32.png",
        48: "icon-48.png",
        128: "icon-128.png",
      },
    },
    permissions: ["storage"],
    host_permissions: ["https://www.linkedin.com/*", `${apiBaseUrl}/*`],
    background: {
      service_worker: "src/background/index.ts",
      type: "module",
    },
    content_scripts: [
      {
        matches: ["https://www.linkedin.com/*"],
        js: ["src/content/index.tsx"],
        run_at: "document_idle",
      },
    ],
  };
});
