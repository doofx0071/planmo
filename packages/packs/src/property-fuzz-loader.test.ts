import { stringify } from 'yaml';
import { describe, expect, it } from 'vitest';
import { loadPack, PackLoadError } from './loader.js';
import { makeTempDir, writePack } from './test-utils.js';

/**
 * Property / fuzz tests for the declarative pack loader (P12-02, P-LOAD).
 *
 * Properties under test (ADR-0004: packs are declarative, non-executable):
 * - P-LOAD-1  Executable keys (hooks/scripts/commands/exec/install/
 *             postinstall/preinstall/run/shell/lifecycle/template-engine/
 *             code) present at ANY depth — object or array, nested however
 *             deep — are rejected fail-closed with PackLoadError kind
 *             'executable'. Never partially loaded.
 * - P-LOAD-2  Arbitrary pack.yml shapes either load into a fully-valid pack
 *             with zero executable constructs, or throw a deterministic
 *             PackLoadError — never a partial load, never an unrelated
 *             error type.
 * All randomness is seeded (mulberry32, fixed seeds); identical inputs yield
 * identical outcomes (checked by loading each fuzz pack twice).
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

/** The exact fail-closed key set (contract under test — oracle, not import). */
const EXECUTABLE_KEYS = [
  'hooks',
  'scripts',
  'commands',
  'exec',
  'install',
  'postinstall',
  'preinstall',
  'run',
  'shell',
  'lifecycle',
  'template-engine',
  'code',
] as const;

/** Keys that look dangerous but are NOT in the fail-closed set. */
const BENIGN_KEYS = [
  'description',
  'rules',
  'stack',
  'style',
  'tokens',
  'script',
  'hook',
  'executable',
  'installer',
  'post-install',
  'runnable',
  'engine',
  'template',
  'metadata',
] as const;

/** Recursively locate executable keys (mirror of the loader's scan). */
function scanExecutableKeys(value: unknown, path: string, found: string[]): void {
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) {
      scanExecutableKeys(value[i], `${path}[${i}]`, found);
    }
    return;
  }
  if (value !== null && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      const p = `${path}.${key}`;
      if (
        (EXECUTABLE_KEYS as readonly string[]).includes(key) &&
        child !== null &&
        child !== undefined
      ) {
        found.push(p);
      }
      scanExecutableKeys(child, p, found);
    }
  }
}

const SCALARS: readonly unknown[] = ['x', 'echo hi', 0, 1, 4, true, false, null, '', '{"j":1}'];

/** Random structured value (depth-bounded — deep nesting is the point). */
function genValue(rnd: () => number, depth: number): unknown {
  const allKeys = [...EXECUTABLE_KEYS, ...BENIGN_KEYS];
  if (depth >= 5 || rnd() < 0.4) {
    return rnd() < 0.15 ? genValue(rnd, depth + 1) : pick(rnd, SCALARS);
  }
  if (rnd() < 0.5) {
    const n = 1 + Math.floor(rnd() * 4);
    return Array.from({ length: n }, () => genValue(rnd, depth + 1));
  }
  const n = 1 + Math.floor(rnd() * 5);
  const obj: Record<string, unknown> = {};
  for (let i = 0; i < n; i += 1) {
    obj[pick(rnd, allKeys)] = genValue(rnd, depth + 1);
  }
  return obj;
}

/** Nest `key` at `depth` (0 = directly at content root) inside a container. */
function nestExecutableKey(
  key: string,
  depth: number,
  useArray: boolean,
  rnd: () => number,
): unknown {
  let inner: unknown = { target: 'value' };
  for (let i = 0; i < depth; i += 1) {
    if (useArray && i % 2 === 0) {
      inner = [inner, pick(rnd, BENIGN_KEYS)];
    } else {
      inner = { [pick(rnd, BENIGN_KEYS)]: inner };
    }
  }
  return { [key]: inner };
}

function packDocument(rnd: () => number, ref: string, content: unknown): string {
  const doc: Record<string, unknown> = {
    schemaVersion: 1,
    ref,
    name: `Fuzz pack ${ref}`,
    version: pick(rnd, ['1.0.0', '1.1.0', '2.0.0']),
    category: 'stack',
    description: `Fuzzed pack ${ref}.`,
    content,
  };
  return stringify(doc);
}

/** Load a packed yaml fixture twice and return both outcomes, raw. */
function loadTwice(packDir: string): [unknown, unknown] {
  let first: unknown;
  try {
    first = loadPack(packDir);
  } catch (err) {
    first = err;
  }
  let second: unknown;
  try {
    second = loadPack(packDir);
  } catch (err) {
    second = err;
  }
  return [first, second];
}

function describeOutcome(outcome: unknown): string {
  if (outcome instanceof PackLoadError) {
    return `PackLoadError(${outcome.kind})`;
  }
  if (outcome && typeof outcome === 'object' && 'document' in outcome) {
    const doc = (outcome as { document: { ref?: unknown } }).document;
    return `loaded ${String(doc?.ref)}`;
  }
  return typeof outcome;
}

