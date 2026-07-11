import { describe, expect, it, vi, beforeEach } from "vitest";

type Handler = (...args: unknown[]) => unknown;

class FakeSocketIOServer {
  useFn: Handler | null = null;
  connectionFn: Handler | null = null;
  emitted: Array<{ room: string; event: string; data: unknown }> = [];

  use(fn: Handler) {
    this.useFn = fn;
  }

  on(event: string, fn: Handler) {
    if (event === "connection") this.connectionFn = fn;
  }

  to(room: string) {
    return {
      emit: (event: string, data: unknown) => {
        this.emitted.push({ room, event, data });
      },
    };
  }
}

let lastServerInstance: FakeSocketIOServer;
const ServerCtor = vi.fn(function (this: unknown) {
  lastServerInstance = new FakeSocketIOServer();
  return lastServerInstance;
});
vi.mock("socket.io", () => ({ Server: ServerCtor }));

class FakeRedis {
  handlers: Record<string, Handler> = {};
  psubscribe = vi.fn((_pattern: string, cb?: (err: Error | null) => void) => cb?.(null));
  on(event: string, fn: Handler) {
    this.handlers[event] = fn;
  }
}
let lastRedisInstance: FakeRedis;
const RedisCtor = vi.fn(function (this: unknown) {
  lastRedisInstance = new FakeRedis();
  return lastRedisInstance;
});
vi.mock("ioredis", () => ({ Redis: RedisCtor }));

const authenticateWithJwt = vi.fn();
vi.mock("../middleware/auth.js", () => ({ authenticateWithJwt }));

vi.mock("../config/env.js", () => ({
  env: { REDIS_URL: "redis://localhost:6379" },
  corsAllowedOrigins: ["chrome-extension://", "http://localhost:3000"],
}));

const logger = { warn: vi.fn(), error: vi.fn() };
vi.mock("./logger.js", () => ({ logger }));

const { attachWebSocketServer } = await import("./websocket.js");

beforeEach(() => {
  vi.clearAllMocks();
});

function makeSocket(teamId?: string) {
  const handlers: Record<string, Handler> = {};
  return {
    handshake: { query: { token: "jwt-token" } },
    data: teamId ? { teamId } : {},
    join: vi.fn(),
    emit: vi.fn(),
    on: (event: string, fn: Handler) => {
      handlers[event] = fn;
    },
    __handlers: handlers,
  };
}

describe("attachWebSocketServer — auth middleware", () => {
  it("rejects a connection with no token", async () => {
    attachWebSocketServer({} as never);
    const next = vi.fn();
    await lastServerInstance.useFn?.({ handshake: { query: {} } }, next);
    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(authenticateWithJwt).not.toHaveBeenCalled();
  });

  it("rejects a connection with an invalid token", async () => {
    authenticateWithJwt.mockRejectedValue(new Error("bad token"));
    attachWebSocketServer({} as never);
    const socket = { handshake: { query: { token: "bad" } }, data: {} };
    const next = vi.fn();
    await lastServerInstance.useFn?.(socket, next);
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });

  it("accepts a valid token and stores the resolved teamId on the socket", async () => {
    authenticateWithJwt.mockResolvedValue({ teamId: "team_1" });
    attachWebSocketServer({} as never);
    const socket = { handshake: { query: { token: "good" } }, data: {} as Record<string, unknown> };
    const next = vi.fn();
    await lastServerInstance.useFn?.(socket, next);
    expect(next).toHaveBeenCalledWith();
    expect(socket.data["teamId"]).toBe("team_1");
  });
});

describe("attachWebSocketServer — connection", () => {
  it("emits a 'connected' ack with the resolved teamId so the client can build its channel name", () => {
    attachWebSocketServer({} as never);
    const socket = makeSocket("team_1");
    lastServerInstance.connectionFn?.(socket);

    expect(socket.emit).toHaveBeenCalledWith("connected", { teamId: "team_1" });
  });
});

describe("attachWebSocketServer — subscribe", () => {
  it("joins the room matching the client's own team", () => {
    attachWebSocketServer({} as never);
    const socket = makeSocket("team_1");
    lastServerInstance.connectionFn?.(socket);

    socket.__handlers["subscribe"]?.({ channel: "team:team_1" });

    expect(socket.join).toHaveBeenCalledWith("team:team_1");
  });

  it("silently refuses to join another team's channel", () => {
    attachWebSocketServer({} as never);
    const socket = makeSocket("team_1");
    lastServerInstance.connectionFn?.(socket);

    socket.__handlers["subscribe"]?.({ channel: "team:team_2" });

    expect(socket.join).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalled();
  });

  it("ignores a malformed subscribe payload", () => {
    attachWebSocketServer({} as never);
    const socket = makeSocket("team_1");
    lastServerInstance.connectionFn?.(socket);

    socket.__handlers["subscribe"]?.({ channel: 12345 });

    expect(socket.join).not.toHaveBeenCalled();
  });
});

describe("attachWebSocketServer — Redis relay", () => {
  it("subscribes to channel:team:* on a dedicated Redis connection", () => {
    attachWebSocketServer({} as never);
    expect(lastRedisInstance.psubscribe).toHaveBeenCalledWith("channel:team:*", expect.any(Function));
  });

  it("relays a decision.created message to the matching team's room", () => {
    attachWebSocketServer({} as never);

    const payload = {
      type: "decision.created",
      data: { decisionId: "dec_1", teamId: "team_1", userId: "u1", prospectName: "Sarah Chen", verdict: "STRONG_YES", confidence: 94, timestamp: "2026-07-11T09:00:00Z" },
    };
    lastRedisInstance.handlers["pmessage"]?.("channel:team:*", "channel:team:team_1", JSON.stringify(payload));

    expect(lastServerInstance.emitted).toEqual([
      { room: "team:team_1", event: "decision.created", data: payload.data },
    ]);
  });

  it("ignores an unparseable message instead of throwing", () => {
    attachWebSocketServer({} as never);
    expect(() =>
      lastRedisInstance.handlers["pmessage"]?.("channel:team:*", "channel:team:team_1", "not json"),
    ).not.toThrow();
    expect(lastServerInstance.emitted).toEqual([]);
  });
});
