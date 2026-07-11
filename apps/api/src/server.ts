import { createServer } from "node:http";
import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./lib/logger.js";
import { initSentry } from "./lib/sentry.js";
import { attachWebSocketServer } from "./lib/websocket.js";

initSentry();

const app = createApp();
// Bible §10.6 WebSocket API shares the same host/port as the REST API
// (wss://api.argus.ai/ws, not a separate service) -- Socket.io attaches to
// the raw http.Server and handles the WS upgrade itself, so this can no
// longer be app.listen() directly on the Express app.
const httpServer = createServer(app);
attachWebSocketServer(httpServer);

httpServer.listen(env.PORT, () => {
  logger.info(`ARGUS API listening on port ${env.PORT} (${env.NODE_ENV})`);
});
