import type { Lease, LeaseManager, TimeProvider } from './contracts.js';

/**
 * Claims + leases (P08-07, CHG-001).
 *
 * One active (non-expired) lease per task: `claim` rejects any lease on a
 * task that already has an active lease. Expired claims stay observable via
 * `expired`/`all` until explicitly released — nothing is auto-reclaimed or
 * auto-removed; the caller decides. PURE: all time comes from the injected
 * TimeProvider (never `Date.now()`), every emitted array is sorted, and
 * returned arrays are copies (the manager never leaks internal state).
 */

/** Lease ordering: (taskId, acquiredAt), ties broken by claimant. */
function byTaskThenAcquired(a: Lease, b: Lease): number {
  if (a.taskId !== b.taskId) return a.taskId < b.taskId ? -1 : 1;
  return byAcquiredThenClaimant(a, b);
}

/** Lease ordering: (acquiredAt), ties broken by claimant. */
function byAcquiredThenClaimant(a: Lease, b: Lease): number {
  if (a.acquiredAt !== b.acquiredAt) return a.acquiredAt - b.acquiredAt;
  return a.claimant < b.claimant ? -1 : a.claimant > b.claimant ? 1 : 0;
}

export function leaseManager(now: TimeProvider): LeaseManager {
  const leases: Lease[] = [];

  function claim(lease: Lease): { ok: true; lease: Lease } | { ok: false; reason: string } {
    // Snapshot the clock once: the whole operation uses one "now".
    const t = now();
    const blocking = leases.find((l) => l.taskId === lease.taskId && l.expiresAt > t);
    if (blocking) {
      return {
        ok: false,
        reason: `task "${lease.taskId}" already has an active lease by "${blocking.claimant}"`,
      };
    }
    leases.push(lease);
    return { ok: true, lease };
  }

  function release(taskId: string, claimant: string): Lease | undefined {
    const index = leases.findIndex((l) => l.taskId === taskId && l.claimant === claimant);
    if (index === -1) return undefined;
    const [removed] = leases.splice(index, 1);
    return removed;
  }

  function activeFor(taskId: string): readonly Lease[] {
    const t = now();
    return leases
      .filter((l) => l.taskId === taskId && l.expiresAt > t)
      .slice()
      .sort(byAcquiredThenClaimant);
  }

  function expired(taskId: string): readonly Lease[] {
    const t = now();
    return leases
      .filter((l) => l.taskId === taskId && l.expiresAt <= t)
      .slice()
      .sort(byAcquiredThenClaimant);
  }

  function all(): readonly Lease[] {
    return leases.slice().sort(byTaskThenAcquired);
  }

  return { claim, release, activeFor, expired, all };
}
