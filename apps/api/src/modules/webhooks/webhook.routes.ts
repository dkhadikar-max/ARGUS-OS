import express, { Router } from "express";
import { clerkWebhookHandler } from "./webhook.controller.js";

export const webhookRouter = Router();

// express.raw() here (not the app-wide express.json() from app.ts) —
// Svix signature verification needs the exact bytes Clerk sent.
webhookRouter.post(
  "/clerk",
  express.raw({ type: "application/json" }),
  clerkWebhookHandler,
);
