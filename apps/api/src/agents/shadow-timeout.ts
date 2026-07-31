export class ShadowTimeoutError extends Error {
  constructor() {
    super("Shadow Runner: evaluate() exceeded SHADOW_TIMEOUT_MS");
    this.name = "ShadowTimeoutError";
  }
}

// Gate 3 Increment 1.5 -- bounds how long a caller waits for `promise`.
// Does NOT cancel whatever the promise is doing -- no AbortSignal plumbing
// exists anywhere in the callAgent/ClaudeProvider chain, and adding one is
// real scope creep, not done here. If the timeout wins the race, `promise`
// keeps running in the background:
//   - a late SUCCESS is discarded silently (never resolves/rejects anything
//     further) -- avoids an out-of-band, stale result for whatever the
//     caller already moved on from.
//   - a late REJECTION is swallowed here, not left unhandled -- same class
//     of guard decision.service.ts's own outer .catch() already applies to
//     runShadowDecision itself; an unawaited, uncaught rejected promise is
//     a Node unhandledRejection, which can crash the process.
export function raceWithTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new ShadowTimeoutError());
    }, timeoutMs);

    promise.then(
      (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}
