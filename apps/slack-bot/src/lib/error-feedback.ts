export type Respond = (msg: { response_type: "ephemeral"; text: string } | { response_type: "ephemeral"; blocks: unknown }) => Promise<unknown>;

/** Every action/command handler already calls ack() first (Slack requires
 *  it within 3 seconds), so a failure afterward can't be reported by *not*
 *  acking -- it has to be a follow-up ephemeral message instead. Without
 *  this wrapper, a thrown/rejected API call left the rep thinking their
 *  click or command worked (Slack already shows the interaction as
 *  handled) with no indication anything failed. `respond` itself is also
 *  wrapped in a no-op catch: if Slack's own response_url has expired,
 *  there's nothing more to tell the user. */
export async function withErrorFeedback(
  respond: Respond,
  action: string,
  fn: () => Promise<void>,
): Promise<void> {
  try {
    await fn();
  } catch (err) {
    console.error(`ARGUS Slack "${action}" failed`, err);
    await respond({
      response_type: "ephemeral",
      text: "Something went wrong handling that -- please try again.",
    }).catch(() => undefined);
  }
}
