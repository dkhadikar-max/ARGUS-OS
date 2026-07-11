import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { env } from "../config/env.js";

// Bible §18 INF-4 "Data encryption at rest" (P1) — apps/api/src/modules/
// integrations/integration.repository.ts stores a real Slack bot OAuth
// token and a generated API key in Integration.config, previously as
// plaintext JSON. AES-256-GCM (authenticated encryption, not just
// confidentiality — GCM's tag also detects tampering) via Node's built-in
// crypto module, so no new dependency for this.
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // NIST-recommended IV length for GCM
const AUTH_TAG_LENGTH = 16;

function getKey(): Buffer {
  if (!env.CONFIG_ENCRYPTION_KEY) {
    throw new Error(
      "CONFIG_ENCRYPTION_KEY is not configured — required to encrypt/decrypt Integration secrets",
    );
  }
  return Buffer.from(env.CONFIG_ENCRYPTION_KEY, "hex");
}

/** Returns a single base64 string: iv || authTag || ciphertext. */
export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]).toString("base64");
}

/** Throws if the key is wrong or the value was tampered with (GCM's own
 *  auth-tag verification, not a separate check this code has to do). */
export function decrypt(encoded: string): string {
  const key = getKey();
  const raw = Buffer.from(encoded, "base64");
  const iv = raw.subarray(0, IV_LENGTH);
  const authTag = raw.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = raw.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
