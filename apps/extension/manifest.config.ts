import { defineManifest } from "@crxjs/vite-plugin";
import pkg from "./package.json" with { type: "json" };

// Bible §16.1 Risk #12 (Chrome Store rejection): "Follow Manifest V3
// guidelines; minimal permissions". We request only what the sidebar and
// auth sync actually need — no "tabs", no broad "<all_urls>" host access.
export default defineManifest({
  manifest_version: 3,
  name: "ARGUS AI — Decision Operating System",
  version: pkg.version,
  description:
    "Verdict, evidence, and a personalized message on every LinkedIn profile — in under 10 seconds.",
  // Store icons are a design-asset deliverable (Chrome Web Store listing,
  // §19.2 launch checklist) supplied later by design, not generated here.
  action: {
    default_title: "ARGUS AI",
  },
  permissions: ["storage"],
  host_permissions: [
    "https://www.linkedin.com/*",
    "http://localhost:4000/*",
  ],
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
});
