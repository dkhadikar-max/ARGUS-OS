import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./lib/logger.js";
import { initSentry } from "./lib/sentry.js";

initSentry();

const app = createApp();

app.listen(env.PORT, () => {
  logger.info(`ARGUS API listening on port ${env.PORT} (${env.NODE_ENV})`);
});
