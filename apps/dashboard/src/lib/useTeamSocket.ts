"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { io } from "socket.io-client";
import { env } from "./env";

// Bible §10.6 WebSocket API: wss://.../ws?token={jwt}, client sends
// {"type":"subscribe","channel":"team:{teamId}"} and receives
// decision.created/outcome.logged pushes. apps/api's lib/websocket.ts also
// emits a "connected" ack carrying the JWT-resolved teamId (not in §10.6's
// literal example, but needed here since the browser has no other way to
// know its own ARGUS teamId before constructing the channel name).
export interface LiveDecisionEvent {
  decisionId: string;
  userId: string;
  prospectName: string;
  verdict: string;
  confidence: number;
  timestamp: string;
}

export interface LiveOutcomeEvent {
  decisionId: string;
  userId: string;
  outcomeType: string;
  timestamp: string;
}

export type LiveTeamEvent =
  | { type: "decision.created"; data: LiveDecisionEvent }
  | { type: "outcome.logged"; data: LiveOutcomeEvent };

/** Connects once per mount, tears down on unmount. Returns the most recent
 *  live events (newest first), capped so a quiet page doesn't grow forever. */
export function useTeamSocket(maxEvents = 5): LiveTeamEvent[] {
  const { getToken, isSignedIn } = useAuth();
  const [events, setEvents] = useState<LiveTeamEvent[]>([]);

  useEffect(() => {
    if (!isSignedIn) return;
    let cancelled = false;

    const socketPromise = getToken().then((token) => {
      if (cancelled || !token) return null;

      const socket = io(env.NEXT_PUBLIC_API_BASE_URL, {
        path: "/ws",
        query: { token },
      });

      socket.on("connected", ({ teamId }: { teamId: string }) => {
        socket.emit("subscribe", { channel: `team:${teamId}` });
      });

      socket.on("decision.created", (data: LiveDecisionEvent) => {
        const event: LiveTeamEvent = { type: "decision.created", data };
        setEvents((prev) => [event, ...prev].slice(0, maxEvents));
      });

      socket.on("outcome.logged", (data: LiveOutcomeEvent) => {
        const event: LiveTeamEvent = { type: "outcome.logged", data };
        setEvents((prev) => [event, ...prev].slice(0, maxEvents));
      });

      return socket;
    });

    return () => {
      cancelled = true;
      void socketPromise.then((socket) => socket?.disconnect());
    };
  }, [getToken, isSignedIn, maxEvents]);

  return events;
}