describe('P-LOAD-1 executable keys at ANY depth are rejected fail-closed', () => {
  it('table: every executable key at every depth 0..3, object and array containers', () => {
    const rnd = mulberry32(0x11e5);
    for (const key of EXECUTABLE_KEYS) {
      for (const depth of [0, 1, 2, 3]) {
        for (const useArray of [false, true]) {
          const dir = makeTempDir();
          const ref = `fz1/${key.replace(/[^a-z0-9-]/g, '')}-d${depth}-${useArray ? 'a' : 'o'}`;
          const content = nestExecutableKey(key, depth, useArray, rnd);
          const packDir = writePack(dir, ref, packDocument(rnd, ref, content));
          let err: unknown;
          try {
            loadPack(packDir);
          } catch (e) {
            err = e;
          }
          expect(
            err,
            `key "${key}" at depth ${depth} (array=${useArray}) must be rejected`,
          ).toBeInstanceOf(PackLoadError);
          const loadErr = err as PackLoadError;
          expect(loadErr.kind).toBe('executable');
          expect(loadErr.issues.join(',')).toContain(key);
        }
      }
    }
  });

  it('200 seeded deep-nesting iterations: an executable key at random depth always → kind "executable"', () => {
    const rnd = mulberry32(0x10ab);
    for (let i = 0; i < 200; i += 1) {
      const key = pick(rnd, EXECUTABLE_KEYS);
      const depth = 1 + Math.floor(rnd() * 8);
      const content = nestExecutableKey(key, depth, rnd() < 0.5, rnd);
      const dir = makeTempDir();
      const ref = `fz2/p${i}`;
      const packDir = writePack(dir, ref, packDocument(rnd, ref, content));
      let err: unknown;
      try {
        loadPack(packDir);
      } catch (e) {
        err = e;
      }
      expect(err).toBeInstanceOf(PackLoadError);
      expect((err as PackLoadError).kind, `iteration ${i} (${key}@depth ${depth})`).toBe(
        'executable',
      );
    }
  }, 30_000);
});

describe('P-LOAD-2 arbitrary pack.yml shapes: full load or deterministic PackLoadError', () => {
  it('120 seeded structured-shape iterations: loaded ⇒ no executable keys; rejected ⇒ PackLoadError', () => {
    const rnd = mulberry32(0x10cc);
    for (let i = 0; i < 120; i += 1) {
      const ref = `fz3/p${i}`;
      const content = genValue(rnd, 0);
      const dir = makeTempDir();
      const packDir = writePack(dir, ref, packDocument(rnd, ref, content));

      const [first, second] = loadTwice(packDir);

      // Determinism: the same file must produce the same outcome twice.
      expect(describeOutcome(second)).toBe(describeOutcome(first));

      if (first instanceof PackLoadError) {
        expect(['schema', 'executable', 'read']).toContain(first.kind);
        continue;
      }
      // Loaded ⇒ the document is schema-valid AND executable-free at any depth.
      const loaded = first as Awaited<ReturnType<typeof loadPack>>;
      expect(loaded.document.ref).toBe(ref);
      const found: string[] = [];
      scanExecutableKeys(loaded.document.content, 'content', found);
      expect(found, `iteration ${i} loaded a pack containing ${found.join(', ')}`).toEqual([]);
    }
  }, 30_000);

  it('60 seeded raw-string iterations: random YAML bytes never crash and never partial-load', () => {
    const rnd = mulberry32(0x71a7);
    const CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789:[]{}"- \n\r\t.';
    for (let i = 0; i < 60; i += 1) {
      const len = Math.floor(rnd() * 60);
      let raw = '';
      for (let j = 0; j < len; j += 1) {
        raw += CHARS[Math.floor(rnd() * CHARS.length)];
      }
      const dir = makeTempDir();
      const packDir = writePack(dir, `fz4/r${i}`, raw);
      const [first, second] = loadTwice(packDir);
      expect(describeOutcome(second)).toBe(describeOutcome(first));
      if (!(first instanceof PackLoadError)) {
        // A lucky document that happens to be valid YAML with all required
        // fields must still be executable-free.
        const loaded = first as Awaited<ReturnType<typeof loadPack>>;
        const found: string[] = [];
        scanExecutableKeys(loaded.document.content, 'content', found);
        expect(found).toEqual([]);
      }
    }
  });

  it('negative: near-miss keys that are NOT in the fail-closed set load cleanly', () => {
    const dir = makeTempDir();
    const ref = 'fz5/clean';
    const content = {
      script: 'echo hi',
      hook: { name: 'x' },
      executable: true,
      installer: 'npm',
      'post-install': ['a'],
      runnable: [],
      engine: 'node',
      template: { file: 'a.md' },
    };
    const packDir = writePack(dir, ref, packDocument(mulberry32(7), ref, content));
    const loaded = loadPack(packDir);
    expect(loaded.document.ref).toBe(ref);
    expect(loaded.document.content).toEqual(content);
  });

  it('negative: a missing pack.yml fails closed with a read error, not a crash', () => {
    const dir = makeTempDir();
    let err: unknown;
    try {
      loadPack(dir);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(PackLoadError);
    expect((err as PackLoadError).kind).toBe('read');
  });
});
