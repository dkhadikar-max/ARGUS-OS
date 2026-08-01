// Gate 3 Increment 1.5 -- process-local concurrency cap for shadow
// evaluate() runs. Node is single-threaded and there is no `await` between
// the check and the increment below, so this is race-free within one
// process.
//
// Known limitation, stated honestly: this is a PER-PROCESS cap. If apps/api
// ever runs as multiple instances/pods, effective global shadow concurrency
// is SHADOW_MAX_CONCURRENT x instance_count, not a strict global cap. A true
// cross-instance limiter needs shared state (Redis or similar) and is out of
// scope for this increment.

let inFlight = 0;

export function tryAcquireShadowSlot(maxConcurrent: number): boolean {
  if (inFlight >= maxConcurrent) return false;
  inFlight += 1;
  return true;
}

export function releaseShadowSlot(): void {
  inFlight = Math.max(0, inFlight - 1);
}

// Gate 3 Increment 1.9 -- Shadow Health Dashboard's "In-flight shadow
// runs" field. Same per-process-only caveat as the rest of this module.
export function getShadowInFlightCount(): number {
  return inFlight;
}

// Test-only escape hatch -- shadow-runner.service.test.ts runs many it()s
// against this same module-level counter; without a reset, a slot leaked by
// one test (an assertion throwing before release) would corrupt every
// subsequent test's concurrency arithmetic.
export function __resetShadowConcurrencyForTests(): void {
  inFlight = 0;
}
