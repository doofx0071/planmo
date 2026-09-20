import type {
  GeneratedArtifact,
  GenerationManifestEntry,
  SynthChange,
  SynthPreview,
} from './contracts.js';

/**
 * Safe generation/upgrade preview (P05-08 / CHG-001).
 *
 * A PURE report function: it never touches the filesystem, never writes,
 * and never crosses the project root — it only compares in-memory lists
 * (the artifact plan, the paths reported as existing on disk, and the
 * entries of the previous `.planmo/manifest.json`). `compile.ts` feeds it
 * fs-derived data; the semantics themselves depend on no fs at all, so the
 * module stays testable offline.
 *
 * Ownership semantics follow ADR-0016 — for each proposed artifact:
 *   - generated:  overwrite when the path exists AND was previously
 *                 manifest-managed; create when missing; a file that exists
 *                 but is not manifest-managed is a collision (unmanaged
 *                 content is never silently overwritten).
 *   - merged:     merge into the existing file when the manifest lists it;
 *                 create when missing; collision when the existing file is
 *                 not manifest-managed.
 *   - seeded:     created once by PlanMo; afterwards the user owns it, so
 *                 an existing file is skipped and only a missing one is
 *                 created.
 *   - user:       never written — always skipped.
 * Legacy manifest modes `managed`/`merge` are treated as the pre-CHG-001
 * aliases of `generated`/`merged`. A manifest entry whose ownershipMode is
 * `user` marks the path as user-owned even though it is recorded, so a
 * generated/merged artifact targeting it is a collision.
 *
 * Determinism: artifacts are ordered by (path, ownership, content) — a
 * total order — and one change is emitted per path (first in that order
 * wins for a duplicate-path input), so identical inputs always produce an
 * identical, path-sorted preview regardless of input array order.
 */
export function previewSynth(
  artifacts: readonly GeneratedArtifact[],
  existing: {
    /** Paths that already exist on disk. */
    existingPaths: readonly string[];
    /** Existing manifest entries (from .planmo/manifest.json), if any. */
    entries?: readonly GenerationManifestEntry[];
  },
): SynthPreview {
  const existingPaths = new Set(existing.existingPaths.map(normalizeSlashes));
  const entries = existing.entries ?? [];
  // Paths recorded anywhere in the manifest.
  const manifestPaths = new Set(entries.map((entry) => normalizeSlashes(entry.path)));
  // Paths the manifest records as PlanMo-owned (a `user` entry means the
  // user owns the file, so it is recorded but NOT PlanMo-managed).
  const managedPaths = new Set(
    entries
      .filter((entry) => entry.ownershipMode !== 'user')
      .map((entry) => normalizeSlashes(entry.path)),
  );

  const changes: SynthChange[] = [];
  const claimedPaths = new Set<string>();

  for (const artifact of [...artifacts].sort(compareArtifacts)) {
    // Duplicate artifact paths are a renderer anomaly; one deterministic
    // change per path keeps the preview total and unambiguous.
    if (claimedPaths.has(artifact.path)) continue;
    claimedPaths.add(artifact.path);

    const existsOnDisk = existingPaths.has(artifact.path);
    const userOwnedPerManifest =
      manifestPaths.has(artifact.path) && !managedPaths.has(artifact.path);

    changes.push({
      path: artifact.path,
      ...classify(
        artifact.ownership,
        existsOnDisk,
        userOwnedPerManifest,
        managedPaths.has(artifact.path),
      ),
    });
  }

  const safe = changes.every((change) => change.action !== 'collision');
  const summary = changes.map((change) => `${change.action} ${change.path}: ${change.reason}`);

  return { changes, safe, summary };
}

function classify(
  ownership: GeneratedArtifact['ownership'],
  existsOnDisk: boolean,
  userOwnedPerManifest: boolean,
  manifestManaged: boolean,
): { action: SynthChange['action']; ownership: GeneratedArtifact['ownership']; reason: string } {
  switch (ownership) {
    case 'generated':
    case 'managed': {
      // Legacy `managed` is a pre-CHG-001 alias of `generated` (whole file).
      if (!existsOnDisk) return { action: 'create', ownership, reason: REASON_CREATE };
      if (manifestManaged) return { action: 'overwrite', ownership, reason: REASON_OVERWRITE };
      return {
        action: 'collision',
        ownership,
        reason: userOwnedPerManifest ? REASON_COLLISION_USER_MANIFEST : REASON_COLLISION_UNMANAGED,
      };
    }
    case 'merged':
    case 'merge': {
      // Legacy `merge` is a pre-CHG-001 alias of `merged` (marker sections).
      if (!existsOnDisk) return { action: 'create', ownership, reason: REASON_CREATE };
      if (manifestManaged) return { action: 'merge', ownership, reason: REASON_MERGE };
      return {
        action: 'collision',
        ownership,
        reason: userOwnedPerManifest ? REASON_COLLISION_USER_MANIFEST : REASON_COLLISION_UNMANAGED,
      };
    }
    case 'seeded': {
      // PlanMo created the initial file, then the user owns it.
      if (!existsOnDisk) return { action: 'create', ownership, reason: REASON_CREATE };
      return { action: 'skip', ownership, reason: REASON_SKIP_SEEDED };
    }
    case 'user': {
      // PlanMo never writes user artifacts, missing or not.
      return { action: 'skip', ownership, reason: REASON_SKIP_USER };
    }
  }
}

const REASON_CREATE = 'missing on disk — will be created';
const REASON_OVERWRITE = 'manifest-managed — safe to overwrite';
const REASON_MERGE = 'manifest-managed — sections will be re-merged';
const REASON_SKIP_SEEDED = 'seeded — user owns the file after first creation';
const REASON_SKIP_USER = 'user-owned, not modified';
const REASON_COLLISION_UNMANAGED = 'unmanaged file — not overwriting';
const REASON_COLLISION_USER_MANIFEST = 'user-owned per manifest — not overwriting';

/** Total order over artifacts so duplicate-path inputs stay deterministic. */
function compareArtifacts(a: GeneratedArtifact, b: GeneratedArtifact): number {
  if (a.path !== b.path) return a.path < b.path ? -1 : 1;
  if (a.ownership !== b.ownership) return a.ownership < b.ownership ? -1 : 1;
  if (a.content !== b.content) return a.content < b.content ? -1 : 1;
  return 0;
}

/**
 * Normalize Windows separators so existing-path/entry comparisons hold
 * regardless of how the caller enumerated the disk. Artifact paths are
 * canonical (forward slashes) and are used verbatim.
 */
function normalizeSlashes(path: string): string {
  return path.replace(/\\/g, '/');
}
