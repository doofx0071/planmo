import { access, lstat, readdir, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { PathTraversalError, ProjectNotFoundError, UnsafeSymlinkError } from './errors.js';

/**
 * Safe project-root and path utilities (P03-01).
 *
 * Guarantees (see docs/08-security/secure-filesystem.md):
 * - every target path is contained inside the project root;
 * - normalization is applied before containment checks (no `..` tricks);
 * - symlinks are resolved and must not escape the root;
 * - containment checks are POSIX-compatible on Windows too (we use
 *   path.relative + a boundary sentinel — never string prefix matching).
 */

/**
 * Walks up from `startDir` until a directory containing `.planmo/` is found.
 * Returns the absolute, realpath-resolved root (neutralizes a symlinked
 * cwd). Throws ProjectNotFoundError when no root exists.
 */
export async function findProjectRoot(startDir: string): Promise<string> {
  let current = resolve(startDir);
  for (;;) {
    const marker = join(current, '.planmo');
    try {
      await access(marker);
      // Verify the .planmo dir is a real directory and not itself a symlink
      // escaping upward — an adversarial placement.
      const resolved = await realpath(current);
      return resolved;
    } catch {
      const parent = dirname(current);
      if (parent === current) {
        throw new ProjectNotFoundError(startDir);
      }
      current = parent;
    }
  }
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolves `target` against `root` and verifies the result stays inside root.
 * The containment check uses path.relative: a result at or below root yields
 * a relative path that neither starts with `..` nor is absolute.
 */
export function resolveInsideRoot(root: string, target: string): string {
  const absoluteRoot = resolve(root);
  const candidate = isAbsolute(target) ? resolve(target) : resolve(absoluteRoot, target);
  const rel = relative(absoluteRoot, candidate);
  if (rel === '') return absoluteRoot;
  if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new PathTraversalError(target, absoluteRoot);
  }
  return candidate;
}

/** True when `candidate` (absolute) is inside `root` (absolute). */
export function isInsideRoot(root: string, candidate: string): boolean {
  const rel = relative(resolve(root), resolve(candidate));
  return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel));
}

/**
 * Resolves every symlink in an existing absolute path and verifies the
 * physical target stays inside `root`. Applies to the deepest EXISTING
 * ancestor of a not-yet-written target.
 */
export async function realpathWithinRoot(root: string, absolutePath: string): Promise<string> {
  const physicalRoot = await realpath(root).catch(() => resolve(root));
  const physicalTarget = await realpath(absolutePath).catch(() => absolutePath);
  if (!isInsideRoot(physicalRoot, physicalTarget)) {
    throw new UnsafeSymlinkError(absolutePath, physicalTarget);
  }
  return physicalTarget;
}

/**
 * Guards a directory against symlink escape: every existing ancestor of
 * `dirPath` (from root down) must be a real directory, not a symlink whose
 * target escapes root. Returns the deepest existing real directory.
 */
export async function ensureNoSymlinkEscape(root: string, dirPath: string): Promise<string> {
  const absoluteRoot = resolve(root);
  const absoluteDir = isAbsolute(dirPath) ? resolve(dirPath) : resolve(absoluteRoot, dirPath);
  if (!isInsideRoot(absoluteRoot, absoluteDir)) {
    throw new PathTraversalError(dirPath, absoluteRoot);
  }

  // Walk from root down to the target, lstat-ing each segment.
  const rel = relative(absoluteRoot, absoluteDir);
  const segments = rel === '' ? [] : rel.split(sep);
  let current = absoluteRoot;
  for (const segment of segments) {
    current = join(current, segment);
    let stat;
    try {
      stat = await lstat(current);
    } catch {
      // Segment does not exist yet — everything from here on is new; the
      // remaining existing ancestors were checked before we got here.
      break;
    }
    if (stat.isSymbolicLink()) {
      const target = await realpath(current);
      if (!isInsideRoot(absoluteRoot, target)) {
        throw new UnsafeSymlinkError(current, target);
      }
    }
    if (!stat.isDirectory()) {
      // A file in the middle of a directory chain cannot be a write target
      // parent; the writer will surface the collision instead.
      break;
    }
  }
  return absoluteDir;
}

/**
 * Lists the entries of `dir` that are not directories (files and symlinks),
 * sorted deterministically. Used by the writer to detect collisions.
 */
export async function listFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() || e.isSymbolicLink())
    .map((e) => e.name)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/** Whether `p` exists as a file, directory, or symlink. */
export async function exists(p: string): Promise<boolean> {
  return pathExists(p);
}
