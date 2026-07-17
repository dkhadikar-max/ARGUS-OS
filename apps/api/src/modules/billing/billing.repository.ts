import { prisma } from "@argus/database";
import type { BillingStatus, PlanTier } from "@argus/database";

export function getTeam(teamId: string) {
  return prisma.team.findUnique({ where: { id: teamId } });
}

export function getUserEmail(userId: string) {
  return prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
}

export function findTeamBySubscriptionId(subscriptionId: string) {
  return prisma.team.findFirst({ where: { dodoSubscriptionId: subscriptionId } });
}

/** subscription.active / subscription.renewed -- the only writes that ever
 *  set plan + billingStatus + the two Dodo ids together, so a team can never
 *  end up with one populated and not the others. */
export function activateSubscription(
  teamId: string,
  data: { plan: PlanTier; customerId: string; subscriptionId: string },
) {
  return prisma.team.update({
    where: { id: teamId },
    data: {
      plan: data.plan,
      billingStatus: "ACTIVE",
      dodoCustomerId: data.customerId,
      dodoSubscriptionId: data.subscriptionId,
    },
  });
}

export function setBillingStatus(teamId: string, status: BillingStatus) {
  return prisma.team.update({ where: { id: teamId }, data: { billingStatus: status } });
}

/** subscription.cancelled / subscription.expired -- the team keeps using
 *  the product but loses paid-tier access, same as any PLG downgrade. */
export function downgradeToFree(teamId: string) {
  return prisma.team.update({
    where: { id: teamId },
    data: { plan: "FREE", billingStatus: "CANCELLED" },
  });
}
