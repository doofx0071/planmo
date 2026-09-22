import { symlink } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PathTraversalError, UnsafeSymlinkError } from './errors.js';
import {
  ensureNoSymlinkEscape,
  isInsideRoot,
  realpathWithinRoot,
  resolveInsideRoot,
} from './paths.js';
import { tempDir, tempRoot, tempWrite } from './test-utils.js';

/**
 * Property / fuzz tests for path safety (P12-02, P-PATH).
 *
 * Properties under test (docs/09-testing/property-and-fuzz.md — Path safety,
 * docs/08-security/secure-filesystem.md):
 * - P-PATH-1  Arbitrary targets either resolve inside root or are rejected
 *             with PathTraversalError — never a path outside root, never an
 *             unrelated error, never a partial result.
 * - P-PATH-2  Traversal and escape constructions (..  climbs, absolute paths
 *             outside root) are always rejected; benign normalizations pass.
 * - P-PATH-3  Symlink escapes are rejected by ensureNoSymlinkEscape /
 *             realpathWithinRoot with UnsafeSymlinkError; in-root symlinks
 *             pass. Failed link creation (e.g. no privilege on Windows)
 *             skips rather than fails.
 * All randomness is seeded (mulberry32, fixed seeds); the harness itself is
 * deterministic (same seed → same corpus).
 */

/** Deterministic 32-bit PRNG (mulberry32). Fixed seeds only. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rnd: () => number, items: readonly T[]): T {
  return items[Math.floor(rnd() * items.length)] as T;
}

const SAFE_SEGMENTS = ['a', 'b', 'docs', 'src', 'file', 'x1', 'planmo', 'data', '.hidden', 'test'];

function describePathCall(root: string, target: string): string {
  try {
    const result = resolveInsideRoot(root, target);
    return `ok:${result}`;
  } catch (err) {
    return err instanceof Error ? `err:${err.name}` : 'err:unknown';
  }
}

/**
 * Generate a harmless relative target. Depth-tracked so every `..` is matched
 * by an earlier real segment — the normalized path can never climb past root.
 */
function genSafeTarget(rnd: () => number): string {
  let depth = 0;
  const parts: string[] = [];
  const n = 1 + Math.floor(rnd() * 6);
  for (let i = 0; i < n; i += 1) {
    const roll = rnd();
    if (roll < 0.2) {
      parts.push('.'); // harmless: normalizes away
    } else if (roll < 0.35 && depth > 0) {
      parts.push('..');
      depth -= 1;
    } else {
      parts.push(pick(rnd, SAFE_SEGMENTS));
      depth += 1;
    }
  }
  const sepChar = rnd() < 0.25 ? '\\' : '/';
  return parts.join(sepChar);
}

/** Generate a guaranteed escape: enough leading `..` climbs past root. */
function genEscapeTarget(rnd: () => number): string {
  const climbs = 1 + Math.floor(rnd() * 4);
  const parts: string[] = [];
  for (let i = 0; i < climbs; i += 1) parts.push('..');
  parts.push('x');
  return parts.join(sep);
}

describe('P-PATH-1 arbitrary targets resolve inside root or throw PathTraversalError', () => {
  it('120 seeded safe-target iterations: always an inside-root result', () => {
    const rnd = mulberry32(0x5eed);
    const root = resolve('/proj');
    for (let i = 0; i < 120; i += 1) {
      const target = genSafeTarget(rnd);
      let result: string;
      try {
        result = resolveInsideRoot(root, target);
      } catch (err) {
        throw new Error(`safe target rejected: ${target} (${(err as Error).name})`);
      }
      expect(isInsideRoot(root, result), `iter ${i}: ${target} -> ${result}`).toBe(true);
      const rel = relative(root, result);
      expect(rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel))).toBe(
        true,
      );
    }
  });

  it('80 seeded escape iterations: always PathTraversalError, never anything else', () => {
    const rnd = mulberry32(0xe5ca);
    const root = resolve('/proj');
    for (let i = 0; i < 80; i += 1) {
      const target = genEscapeTarget(rnd);
      try {
        const result = resolveInsideRoot(root, target);
        throw new Error(`escape accepted: ${target} -> ${result}`);
      } catch (err) {
        expect(err).toBeInstanceOf(PathTraversalError);
      }
    }
  });

  it('the seeded corpus is reproducible (fixed seed → identical outcomes)', () => {
    const a = Array.from({ length: 50 }, (_, i) =>
      describePathCall('/proj', genSafeTarget(mulberry32(0xbeef))),
    );
    const b = Array.from({ length: 50 }, (_, i) =>
      describePathCall('/proj', genSafeTarget(mulberry32(0xbeef))),
    );
    expect(b).toEqual(a);
  });
});

