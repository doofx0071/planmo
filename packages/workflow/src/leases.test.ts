import { describe, expect, it } from 'vitest';
import type { Lease } from './contracts.js';
import { leaseManager } from './leases.js';

const lease = (over: Partial<Lease> = {}): Lease => ({
  claimant: 'worker-a',
  taskId: 'P08-07',
  acquiredAt: 1000,
  expiresAt: 2000,
  branch: 'feat/phase-08',
  paths: ['packages/workflow/src/leases.ts'],
  ...over,
});

describe('leaseManager (P08-07)', () => {
  it('claims a lease and reports it in all()', () => {
    const manager = leaseManager(() => 1500);
    const l = lease();
    const result = manager.claim(l);
    expect(result).toEqual({ ok: true, lease: l });
    expect(manager.all()).toEqual([l]);
  });

  it('rejects a second ACTIVE lease on the same task, naming claimant', () => {
    const manager = leaseManager(() => 1500);
    expect(manager.claim(lease({ claimant: 'worker-a' })).ok).toBe(true);
    const result = manager.claim(lease({ claimant: 'worker-b', acquiredAt: 1600 }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/P08-07/);
      expect(result.reason).toMatch(/worker-a/);
    }
    expect(manager.all()).toHaveLength(1);
  });

  it('rejects a second active lease even from the same claimant', () => {
    const manager = leaseManager(() => 1500);
    expect(manager.claim(lease()).ok).toBe(true);
    expect(manager.claim(lease({ acquiredAt: 1600 })).ok).toBe(false);
  });

  it('allows an active lease on a different task', () => {
    const manager = leaseManager(() => 1500);
    expect(manager.claim(lease()).ok).toBe(true);
    expect(manager.claim(lease({ taskId: 'P08-06' })).ok).toBe(true);
  });

  it('allows re-claiming a task once the previous lease has expired', () => {
    let t = 1500;
    const manager = leaseManager(() => t);
    expect(manager.claim(lease({ acquiredAt: 1000, expiresAt: 2000 })).ok).toBe(true);
    t = 2500; // past the first lease's expiration
    const reclaim = manager.claim(lease({ acquiredAt: 2500, expiresAt: 9999 }));
    expect(reclaim.ok).toBe(true);
    if (reclaim.ok) {
      expect(manager.activeFor('P08-07')).toHaveLength(1);
      expect(manager.activeFor('P08-07')[0]?.acquiredAt).toBe(2500);
    }
    expect(manager.expired('P08-07').map((l) => l.acquiredAt)).toEqual([1000]);
  });

  it('activeFor: expiresAt === now is expired, strictly later is active', () => {
    let t = 1500;
    const manager = leaseManager(() => t);
    expect(manager.claim(lease({ acquiredAt: 1500, expiresAt: 2000 })).ok).toBe(true);
    expect(manager.activeFor('P08-07')).toHaveLength(1);
    t = 1999;
    expect(manager.activeFor('P08-07')).toHaveLength(1);
    t = 2000; // exact boundary: lease is expired, a fresh claim is possible
    expect(manager.activeFor('P08-07')).toEqual([]);
    expect(manager.expired('P08-07')).toHaveLength(1);
    expect(manager.claim(lease({ acquiredAt: 2000, expiresAt: 9999 })).ok).toBe(true);
    expect(manager.activeFor('P08-07')[0]?.acquiredAt).toBe(2000);
  });

  it('activeFor filters per-task when several leases coexist', () => {
    const manager = leaseManager(() => 2000);
    manager.claim(lease({ taskId: 'P08-07', claimant: 'a', expiresAt: 9999 }));
    manager.claim(lease({ taskId: 'P08-06', claimant: 'b', expiresAt: 1500 })); // expired
    expect(manager.activeFor('P08-07').map((l) => l.claimant)).toEqual(['a']);
    expect(manager.activeFor('P08-06')).toEqual([]);
  });

  it('expired returns only expired leases, expiry boundary included', () => {
    const manager = leaseManager(() => 2000);
    expect(manager.claim(lease({ claimant: 'a', acquiredAt: 1000, expiresAt: 2000 })).ok).toBe(
      true,
    );
    expect(manager.claim(lease({ claimant: 'b', acquiredAt: 1100, expiresAt: 2001 })).ok).toBe(
      true,
    );
    const expired = manager.expired('P08-07');
    expect(expired.map((l) => l.claimant)).toEqual(['a']);
  });

  it('expired is a query: nothing is auto-removed or auto-reclaimed', () => {
    let t = 1000;
    const manager = leaseManager(() => t);
    expect(manager.claim(lease({ acquiredAt: 1000, expiresAt: 1500 })).ok).toBe(true);
    t = 2000;
    expect(manager.expired('P08-07')).toHaveLength(1);
    // The expired lease is still in all() until explicitly released.
    expect(manager.all()).toHaveLength(1);
    expect(manager.activeFor('P08-07')).toEqual([]);
  });

  it('expired sorts a task lease history by acquiredAt', () => {
    let t = 1000;
    const manager = leaseManager(() => t);
    manager.claim(lease({ acquiredAt: 1000, expiresAt: 1500 }));
    t = 2000;
    manager.claim(lease({ acquiredAt: 2000, expiresAt: 2500 }));
    t = 3000;
    manager.claim(lease({ acquiredAt: 3000, expiresAt: 3500 }));
    t = 3500;
    expect(manager.expired('P08-07').map((l) => l.acquiredAt)).toEqual([1000, 2000, 3000]);
  });

  it('release removes exactly the matching (taskId, claimant) lease', () => {
    const manager = leaseManager(() => 1500);
    const mine = lease({ claimant: 'worker-a' });
    const theirs = lease({ claimant: 'worker-b', taskId: 'P08-06' });
    manager.claim(mine);
    manager.claim(theirs);
    expect(manager.release('P08-06', 'worker-a')).toBeUndefined();
    expect(manager.release('P08-06', 'worker-b')).toEqual(theirs);
    expect(manager.release('P08-06', 'worker-b')).toBeUndefined();
    expect(manager.all()).toEqual([mine]);
  });

  it('all() is sorted by (taskId, acquiredAt)', () => {
    let t = 1500;
    const manager = leaseManager(() => t);
    manager.claim(lease({ taskId: 'P08-09', claimant: 'x', acquiredAt: 500, expiresAt: 9999 }));
    manager.claim(lease({ taskId: 'P08-06', claimant: 'a', acquiredAt: 700, expiresAt: 9999 }));
    manager.claim(lease({ taskId: 'P08-07', claimant: 'c', acquiredAt: 600, expiresAt: 1600 }));
    t = 1700; // P08-07:c expired -> a later lease on the same task is claimable
    manager.claim(lease({ taskId: 'P08-07', claimant: 'b', acquiredAt: 700, expiresAt: 9999 }));
    expect(manager.all().map((l) => `${l.taskId}:${l.claimant}`)).toEqual([
      'P08-06:a',
      'P08-07:c',
      'P08-07:b',
      'P08-09:x',
    ]);
  });

  it('returned arrays are copies: mutation cannot corrupt internal state', () => {
    const manager = leaseManager(() => 1500);
    manager.claim(lease());
    const view = manager.all() as Lease[];
    view.length = 0;
    expect(manager.all()).toHaveLength(1);
  });

  it('uses the injected clock, never the process clock', () => {
    let t = 1000;
    const manager = leaseManager(() => t);
    manager.claim(lease({ acquiredAt: 1000, expiresAt: 2000 }));
    expect(manager.activeFor('P08-07')).toHaveLength(1);
    t = 2500;
    expect(manager.activeFor('P08-07')).toEqual([]);
    expect(manager.expired('P08-07')).toHaveLength(1);
  });

  it('is deterministic for an identical call sequence on a fixed clock', () => {
    const run = () => {
      const manager = leaseManager(() => 1500);
      manager.claim(lease({ claimant: 'a', taskId: 'T-1' }));
      manager.claim(lease({ claimant: 'b', taskId: 'T-2' }));
      manager.release('T-1', 'a');
      return manager.all().map((l) => l.taskId);
    };
    expect(run()).toEqual(run());
  });

  it('reports empty state for unknown tasks', () => {
    const manager = leaseManager(() => 1500);
    expect(manager.activeFor('nope')).toEqual([]);
    expect(manager.expired('nope')).toEqual([]);
    expect(manager.all()).toEqual([]);
  });
});
