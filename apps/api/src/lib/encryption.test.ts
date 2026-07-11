import { describe, expect, it, vi, beforeEach } from "vitest";

beforeEach(() => {
  vi.resetModules();
});

describe("encrypt/decrypt — configured (CONFIG_ENCRYPTION_KEY set)", () => {
  it("round-trips a plaintext string", async () => {
    const { encrypt, decrypt } = await import("./encryption.js");
    const ciphertext = encrypt("xoxb-real-slack-token");
    expect(decrypt(ciphertext)).toBe("xoxb-real-slack-token");
  });

  it("produces different ciphertext for the same plaintext on each call (random IV)", async () => {
    const { encrypt } = await import("./encryption.js");
    expect(encrypt("same-value")).not.toBe(encrypt("same-value"));
  });

  it("throws instead of silently returning garbage when the ciphertext is tampered with (GCM auth tag)", async () => {
    const { encrypt, decrypt } = await import("./encryption.js");
    const ciphertext = encrypt("xoxb-real-slack-token");
    const tampered = Buffer.from(ciphertext, "base64");
    tampered[tampered.length - 1] = tampered[tampered.length - 1]! ^ 0xff;
    expect(() => decrypt(tampered.toString("base64"))).toThrow();
  });

  it("fails to decrypt with the wrong key", async () => {
    const { encrypt } = await import("./encryption.js");
    const ciphertext = encrypt("xoxb-real-slack-token");

    vi.resetModules();
    vi.doMock("../config/env.js", () => ({ env: { CONFIG_ENCRYPTION_KEY: "1".repeat(64) } }));
    const { decrypt: decryptWithDifferentKey } = await import("./encryption.js");

    expect(() => decryptWithDifferentKey(ciphertext)).toThrow();
  });
});

describe("encrypt/decrypt — not configured (no CONFIG_ENCRYPTION_KEY)", () => {
  beforeEach(() => {
    vi.doMock("../config/env.js", () => ({ env: { CONFIG_ENCRYPTION_KEY: undefined } }));
  });

  it("throws a clear error instead of silently storing/returning plaintext", async () => {
    const { encrypt, decrypt } = await import("./encryption.js");
    expect(() => encrypt("secret")).toThrow(/CONFIG_ENCRYPTION_KEY is not configured/);
    expect(() => decrypt("anything")).toThrow(/CONFIG_ENCRYPTION_KEY is not configured/);
  });
});
