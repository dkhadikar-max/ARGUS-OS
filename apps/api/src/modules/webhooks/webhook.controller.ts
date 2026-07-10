import type { NextFunction, Request, Response } from "express";
import { Webhook } from "svix";
import { AppError } from "@argus/shared";
import { env } from "../../config/env.js";
import { handleClerkWebhookEvent } from "./webhook.service.js";

/**
 * Verifies the Svix signature Clerk signs every webhook delivery with.
 * Requires the RAW request body (see webhook.routes.ts mounting this route
 * with express.raw() instead of the app-wide express.json()) — signature
 * verification breaks silently if the body has been re-serialized by a
 * JSON body parser first.
 */
export async function clerkWebhookHandler(req: Request, res: Response, next: NextFunction) {
  try {
    if (!env.CLERK_WEBHOOK_SECRET) {
      throw new AppError("FORBIDDEN", "Clerk webhooks are not configured on this server");
    }

    const svixId = req.header("svix-id");
    const svixTimestamp = req.header("svix-timestamp");
    const svixSignature = req.header("svix-signature");
    if (!svixId || !svixTimestamp || !svixSignature) {
      throw new AppError("UNAUTHORIZED", "Missing Svix signature headers");
    }

    const webhook = new Webhook(env.CLERK_WEBHOOK_SECRET);
    let event: { type: string; data: unknown };
    try {
      event = webhook.verify(req.body as Buffer, {
        "svix-id": svixId,
        "svix-timestamp": svixTimestamp,
        "svix-signature": svixSignature,
      }) as { type: string; data: unknown };
    } catch {
      throw new AppError("UNAUTHORIZED", "Invalid Svix signature");
    }

    await handleClerkWebhookEvent(event.type, event.data);
    res.status(200).json({ received: true });
  } catch (err) {
    next(err);
  }
}
