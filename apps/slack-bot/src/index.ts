import { createSlackApp } from "./app.js";
import { startTeamAlertListener } from "./lib/team-alerts.js";
import { startNudgeWorker } from "./jobs/nudges.js";

async function main() {
  const app = createSlackApp();
  await app.start();
  // eslint-disable-next-line no-console
  console.log("ARGUS Slack Bot connected (Socket Mode)");

  startTeamAlertListener();
  startNudgeWorker();
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("ARGUS Slack Bot failed to start", err);
  process.exit(1);
});
