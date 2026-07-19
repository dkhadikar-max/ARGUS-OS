import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { api } from "../../../../lib/api-client";

// Bible §18 EXT-5 "Auth & Sync": the extension's sidebar can't run Clerk's
// OAuth flow inside a Manifest V3 service worker, so the handshake happens
// here instead -- ExtensionAuthSync.tsx (mounted on every dashboard page)
// calls this once signed in and relays the result to the extension via
// chrome.runtime.sendMessage. teamId isn't a JWT claim, so it's resolved the
// same way apps/dashboard's own Server Components already do: a normal
// authenticated call to GET /api/v1/teams/me.
export async function GET() {
  const { userId, getToken } = await auth();
  const token = await getToken();
  if (!userId || !token) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const team = await api.getTeam();
  return NextResponse.json({ token, userId, teamId: team.id });
}
