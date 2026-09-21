/**
 * P10-01 — ConstructorReader (Worker A): build a FileReader from a frozen
 * {@link VirtualTree} plus failure injection.
 *
 * VirtualTree keys are POSIX-relative paths: a string value is a file whose
 * size is the UTF-8 byte length of the content; `null` is an explicit empty
 * dir. Directories are ALSO implied by their children — a tree containing
 * only `a/b.txt` still has a dir `a`. The root is `''` (always a dir).
 *
 * Extensions beyond VirtualTree (all via {@link ConstructorReaderOptions}):
 * - `symlinks`: POSIX-relative path -> link target (target may be absolute).
 *   stat reports type 'symlink' with size = UTF-8 byte length of the target;
 *   readFile/readDir on a symlink fail closed; linkTarget returns the target.
 * - `otherPaths`: paths that stat as type 'other' (exercises SCN-006).
 * - `failures`: per-operation path lists that throw ReaderError
 *   ('injected-failure') so tests can exercise SCN-005 without touching the
 *   real filesystem. Injected failures take precedence over normal results.
 * - `base`: when scanning with a non-empty root string, strip that prefix
 *   from incoming paths before tree lookup (default '' = tree is root).
 *
 * readFile performs NO implicit binary (NUL) detection by default — virtual
 * tree content is already in memory and authoritative; pass `detectBinary:
 * true` to mirror NodeFileReader.
 */
import type { FileReader, ReaderStat, VirtualTree } from '../contracts.js';
import { ReaderError } from '../contracts.js';

import type { LinkTargetReader } from './safe-scanner.js';

export interface ConstructorReaderOptions {
  /** POSIX-relative symlink path -> link target (target may be absolute). */
  symlinks?: ReadonlyMap<string, string>;
  /** Paths that stat as type 'other' (exercises SCN-006). */
  otherPaths?: readonly string[];
  /** Per-operation injected failures (paths that throw ReaderError). */
  failures?: {
    readDir?: readonly string[];
    readFile?: readonly string[];
    stat?: readonly string[];
    linkTarget?: readonly string[];
  };
  /** Strip this prefix from incoming paths before tree lookup (default ''). */
  base?: string;
  /** When true, readFile rejects content containing a NUL byte (mirrors NodeFileReader). */
  detectBinary?: boolean;
}

const textEncoder = new TextEncoder();

function byteLength(value: string): number {
  return textEncoder.encode(value).length;
}

type FailureOp = 'readDir' | 'readFile' | 'stat' | 'linkTarget';

export class ConstructorReader implements FileReader, LinkTargetReader {
  readonly name = 'constructor-reader';

  private readonly tree: VirtualTree;
  private readonly symlinks: ReadonlyMap<string, string>;
  private readonly otherPaths: readonly string[];
  private readonly failures: Record<FailureOp, ReadonlySet<string>>;
  private readonly base: string;
  private readonly detectBinary: boolean;

  constructor(tree: VirtualTree, options: ConstructorReaderOptions = {}) {
    this.tree = tree;
    this.symlinks = options.symlinks ?? new Map();
    this.otherPaths = options.otherPaths ?? [];
    this.failures = {
      readDir: new Set(options.failures?.readDir ?? []),
      readFile: new Set(options.failures?.readFile ?? []),
      stat: new Set(options.failures?.stat ?? []),
      linkTarget: new Set(options.failures?.linkTarget ?? []),
    };
    this.base = options.base ?? '';
    this.detectBinary = options.detectBinary ?? false;
  }

  /** Normalize an incoming path: strip base prefix, leading './', trailing '/'. */
  private normalize(path: string): string {
    let p = path;
    if (this.base !== '') {
      if (p === this.base) return '';
      if (p.startsWith(`${this.base}/`)) p = p.slice(this.base.length + 1);
    }
    if (p.startsWith('./')) p = p.slice(2);
    if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
    return p;
  }

  private hasExplicit(p: string): boolean {
    return Object.prototype.hasOwnProperty.call(this.tree, p);
  }

