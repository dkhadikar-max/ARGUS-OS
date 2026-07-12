import { randomBytes } from "node:crypto";
import { Prisma, prisma } from "@argus/database";
import { slugify } from "../../lib/slugify.js";

export interface ClerkUserData {
  id: string;
  email: string;
  name?: string | undefined;
  avatarUrl?: string | undefined;
}

/**
 * Bible has no onboarding wireframe for "create your team" — the object
 * model (§5.2) just assumes a User belongs to a Team. Auto-provisioning a
 * personal FREE-tier team on first sign-in is the standard solo-signup
 * pattern and matches the Founder Sam persona (§4.3), who signs up alone
 * and invites teammates later.
 */
export async function findUserById(id: string) {
  return prisma.user.findUnique({ where: { id } });
}

export async function createUserWithPersonalTeam(data: ClerkUserData) {
  const base = slugify(data.email.split("@")[0] ?? "team");

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const slug = attempt === 0 ? base : `${base}-${randomBytes(3).toString("hex")}`;
    try {
      return await prisma.$transaction(async (tx) => {
        const team = await tx.team.create({
          data: { name: data.name ? `${data.name}'s Team` : "My Team", slug, plan: "FREE" },
        });
        return tx.user.create({
          data: {
            id: data.id,
            email: data.email,
            name: data.name,
            avatarUrl: data.avatarUrl,
            teamId: team.id,
          },
        });
      });
    } catch (err) {
      // P2002 = unique constraint violation on Team.slug — retry with a
      // randomized suffix rather than failing the whole webhook delivery.
      const isSlugCollision =
        err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
      if (!isSlugCollision || attempt === 4) throw err;
    }
  }
  throw new Error("Unreachable: exhausted slug collision retries");
}

export async function updateUserFromClerk(id: string, data: Partial<ClerkUserData>) {
  return prisma.user.update({
    where: { id },
    data: { email: data.email, name: data.name, avatarUrl: data.avatarUrl },
  });
}
