import { logger } from "../../lib/logger.js";
import {
  createUserWithPersonalTeam,
  findUserById,
  updateUserFromClerk,
  type ClerkUserData,
} from "./webhook.repository.js";

interface ClerkUserPayload {
  id: string;
  email_addresses: Array<{ id: string; email_address: string }>;
  primary_email_address_id: string | null;
  first_name: string | null;
  last_name: string | null;
  image_url: string | null;
}

function extractUserData(payload: ClerkUserPayload): ClerkUserData {
  const primaryEmail =
    payload.email_addresses.find((e) => e.id === payload.primary_email_address_id) ??
    payload.email_addresses[0];

  if (!primaryEmail) {
    throw new Error(`Clerk user ${payload.id} has no email address`);
  }

  const name = [payload.first_name, payload.last_name].filter(Boolean).join(" ") || undefined;

  return {
    id: payload.id,
    email: primaryEmail.email_address,
    name,
    avatarUrl: payload.image_url ?? undefined,
  };
}

export async function handleClerkWebhookEvent(
  eventType: string,
  data: unknown,
): Promise<void> {
  switch (eventType) {
    case "user.created": {
      const userData = extractUserData(data as ClerkUserPayload);
      const existing = await findUserById(userData.id);
      if (existing) {
        logger.warn({ userId: userData.id }, "user.created for a user that already exists — skipping");
        return;
      }
      await createUserWithPersonalTeam(userData);
      logger.info({ userId: userData.id }, "Provisioned User + personal Team from Clerk webhook");
      return;
    }

    case "user.updated": {
      const userData = extractUserData(data as ClerkUserPayload);
      const existing = await findUserById(userData.id);
      if (!existing) {
        // Bible has no documented "late webhook before first sign-in"
        // scenario; provisioning here too keeps the system self-healing
        // rather than silently dropping the update.
        await createUserWithPersonalTeam(userData);
        return;
      }
      await updateUserFromClerk(userData.id, userData);
      return;
    }

    case "user.deleted": {
      // Bible §16.1 Risk #7 (GDPR/data privacy) is an explicit, not-yet-
      // built item. Hard-deleting here would also violate the Decision/
      // Outcome/MessageDraft foreign keys against this user (none of
      // those relations cascade-delete — see schema.prisma), so a real
      // implementation needs an anonymization strategy, not a bare
      // `prisma.user.delete`. Logging rather than silently no-op-ing so
      // this doesn't get forgotten.
      logger.warn(
        { data },
        "Clerk user.deleted received but not yet implemented — requires a GDPR-safe anonymization strategy (Bible §16.1 Risk #7)",
      );
      return;
    }

    default:
      logger.debug({ eventType }, "Unhandled Clerk webhook event type");
  }
}
