import { describe, expect, it, vi, beforeEach } from "vitest";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

const { postSlackMessage } = await import("./slack-client.js");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("postSlackMessage", () => {
  it("posts to chat.postMessage with the bot token as a Bearer header", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({ ok: true }) });

    await postSlackMessage("xoxb-token", "C123", "hello team");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://slack.com/api/chat.postMessage",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer xoxb-token" }),
        body: JSON.stringify({ channel: "C123", text: "hello team" }),
      }),
    );
  });

  // Rate limiting is the one documented Slack exception that returns a
  // genuine non-200 HTTP status (429) instead of ok:false in the body.
  it("throws when the HTTP request itself fails (e.g. rate limited)", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 429, json: () => Promise.resolve({}) });
    await expect(postSlackMessage("xoxb-token", "C123", "hi")).rejects.toThrow("HTTP status 429");
  });

  it("throws when Slack returns HTTP 200 but ok: false in the body (e.g. channel_not_found)", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ ok: false, error: "channel_not_found" }),
    });
    await expect(postSlackMessage("xoxb-token", "C_bad", "hi")).rejects.toThrow("channel_not_found");
  });
});
