import { describe, expect, it, vi, beforeEach } from "vitest";

const getToken = vi.fn();
const auth = vi.fn().mockResolvedValue({ getToken });
vi.mock("@clerk/nextjs/server", () => ({ auth }));

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

const { api, ApiError, isForbiddenError } = await import("./api-client.js");

function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) };
}

function nonJsonResponse(status: number) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.reject(new SyntaxError("Unexpected token")),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getToken.mockResolvedValue("real-jwt");
});

describe("apiFetch (via api.getQueue)", () => {
  it("throws ApiError when there's no Clerk session token", async () => {
    getToken.mockResolvedValue(null);
    await expect(api.getQueue()).rejects.toThrow(ApiError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends the token as a Bearer header and returns the parsed JSON body on success", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { items: [] }));

    const result = await api.getQueue();

    expect(result).toEqual({ items: [] });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:4000/api/v1/queue",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer real-jwt" }),
      }),
    );
  });

  it("throws ApiError with the server's message when the error body parses as JSON", async () => {
    fetchMock.mockResolvedValue(jsonResponse(422, { error: { message: "Invalid queue request" } }));
    await expect(api.getQueue()).rejects.toThrow("Invalid queue request");
  });

  it("throws a status-based ApiError when the error body has no error.message shape", async () => {
    fetchMock.mockResolvedValue(jsonResponse(500, { unexpected: "shape" }));
    await expect(api.getQueue()).rejects.toThrow("Request failed with status 500");
  });

  // A proxy/platform returning an HTML error page for a 502/503 is a real
  // infra scenario -- response.json() rejecting must not throw a raw
  // SyntaxError out of apiFetch (the exact bug the earlier full-codebase
  // audit found and fixed here).
  it("degrades a non-JSON error body to a clear ApiError instead of a raw SyntaxError", async () => {
    fetchMock.mockResolvedValue(nonJsonResponse(502));
    await expect(api.getQueue()).rejects.toThrow("Request failed with status 502");
    await expect(api.getQueue()).rejects.toBeInstanceOf(ApiError);
  });

  it("throws a distinct ApiError for a non-JSON body on an otherwise-ok response", async () => {
    fetchMock.mockResolvedValue(nonJsonResponse(200));
    await expect(api.getQueue()).rejects.toThrow("Response was not valid JSON");
  });
});

describe("ApiError.status / isForbiddenError", () => {
  it("sets status from the response on a parsed JSON error body", async () => {
    fetchMock.mockResolvedValue(jsonResponse(403, { error: { message: "Admin access required" } }));
    await expect(api.getQueue()).rejects.toMatchObject({ status: 403 });
  });

  it("sets status from the response on a non-JSON error body", async () => {
    fetchMock.mockResolvedValue(nonJsonResponse(502));
    await expect(api.getQueue()).rejects.toMatchObject({ status: 502 });
  });

  it("leaves status undefined for the no-token throw (a real 401-equivalent, not a 403)", async () => {
    getToken.mockResolvedValue(null);
    try {
      await api.getQueue();
      throw new Error("expected api.getQueue() to reject");
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as InstanceType<typeof ApiError>).status).toBeUndefined();
      expect(isForbiddenError(err)).toBe(false);
    }
  });

  it("isForbiddenError is true only for a real 403 ApiError", async () => {
    fetchMock.mockResolvedValue(jsonResponse(403, { error: { message: "Admin access required" } }));
    try {
      await api.getQueue();
      throw new Error("expected api.getQueue() to reject");
    } catch (err) {
      expect(isForbiddenError(err)).toBe(true);
    }
  });

  it("isForbiddenError is false for a 500 ApiError and for a non-ApiError value", async () => {
    fetchMock.mockResolvedValue(jsonResponse(500, { unexpected: "shape" }));
    try {
      await api.getQueue();
      throw new Error("expected api.getQueue() to reject");
    } catch (err) {
      expect(isForbiddenError(err)).toBe(false);
    }
    expect(isForbiddenError(new Error("plain error"))).toBe(false);
    expect(isForbiddenError(null)).toBe(false);
  });
});

describe("api.getShadowDecisions", () => {
  it("defaults limit/offset and omits optional filters when not provided", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { data: [], pagination: { total: 0, limit: 20, offset: 0, hasMore: false } }));
    await api.getShadowDecisions();
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:4000/api/v1/admin/shadow-decisions?limit=20&offset=0",
      expect.anything(),
    );
  });

  it("includes provided filters in the query string", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { data: [], pagination: { total: 0, limit: 10, offset: 5, hasMore: false } }));
    await api.getShadowDecisions({ teamId: "team_1", verdict: "PASS", verdictAgreement: false, limit: 10, offset: 5 });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:4000/api/v1/admin/shadow-decisions?teamId=team_1&verdict=PASS&verdictAgreement=false&limit=10&offset=5",
      expect.anything(),
    );
  });

  it("propagates a 403 ApiError from a non-admin caller", async () => {
    fetchMock.mockResolvedValue(jsonResponse(403, { error: { message: "Admin access required" } }));
    await expect(api.getShadowDecisions()).rejects.toMatchObject({ status: 403 });
  });
});

describe("api.getShadowDecisionDetail", () => {
  it("fetches the single-row detail endpoint by id", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { id: "sd_1" }));
    await api.getShadowDecisionDetail("sd_1");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:4000/api/v1/admin/shadow-decisions/sd_1",
      expect.anything(),
    );
  });
});

describe("api.getOutcomes", () => {
  it("omits userId from the query string when not provided", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, {}));
    await api.getOutcomes();
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:4000/api/v1/outcomes?limit=20&offset=0",
      expect.anything(),
    );
  });

  it("includes userId in the query string when provided (Bible §4.4 rep filter)", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, {}));
    await api.getOutcomes({ userId: "user_1" });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:4000/api/v1/outcomes?limit=20&offset=0&userId=user_1",
      expect.anything(),
    );
  });
});
