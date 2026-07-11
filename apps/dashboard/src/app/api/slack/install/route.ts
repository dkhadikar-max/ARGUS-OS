import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import type { SlackInstallResponse } from "@argus/shared";
import { env } from "../../../../lib/env";

// Bible §18 SLK-1 "Add to Slack". A thin server-side redirector: the actual
// OAuth-URL construction and admin-role check live in apps/api (single
// source of truth, shared with any other future client), which this Route
// Handler calls the same way apps/dashboard/src/lib/api-client.ts does
// elsewhere — the signed-in rep's own Clerk session token as the Bearer
// credential, never exposed to the browser.
export async function GET(request: NextRequest) {
  const { getToken } = await auth();
  const token = await getToken();
  if (!token) {
    return NextResponse.redirect(new URL("/sign-in", request.url));
  }

  const response = await fetch(`${env.API_BASE_URL}/api/v1/integrations/slack/install`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  if (!response.ok) {
    return NextResponse.redirect(new URL("/queue?slack=error", request.url));
  }

  const body = (await response.json()) as SlackInstallResponse;
  return NextResponse.redirect(body.url);
}
