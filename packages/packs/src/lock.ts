import { LockfileSchema, type LockfileDocument } from '@planmo/schema';
import type { LoadedPack } from './loader.js';
import type { ResolutionResult } from './resolve.js';

/**
 * Lockfile generation (P04-03).
 *
 * Emits a strict `.planmo/lock.yml` document (LockfileSchema) pinning every
 * resolved pack's ref, version, source, and sha256 integrity — the exit gate
 * "resolved pack versions/checksums are locked". Deterministic: the same
 * resolution always yields the same lock.
 */

export const PLANMO_CURRENT_VERSION = '0.0.0';

/**
 * Build a lockfile document from a resolution result.
 * Only packs that actually resolved (present in result.packs) are locked;
 * the lock always reflects the deterministic resolution, never a best effort.
 */
export function buildLockfile(result: ResolutionResult): LockfileDocument {
  const lock = LockfileSchema.parse({
    schemaVersion: 1,
    planmoVersion: PLANMO_CURRENT_VERSION,
    packs: result.packs.map((pack: LoadedPack) => ({
      ref: pack.document.ref,
      name: pack.document.name,
      version: pack.document.version,
      source: 'local',
      integrity: { algorithm: 'sha256', digest: pack.integritySha256 },
    })),
    adapters: [],
  });
  // Re-parse through the schema to guarantee the emitted document is valid.
  return LockfileSchema.parse(lock);
}

/**
 * Deterministic lockfile fingerprint — the canonical proof that two
 * resolutions produced the same locked set (in lock order).
 */
export function lockfileFingerprint(lock: LockfileDocument): string {
  return lock.packs.map((p) => `${p.ref}@${p.version}#${p.integrity?.digest ?? 'none'}`).join(';');
}
