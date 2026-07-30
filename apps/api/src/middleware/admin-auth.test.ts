import { describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import type { AuthContext } from "./auth.js";

const env = { ADMIN_EMAILS: "" };
vi.mock("../config/env.js", () => ({ env }));

const { requireAdmin } = await import("./admin-auth.js");

function mockReq(auth?: AuthContext): Request {
  return { auth } as unknown as Request;
}

function authWithEmail(email: string | undefined): AuthContext {
  return { type: "user", userId: "u1", email, teamId: "team_1", planTier: "FREE" };
}

describe("requireAdmin", () => {
  it("rejects with FORBIDDEN when ADMIN_EMAILS isn't configured", () => {
    env.ADMIN_EMAILS = "";
    const next = vi.fn();
    requireAdmin(mockReq(authWithEmail("dev@argus.dev")), {} as Response, next);
    expect(next.mock.calls[0]?.[0]).toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects with FORBIDDEN when req.auth.email is undefined (e.g. a bare team-scoped API key)", () => {
    env.ADMIN_EMAILS = "dev@argus.dev";
    const next = vi.fn();
    requireAdmin(mockReq(authWithEmail(undefined)), {} as Response, next);
    expect(next.mock.calls[0]?.[0]).toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects with FORBIDDEN when req.auth is entirely missing", () => {
    env.ADMIN_EMAILS = "dev@argus.dev";
    const next = vi.fn();
    requireAdmin(mockReq(undefined), {} as Response, next);
    expect(next.mock.calls[0]?.[0]).toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects an email not in the allowlist with FORBIDDEN", () => {
    env.ADMIN_EMAILS = "dev@argus.dev";
    const next = vi.fn();
    requireAdmin(mockReq(authWithEmail("someone-else@dataflow.io")), {} as Response, next);
    expect(next.mock.calls[0]?.[0]).toMatchObject({ code: "FORBIDDEN" });
  });

  it("passes through on an exact allowlist match", () => {
    env.ADMIN_EMAILS = "dev@argus.dev";
    const next = vi.fn();
    requireAdmin(mockReq(authWithEmail("dev@argus.dev")), {} as Response, next);
    expect(next).toHaveBeenCalledWith();
  });

  it("passes through when the match differs only in case", () => {
    env.ADMIN_EMAILS = "Dev@Argus.dev";
    const next = vi.fn();
    requireAdmin(mockReq(authWithEmail("dev@argus.dev")), {} as Response, next);
    expect(next).toHaveBeenCalledWith();
  });

  it("passes through with whitespace around allowlist entries", () => {
    env.ADMIN_EMAILS = " dev@argus.dev , ops@argus.dev ";
    const next = vi.fn();
    requireAdmin(mockReq(authWithEmail("ops@argus.dev")), {} as Response, next);
    expect(next).toHaveBeenCalledWith();
  });
});
