import { describe, expect, it, vi, beforeEach } from "vitest";

const repo = {
  findUserById: vi.fn(),
  createUserWithPersonalTeam: vi.fn(),
  updateUserFromClerk: vi.fn(),
};
vi.mock("./webhook.repository.js", () => repo);

const { handleClerkWebhookEvent } = await import("./webhook.service.js");

function clerkUserPayload(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "user_clerk_123",
    email_addresses: [{ id: "idn_1", email_address: "alex@example.com" }],
    primary_email_address_id: "idn_1",
    first_name: "Alex",
    last_name: "Rivera",
    image_url: "https://img.clerk.com/alex.png",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("handleClerkWebhookEvent — user.created", () => {
  it("provisions a User + personal Team for a brand new Clerk user", async () => {
    repo.findUserById.mockResolvedValue(null);

    await handleClerkWebhookEvent("user.created", clerkUserPayload());

    expect(repo.createUserWithPersonalTeam).toHaveBeenCalledWith({
      id: "user_clerk_123",
      email: "alex@example.com",
      name: "Alex Rivera",
      avatarUrl: "https://img.clerk.com/alex.png",
    });
  });

  it("skips provisioning if the user already exists (duplicate webhook delivery)", async () => {
    repo.findUserById.mockResolvedValue({ id: "user_clerk_123" });

    await handleClerkWebhookEvent("user.created", clerkUserPayload());

    expect(repo.createUserWithPersonalTeam).not.toHaveBeenCalled();
  });

  it("throws if Clerk sends a user with no email address", async () => {
    repo.findUserById.mockResolvedValue(null);

    await expect(
      handleClerkWebhookEvent(
        "user.created",
        clerkUserPayload({ email_addresses: [], primary_email_address_id: null }),
      ),
    ).rejects.toThrow(/no email address/);
  });
});

describe("handleClerkWebhookEvent — user.updated", () => {
  it("updates an existing user's profile fields", async () => {
    repo.findUserById.mockResolvedValue({ id: "user_clerk_123" });

    await handleClerkWebhookEvent("user.updated", clerkUserPayload({ first_name: "Alexandra" }));

    expect(repo.updateUserFromClerk).toHaveBeenCalledWith(
      "user_clerk_123",
      expect.objectContaining({ name: "Alexandra Rivera" }),
    );
  });

  it("self-heals by provisioning if an update arrives before user.created", async () => {
    repo.findUserById.mockResolvedValue(null);

    await handleClerkWebhookEvent("user.updated", clerkUserPayload());

    expect(repo.createUserWithPersonalTeam).toHaveBeenCalled();
    expect(repo.updateUserFromClerk).not.toHaveBeenCalled();
  });
});

describe("handleClerkWebhookEvent — user.deleted", () => {
  it("does not touch the repository (not yet GDPR-safe to implement)", async () => {
    await handleClerkWebhookEvent("user.deleted", { id: "user_clerk_123" });

    expect(repo.findUserById).not.toHaveBeenCalled();
    expect(repo.createUserWithPersonalTeam).not.toHaveBeenCalled();
    expect(repo.updateUserFromClerk).not.toHaveBeenCalled();
  });
});

describe("handleClerkWebhookEvent — unhandled event types", () => {
  it("does not throw for event types ARGUS doesn't act on", async () => {
    await expect(handleClerkWebhookEvent("organization.created", {})).resolves.toBeUndefined();
  });
});
