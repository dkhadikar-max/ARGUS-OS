import type { Server as HttpServer } from "node:http";
import { Server as SocketIOServer, type Socket } from "socket.io";
import { Redis } from "ioredis";
import { env, corsAllowedOrigins } from "../config/env.js";
import { authenticateWithJwt } from "../middleware/auth.js";
import { logger } from "./logger.js";
import type { TeamEvent } from "./pubsub.js";

// Bible §10.6 WebSocket API, verbatim contract:
//   Connection: wss://api.argus.ai/ws?token={jwt}
//   Client -> Server: { "type": "subscribe", "channel": "team:team_456" }
//   Server -> Client: { "type": "decision.created", "data": {...} }
//                      { "type": "outcome.logged", "data": {...} }
//
// §18 BCK-6 names Socket.io as the library, whose whole value is doing this
// event-name multiplexing for you -- so rather than a raw `{type, ...}`
// envelope on a generic "message" listener, "subscribe" and each push event
// are Socket.io's own native event names, carrying just the `channel`/`data`
// payload the Bible's own examples show. This is a faithful, idiomatic
// implementation of the same contract, not a different one.
//
// Team-scoping the subscribe request (a client may only join the room for
// their own JWT's teamId) isn't spelled out in §10.6's example, but is a
// direct consequence of §19.1's security posture -- nothing here lets one
// team's browser session eavesdrop on another team's decision stream.

function socketPath(): string {
  return "/ws";
}

export function attachWebSocketServer(httpServer: HttpServer): SocketIOServer {
  const io = new SocketIOServer(httpServer, {
    path: socketPath(),
    cors: {
      origin: (origin, callback) => {
        if (!origin) {
          callback(null, true);
          return;
        }
        const allowed = corsAllowedOrigins.some((entry) => origin.startsWith(entry));
        callback(allowed ? null : new Error("Origin not allowed by CORS"), allowed);
      },
      credentials: true,
    },
  });

  io.use(async (socket, next) => {
    const token = socket.handshake.query["token"];
    if (typeof token !== "string" || !token) {
      next(new Error("UNAUTHORIZED"));
      return;
    }

    try {
      const auth = await authenticateWithJwt(token);
      socket.data["teamId"] = auth.teamId;
      next();
    } catch {
      next(new Error("UNAUTHORIZED"));
    }
  });

  io.on("connection", (socket: Socket) => {
    // Not part of §10.6's literal contract, but a small additive convenience:
    // the client needs its own teamId to construct the "team:{teamId}"
    // channel name for the "subscribe" message that follows, and the only
    // place that's ever resolved is server-side (from the JWT, in the auth
    // middleware above) -- this hands it back rather than requiring the
    // dashboard to separately fetch/decode it.
    socket.emit("connected", { teamId: socket.data["teamId"] });

    socket.on("subscribe", (payload: unknown) => {
      const channel = (payload as { channel?: unknown } | undefined)?.channel;
      if (typeof channel !== "string") return;

      const ownTeamChannel = `team:${socket.data["teamId"]}`;
      if (channel !== ownTeamChannel) {
        // Silently ignored, not an error response: §10.6 never contracts an
        // error frame for this, and acknowledging a rejected subscription
        // attempt would confirm to the client whether another team's
        // channel name is even well-formed.
        logger.warn(
          { teamId: socket.data["teamId"], requestedChannel: channel },
          "WebSocket client attempted to subscribe to another team's channel",
        );
        return;
      }

      void socket.join(ownTeamChannel);
    });
  });

  // Bible §9.2: this is the second consumer of `channel:team:{teamId}`
  // pub/sub (apps/slack-bot's team-alerts.ts is the first) -- one
  // connection, pattern-subscribed the same way, relaying each event to
  // whichever Socket.io room ("team:{teamId}") matches.
  const subscriber = new Redis(env.REDIS_URL);
  subscriber.psubscribe("channel:team:*", (err) => {
    if (err) logger.error({ err }, "WebSocket relay failed to subscribe to channel:team:*");
  });

  subscriber.on("pmessage", (_pattern: string, channel: string, message: string) => {
    const teamId = channel.slice("channel:team:".length);
    let event: TeamEvent;
    try {
      event = JSON.parse(message) as TeamEvent;
    } catch {
      return;
    }
    io.to(`team:${teamId}`).emit(event.type, event.data);
  });

  return io;
}
