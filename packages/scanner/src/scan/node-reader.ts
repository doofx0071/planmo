/**
 * P10-01 — node:fs-backed FileReader (Worker A).
 *
 * This is the ONLY module in @planmo/scanner that touches node:fs. Every
 * engine stays pure and deterministic; real filesystem access funnels through
 * here (or through ConstructorReader for in-memory trees).
 *
 * Behaviour notes:
 * - stat uses lstat: symbolic links are exposed as type 'symlink' and are
 *   NEVER followed implicitly (a broken link still exists as a symlink).
 * - readFile decodes UTF-8 and REJECTS binary content (NUL byte present) with
 *   a ReaderError — matching the contract "Throws ReaderError on
 *   binary/unreadable content". Text files containing a NUL are vanishingly
 *   rare and rejecting them fail-closed.
 * - All errors are normalized to {@link ReaderError} with stable `reason`
 *   strings derived from the errno code, so downstream warnings are
 *   deterministic across platforms where errno codes match.
 * - linkTarget exposes readlink so safe-scanner can apply SCN-003 escape
 *   analysis.
 */
import { lstat, readFile, readdir, readlink } from 'node:fs/promises';

import type { FileReader, ReaderStat } from '../contracts.js';
import { ReaderError } from '../contracts.js';

import type { LinkTargetReader } from './safe-scanner.js';

/** Stable reason strings for the errno codes readers actually encounter. */
const ERRNO_REASONS: Readonly<Record<string, string>> = {
  ENOENT: 'not-found',
  EACCES: 'permission-denied',
  EPERM: 'permission-denied',
  EISDIR: 'is-a-directory',
  ENOTDIR: 'not-a-directory',
  ENAMETOOLONG: 'name-too-long',
  ELOOP: 'too-many-links',
  EINVAL: 'invalid-input',
  EIO: 'io-error',
  EMFILE: 'too-many-open-files',
  ENFILE: 'too-many-open-files',
};

function errorCode(error: unknown): string | undefined {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === 'string') return code;
  }
  return undefined;
}

function toReaderError(path: string, error: unknown): ReaderError {
  const code = errorCode(error);
  const reason =
    (code !== undefined && ERRNO_REASONS[code]) ||
    (code !== undefined ? `os-error-${code}` : error instanceof Error ? 'unknown-error' : 'unknown-error');
  return new ReaderError(path, reason);
}

export class NodeFileReader implements FileReader, LinkTargetReader {
  readonly name = 'node-reader';

  async readDir(path: string): Promise<readonly string[]> {
    try {
      return await readdir(path);
    } catch (error) {
      throw toReaderError(path, error);
    }
  }

  async readFile(path: string): Promise<string> {
    let content: string;
    try {
      content = await readFile(path, 'utf8');
    } catch (error) {
      throw toReaderError(path, error);
    }
    if (content.includes('\0')) {
      throw new ReaderError(path, 'binary-content');
    }
    return content;
  }

  async stat(path: string): Promise<ReaderStat> {
    let stat: Awaited<ReturnType<typeof lstat>>;
    try {
      stat = await lstat(path);
    } catch (error) {
      throw toReaderError(path, error);
    }
    if (stat.isFile()) return { type: 'file', size: stat.size };
    if (stat.isDirectory()) return { type: 'dir', size: 0 };
    if (stat.isSymbolicLink()) return { type: 'symlink', size: stat.size };
    return { type: 'other', size: stat.size };
  }

  async exists(path: string): Promise<boolean> {
    try {
      await lstat(path);
      return true;
    } catch (error) {
      const code = errorCode(error);
      if (code === 'ENOENT' || code === 'ENOTDIR') return false;
      throw toReaderError(path, error);
    }
  }

  async linkTarget(path: string): Promise<string> {
    try {
      return await readlink(path);
    } catch (error) {
      throw toReaderError(path, error);
    }
  }
}

/**
 * Create a {@link NodeFileReader} (the only reader backed by node:fs).
 */
export function nodeFileReader(): NodeFileReader {
  return new NodeFileReader();
}