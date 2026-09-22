/**
 * Install/update planning, lock integrity verification, and resolution→lock
 * construction (P11-03 checksums/pinning/reversibility).
 *
 * Contract boundary: every function here is deterministic and plan-only.
 * Nothing is mutated and no external I/O happens except the explicit
 * `readContent` read injected into verifyLockIntegrity.
 */
import {
  LockfileSchema,
  type LockfileDocument,
  type PackLockEntry,
  type TrustLevel,
} from '@planmo/schema';
import { packIntegrity, type LoadedPack } from './loader.js';
import { buildLockfile } from './lock.js';
import { type InstallDiffRow, type InstallPlan } from './phase11-contracts.js';
import type { ResolutionResult } from './resolve.js';

/**
 * Trust level assigned to a resolved pack in the lock (frozen P11-03 rule):
 * `builtin` for local sources (provenance absent or `local`), `third-party`
 * for registry/git sources. The finer-grained classifier (Worker A, P11-01)
 * owns review burden; the lock records the coarse classification.
 */
function trustLevelForLock(pack: LoadedPack): TrustLevel {
  const source = pack.document.provenance?.source;
  return source === 'registry' || source === 'git' ? 'third-party' : 'builtin';
}

/** Deterministic {version, integrity} snapshot of one lock entry. */
function snapshotOf(entry: PackLockEntry): { version: string; integrity?: string } {
  const digest = entry.integrity?.digest;
  return digest === undefined
    ? { version: entry.version }
    : { version: entry.version, integrity: digest };
}

/**
 * Diff two lockfiles into a reversible install/update plan (P11-03).
 *
 * One row per pack ref across both locks (sorted by ref). A pack is
 * `updated` when its version OR its integrity digest changes — a content
 * drift under the same version is never silent. The rendered diff contains
 * only changed rows, unified-ish and sorted by ref:
 *
 *   +ref@v          added
 *   -ref@v          removed
 *   ~ref@v1 => v2   updated
 *
 * The plan never mutates anything, so it is always reversible in v1.
 * Duplicate refs inside one lock: the last entry wins (deterministic).
 */
export function planLockDiff(from: LockfileDocument | null, to: LockfileDocument): InstallPlan {
  const fromByRef = new Map<string, PackLockEntry>();
  for (const entry of from?.packs ?? []) {
    fromByRef.set(entry.ref, entry);
  }
  const toByRef = new Map<string, PackLockEntry>();
  for (const entry of to.packs) {
    toByRef.set(entry.ref, entry);
  }

  const refs = [...new Set([...fromByRef.keys(), ...toByRef.keys()])].sort();

  const rows: InstallDiffRow[] = refs.map((ref): InstallDiffRow => {
    const prev = fromByRef.get(ref);
    const next = toByRef.get(ref);
    if (prev === undefined && next !== undefined) {
      return { ref, action: 'added', to: snapshotOf(next) };
    }
    if (prev !== undefined && next === undefined) {
      return { ref, action: 'removed', from: snapshotOf(prev) };
    }
    if (prev !== undefined && next !== undefined) {
      const changed =
        prev.version !== next.version ||
        (prev.integrity?.digest ?? null) !== (next.integrity?.digest ?? null);
      return changed
        ? { ref, action: 'updated', from: snapshotOf(prev), to: snapshotOf(next) }
        : { ref, action: 'unchanged', from: snapshotOf(prev), to: snapshotOf(next) };
    }
    // Unreachable: `refs` is the union of both lockfiles' pack refs.
    throw new Error(`impossible: ref ${ref} present in neither lockfile`);
  });

  const diffLines = rows
    .filter((row) => row.action !== 'unchanged')
    .map((row) => {
      switch (row.action) {
        case 'added':
          return `+${row.ref}@${row.to!.version}`;
        case 'removed':
          return `-${row.ref}@${row.from!.version}`;
        default:
          return `~${row.ref}@${row.from!.version} => ${row.to!.version}`;
      }
    });

  return { rows, reversible: true, diff: diffLines.join('\n') };
}

/**
 * Verify every lock entry's integrity against actual resolved content (P11-03).
 *
 * Entries WITH a recorded digest are re-hashed (sha256 of the raw content)
 * and compared; any mismatch is reported as `ref@version: integrity mismatch`.
 * Entries without a digest pass — the lock asserts nothing for them, so there
 * is nothing to verify here (absence handling is the trust layer's concern).
 * Failures are returned in deterministic (ref, version) order regardless of
 * lock order. readContent errors propagate: they are I/O failures, not
 * integrity failures, and the caller owns how to present them.
 */
export async function verifyLockIntegrity(
  lock: LockfileDocument,
  readContent: (entry: PackLockEntry) => Promise<string>,
): Promise<{ ok: boolean; failures: readonly string[] }> {
  const sorted = [...lock.packs].sort((a, b) => {
    if (a.ref !== b.ref) return a.ref < b.ref ? -1 : 1;
    if (a.version !== b.version) return a.version < b.version ? -1 : 1;
    return 0;
  });

  const failures: string[] = [];
  for (const entry of sorted) {
    if (entry.integrity === undefined) {
      continue;
    }
    const actual = await readContent(entry);
    if (packIntegrity(actual) !== entry.integrity.digest) {
      failures.push(`${entry.ref}@${entry.version}: integrity mismatch`);
    }
  }
  return { ok: failures.length === 0, failures };
}

/**
 * Build the "next" lock for resolved refs from a deterministic resolution
 * (P11-03). Reuses buildLockfile (frozen P04-03) and adds the per-entry
 * `trustLevel` the schema already supports (`builtin` for local sources,
 * `third-party` for registry/git). Deterministic: the same resolution always
 * yields the same lock.
 */
export function lockFromResolution(
  result: ResolutionResult,
  planmoVersion: string,
): LockfileDocument {
  const base = buildLockfile(result);

  const trustByRef = new Map<string, TrustLevel>();
  for (const pack of result.packs) {
    trustByRef.set(pack.document.ref, trustLevelForLock(pack));
  }

  const packs: PackLockEntry[] = base.packs.map((entry) => ({
    ...entry,
    trustLevel: trustByRef.get(entry.ref) ?? 'builtin',
  }));

  // Re-parse through the schema so the emitted document is guaranteed valid.
  return LockfileSchema.parse({ ...base, planmoVersion, packs });
}
