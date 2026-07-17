import type { NextFunction, Request, Response } from "express";
import { Webhook } from "standardwebhooks";
import { AppError, type CreateCheckoutRequest } from "@argus/shared";
import { env } from "../../config/env.js";
import { createCheckoutSession, handleDodoWebhookEvent } from "./billing.service.js";

export async function createCheckoutHandler(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.auth) throw new AppError("UNAUTHORIZED", "Authentication required");
    const body = req.body as CreateCheckoutRequest;
    const result = await createCheckoutSession(req.auth, body);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

/**
 * Verifies the Standard Webhooks signature Dodo signs every delivery with --
 * same spec Clerk's svix-based webhookHandler already verifies (see
 * webhook.controller.ts), different library (`standardwebhooks`) and header
 * names (webhook-id/-timestamp/-signature vs Clerk's svix-id/etc). Requires
 * the RAW request body, which is why this route is registered on
 * webhookRouter (mounted with express.raw(), before app.ts's app-wide
 * express.json()) rather than billingRouter.
 */
export async function dodoWebhookHandler(req: Request, res: Response, next: NextFunction) {
  try {
    if (!env.DODO_WEBHOOK_KEY) {
      throw new AppError("FORBIDDEN", "Dodo webhooks are not configured on this server");
    }

    const webhookId = req.header("webhook-id");
    const webhookTimestamp = req.header("webhook-timestamp");
    const webhookSignature = req.header("webhook-signature");
    if (!webhookId || !webhookTimestamp || !webhookSignature) {
      throw new AppError("UNAUTHORIZED", "Missing webhook signature headers");
    }

    const webhook = new Webhook(env.DODO_WEBHOOK_KEY);
    let event: { type: string; data: unknown };
    try {
      event = webhook.verify(req.body as Buffer, {
        "webhook-id": webhookId,
        "webhook-timestamp": webhookTimestamp,
        "webhook-signature": webhookSignature,
      }) as { type: string; data: unknown };
    } catch {
      throw new AppError("UNAUTHORIZED", "Invalid webhook signature");
    }

    await handleDodoWebhookEvent(event.type, event.data);
    res.status(200).json({ received: true });
  } catch (err) {
    next(err);
  }
}