describe('P-PATH-2 traversal and escaping constructions (table)', () => {
  const root = '/proj';
  const cases: { target: string; expectEscape: boolean }[] = [
    { target: 'a.md', expectEscape: false },
    { target: './a.md', expectEscape: false },
    { target: 'docs/../docs/a.md', expectEscape: false },
    { target: 'a/..', expectEscape: false },
    { target: 'sub/../sub/../sub', expectEscape: false },
    { target: '..', expectEscape: true },
    { target: '../..', expectEscape: true },
    { target: '../etc/passwd', expectEscape: true },
    { target: 'a/../../etc/passwd', expectEscape: true },
    { target: 'a/b/../../../x', expectEscape: true },
    { target: 'a/..%2f..%2fetc', expectEscape: false }, // URL-encoding is NOT decoded by the resolver
  ];
  for (const c of cases) {
    it(`${c.expectEscape ? 'rejects' : 'resolves'} ${JSON.stringify(c.target)}`, () => {
      if (c.expectEscape) {
        expect(() => resolveInsideRoot(root, c.target)).toThrow(PathTraversalError);
      } else {
        const result = resolveInsideRoot(root, c.target);
        expect(isInsideRoot(root, result)).toBe(true);
      }
    });
  }

  it('absolute paths outside root are rejected on every platform; inside-root absolutes pass', () => {
    const outside = isAbsolute('/etc/passwd') ? '/etc/passwd' : 'C:\\Windows\\system32\\x';
    const inside = isAbsolute('/proj/x') ? '/proj/x' : 'C:\\proj\\x';
    expect(() => resolveInsideRoot('/proj', outside)).toThrow(PathTraversalError);
    if (isInsideRoot(resolve('/proj'), resolve(inside))) {
      expect(resolveInsideRoot('/proj', inside)).toBe(resolve(inside));
    }
  });

  it('sibling-root prefix attacks are rejected (no string-prefix containment)', () => {
    expect(() => resolveInsideRoot('/proj', '/proj-other/x')).toThrow(PathTraversalError);
  });
});

describe('P-PATH-3 symlink escape negatives (real filesystem)', () => {
  async function tryDirLink(target: string, linkPath: string): Promise<boolean> {
    try {
      const type = process.platform === 'win32' ? 'junction' : 'dir';
      await symlink(target, linkPath, type);
      return true;
    } catch {
      return false;
    }
  }

  it('rejects a symlinked directory that escapes root (both guards)', async () => {
    const root = await tempRoot('planmo-fuzz-');
    const outside = await tempRoot('planmo-fuzz-outside-');
    const link = join(root, 'evil');
    if (!(await tryDirLink(outside, link))) {
      return; // symlinks unavailable — nothing platform-safe to assert
    }
    await expect(ensureNoSymlinkEscape(root, join(link, 'file.txt'))).rejects.toThrow(
      UnsafeSymlinkError,
    );
    await expect(ensureNoSymlinkEscape(root, join(link, 'deep', 'nest.md'))).rejects.toThrow(
      UnsafeSymlinkError,
    );
  });

  it('realpathWithinRoot rejects an existing file reached through an escaping symlink', async () => {
    const root = await tempRoot('planmo-fuzz-');
    const outside = await tempRoot('planmo-fuzz-outside-');
    await tempWrite(outside, 'secret.txt', 'do not touch');
    const link = join(root, 'evil');
    if (!(await tryDirLink(outside, link))) {
      return;
    }
    await expect(realpathWithinRoot(root, join(link, 'secret.txt'))).rejects.toThrow(
      UnsafeSymlinkError,
    );
  });

  it('accepts a symlink that stays inside root (negative case for false positives)', async () => {
    const root = await tempRoot('planmo-fuzz-');
    await tempDir(root, 'real');
    const link = join(root, 'inner-link');
    if (!(await tryDirLink(resolve(join(root, 'real')), link))) {
      return;
    }
    const out = await ensureNoSymlinkEscape(root, join(link, 'sub', 'f.txt'));
    expect(isInsideRoot(root, out)).toBe(true);
  });

  it('rejects traversal even when the target does not exist yet (no write before check)', async () => {
    const root = await tempRoot('planmo-fuzz-');
    await tempDir(root, '.planmo');
    await expect(ensureNoSymlinkEscape(root, join(root, '..', 'escape'))).rejects.toThrow(
      PathTraversalError,
    );
    await expect(ensureNoSymlinkEscape(root, join(root, 'a', '..', '..', 'x'))).rejects.toThrow(
      PathTraversalError,
    );
  });
});

describe('P-PATH-1b ensureNoSymlinkEscape on a real tree (seeded, bounded)', () => {
  it('60 seeded iterations over a real directory tree: inside result or a documented guard error', async () => {
    const rnd = mulberry32(0xa11c);
    const root = await tempRoot('planmo-fuzz-tree-');
    await tempDir(root, 'a');
    await tempDir(root, 'a/b');
    await tempDir(root, 'c');

    for (let i = 0; i < 60; i += 1) {
      const target =
        rnd() < 0.25
          ? genEscapeTarget(rnd)
          : join(
              ...Array.from({ length: 1 + Math.floor(rnd() * 3) }, () => pick(rnd, SAFE_SEGMENTS)),
            );
      let result: string;
      try {
        result = await ensureNoSymlinkEscape(root, join(root, target));
      } catch (err) {
        expect(
          err instanceof PathTraversalError || err instanceof UnsafeSymlinkError,
          `iter ${i}: target=${target} threw ${(err as Error).name}`,
        ).toBe(true);
        continue;
      }
      expect(isInsideRoot(root, result), `iter ${i}: target=${target} -> ${result}`).toBe(true);
    }
  }, 30_000);
});