  private hasChildren(p: string): boolean {
    const prefix = p === '' ? '' : `${p}/`;
    for (const key of Object.keys(this.tree)) {
      if (key !== '' && key.startsWith(prefix)) return true;
    }
    return false;
  }

  private isDir(p: string): boolean {
    if (p === '') return true;
    if (this.symlinks.has(p) || this.otherPaths.includes(p)) return false;
    if (this.hasExplicit(p)) return this.tree[p] === null;
    return this.hasChildren(p);
  }

  /** Direct child names of dir p (single segment), sorted ascending. */
  private childNames(p: string): string[] {
    const prefix = p === '' ? '' : `${p}/`;
    const names = new Set<string>();
    const addSegment = (key: string): void => {
      if (key === '' || !key.startsWith(prefix)) return;
      const remainder = key.slice(prefix.length);
      const idx = remainder.indexOf('/');
      const name = idx === -1 ? remainder : remainder.slice(0, idx);
      if (name !== '') names.add(name);
    };
    for (const key of Object.keys(this.tree)) addSegment(key);
    for (const key of this.symlinks.keys()) addSegment(key);
    for (const key of this.otherPaths) addSegment(key);
    return [...names].sort();
  }

  private maybeFail(op: FailureOp, p: string): void {
    if (this.failures[op].has(p)) {
      throw new ReaderError(p, 'injected-failure');
    }
  }

  async readDir(path: string): Promise<readonly string[]> {
    const p = this.normalize(path);
    this.maybeFail('readDir', p);
    if (p !== '' && this.symlinks.has(p)) {
      throw new ReaderError(p, 'not-a-directory');
    }
    if (this.hasExplicit(p)) {
      if (this.tree[p] !== null) throw new ReaderError(p, 'not-a-directory');
    } else if (!this.hasChildren(p)) {
      throw new ReaderError(p, 'not-found');
    }
    return this.childNames(p);
  }

  async readFile(path: string): Promise<string> {
    const p = this.normalize(path);
    this.maybeFail('readFile', p);
    if (this.symlinks.has(p)) {
      throw new ReaderError(p, 'refused: symlink not followed');
    }
    if (this.hasExplicit(p)) {
      const value = this.tree[p];
      if (value === null || value === undefined) {
        throw new ReaderError(p, 'is-a-directory');
      }
      if (this.detectBinary && value.includes('\0')) {
        throw new ReaderError(p, 'binary-content');
      }
      return value;
    }
    if (this.hasChildren(p)) {
      throw new ReaderError(p, 'is-a-directory');
    }
    throw new ReaderError(p, 'not-found');
  }

  async stat(path: string): Promise<ReaderStat> {
    const p = this.normalize(path);
    this.maybeFail('stat', p);
    if (p === '') return { type: 'dir', size: 0 };
    const symlinkTarget = this.symlinks.get(p);
    if (symlinkTarget !== undefined) {
      return { type: 'symlink', size: byteLength(symlinkTarget) };
    }
    if (this.otherPaths.includes(p)) {
      return { type: 'other', size: 0 };
    }
    if (this.hasExplicit(p)) {
      const value = this.tree[p];
      if (value === null || value === undefined) return { type: 'dir', size: 0 };
      return { type: 'file', size: byteLength(value) };
    }
    if (this.hasChildren(p)) return { type: 'dir', size: 0 };
    throw new ReaderError(p, 'not-found');
  }

  async exists(path: string): Promise<boolean> {
    try {
      await this.stat(path);
      return true;
    } catch {
      return false;
    }
  }

  async linkTarget(path: string): Promise<string> {
    const p = this.normalize(path);
    this.maybeFail('linkTarget', p);
    const target = this.symlinks.get(p);
    if (target === undefined) throw new ReaderError(p, 'not-a-symlink');
    return target;
  }
}

/** Factory mirroring the trace-package engine convention. */
export function constructorReader(
  tree: VirtualTree,
  options: ConstructorReaderOptions = {},
): ConstructorReader {
  return new ConstructorReader(tree, options);
}