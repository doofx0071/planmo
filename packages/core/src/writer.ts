import { createHash, randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { unifiedDiff } from './diff.js';
import { FileCollisionError } from './errors.js';
import {
  ensureNoSymlinkEscape,
  exists,
  isInsideRoot,
  realpathWithinRoot,
  resolveInsideRoot,
} from './paths.js';

/**
 * Managed file writer (P03-02) — the ONLY path through which generated
 * artifacts are written (docs/08-security/secure-filesystem.md).
 *
 * Hard guarantees:
 *  1. Root containment — every target resolves inside the project root;
 *     `..` and absolute-escape attempts throw PathTraversalError.
 *  2. Symlink safety — existing symlinked ancestors must resolve inside the
 *     root (UnsafeSymlinkError otherwise); broken symlinks are never
 *     followed (BrokenSymlinkError). init never creates symlinks that could
 *     escape later writes (it only creates files and real dirs).
 *  3. No silent overwrite — an existing UNMANAGED file at a target path is
 *     a collision (FileCollisionError unless allowOverwrite). Overwrites
 *     require the prior content to be input to the plan (diff), and the
 *     write mode to explicitly allow it.
 *  4. Atomicity — content is staged to a temp file in the target directory
 *     then renamed into place; a failed/interrupted write never leaves a
 *     half-written artifact.
 *  5. Determinism + traceability — every planned write records a sha256
 *     checksum of its content; dry-run produces the exact diff that apply
 *     will perform, and records it.
 *  6. Never writes outside the plan — apply() performs exactly the writes
 *     the plan named.
 *
 * Directory structure: init/createDir creates `.planmo/` plus any content
 * dirs declared by the caller; it never chases symlinks while creating
 * them.
 */

export interface PlannedWrite {
  /** Path relative to the project root (forward slashes). */
  path: string;
  content: string;
}

export interface PlanEntry {
  relPath: string;
  absPath: string;
  content: string;
  checksum: string;
  /** true when the target already existed at plan time. */
  existing: boolean;
}

export interface ChangePlan {
  root: string;
  entries: PlanEntry[];
  collisions: string[]; // relPaths that exist and would NOT be overwritten
  diff: string; // accumulated unified diff for overwrites ('' for new files)
}

export interface ApplyResult {
  written: string[]; // relPaths actually written/verified
  collisions: string[]; // relPaths refused
  checksums: Record<string, string>; // relPath -> sha256 (of written content)
  diff: string;
}

export interface ManagedWriterOptions {
  /** Directories to ensure exist before writing (relative to root). */
  contentDirs?: string[];
  /** Collision policy applied at both plan() and apply() time. */
  allowOverwrite?: boolean;
}

export class ManagedWriter {
  constructor(
    readonly root: string,
    private readonly options: ManagedWriterOptions = {},
  ) {}

  /** Create a directory inside root (real dir, never via symlink). */
  async createDir(relDir: string): Promise<void> {
    const abs = resolveInsideRoot(this.root, relDir);
    await ensureNoSymlinkEscape(this.root, dirname(abs));
    await mkdir(abs, { recursive: true });
  }

  /** Ensure the contentDirs from options exist. */
  async ensureContentDirs(): Promise<void> {
    for (const dir of this.options.contentDirs ?? []) {
      await this.createDir(dir);
    }
  }

  /**
   * Plans a batch of writes: containment + symlink checks + collision
   * detection + checksums + diff. PURE — no filesystem side effects, so
   * dry-run stays genuinely dry and plan() is safe to call repeatedly.
   */
  async plan(
    writes: PlannedWrite[],
    options: { allowOverwrite?: boolean } = {},
  ): Promise<ChangePlan> {
    const root = resolve(this.root);
    const allowOverwrite = options.allowOverwrite ?? this.options.allowOverwrite ?? false;

    const entries: PlanEntry[] = [];
    const collisions: string[] = [];
    let diff = '';

    for (const write of writes) {
      // 1. Containment (rejects `..`, absolute escapes).
      const abs = resolveInsideRoot(root, write.path);

      // 2. Symlink safety for the parent chain of the target.
      await ensureNoSymlinkEscape(root, dirname(abs));

      // 3. Target state.
      const targetExists = await exists(abs);
      if (targetExists) {
        // realpathWithinRoot throws UnsafeSymlinkError when the (possibly
        // symlinked) target resolves outside the root.
        await realpathWithinRoot(root, abs);
        if (!allowOverwrite) {
          collisions.push(write.path);
          continue;
        }
      }

      // 4. Checksum for traceability (manifest generation later phases).
      const checksum = createHash('sha256').update(write.content, 'utf8').digest('hex');

      // 5. Full plan entry (content carried so apply() stays pure and
      //    atomic).
      entries.push({
        relPath: write.path,
        absPath: abs,
        content: write.content,
        checksum,
        existing: targetExists,
      });

      // 6. Diff preview — only meaningful when an existing file is replaced.
      if (targetExists && allowOverwrite) {
        const before = await readFile(abs, 'utf8');
        diff += unifiedDiff(write.path, before, write.content);
      }
    }

    return { root, entries, collisions, diff };
  }

  /**
   * Applies a plan atomically. In dry-run mode nothing touches disk beyond
   * the plan's own directory creation — the result mirrors the exact bytes
   * apply() would land.
   */
  async apply(
    plan: ChangePlan,
    options: { dryRun?: boolean; allowOverwrite?: boolean } = {},
  ): Promise<ApplyResult> {
    const dryRun = options.dryRun ?? false;
    const allowOverwrite = options.allowOverwrite ?? this.options.allowOverwrite ?? false;

    if (dryRun) {
      return {
        written: plan.entries.map((e) => e.relPath),
        collisions: [...plan.collisions],
        checksums: Object.fromEntries(plan.entries.map((e) => [e.relPath, e.checksum])),
        diff: plan.diff,
      };
    }

    // Real writes only: ensure parent dirs exist now (dry-run stays pure).
    await this.ensureContentDirs();

    const written: string[] = [];
    const collisions = [...plan.collisions];
    const checksums: Record<string, string> = {};

    for (const entry of plan.entries) {
      await ensureNoSymlinkEscape(plan.root, dirname(entry.absPath));

      // TOCTOU re-check: the file may have appeared since plan() ran.
      if (await exists(entry.absPath)) {
        if (!allowOverwrite) {
          collisions.push(entry.relPath);
          continue;
        }
        await realpathWithinRoot(plan.root, entry.absPath);
      }

      // Atomic: temp file in the same dir, then rename over target.
      const tmp = join(dirname(entry.absPath), `.planmo-tmp-${randomBytes(6).toString('hex')}`);
      await writeFile(tmp, entry.content, 'utf8');
      try {
        await rename(tmp, entry.absPath);
      } catch (err) {
        await rm(tmp, { force: true });
        throw err;
      }
      written.push(entry.relPath);
      checksums[entry.relPath] = entry.checksum;
    }

    return { written, collisions, checksums, diff: plan.diff };
  }

  /** Verify a root does not contain a symlinked .planmo escape. */
  async verifyRoot(): Promise<boolean> {
    await ensureNoSymlinkEscape(this.root, this.root);
    return true;
  }
}

/** Convenience: single-shot safe write. */
export async function writeManaged(
  root: string,
  writes: PlannedWrite[],
  options: ManagedWriterOptions & { dryRun?: boolean } = {},
): Promise<ApplyResult> {
  const writer = new ManagedWriter(root, options);
  const plan = await writer.plan(writes, options);
  return writer.apply(plan, options);
}
