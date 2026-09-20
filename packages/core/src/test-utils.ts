import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach } from 'vitest';

/**
 * Shared helpers for core tests: throwaway temp roots, cleaned up
 * automatically after each test.
 */

const tempRoots: string[] = [];

/** Create a fresh temp directory; removed after the test finishes. */
export async function tempRoot(prefix = 'planmo-test-'): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  tempRoots.push(dir);
  return dir;
}

/** Create a nested directory under a temp root. */
export async function tempDir(root: string, rel: string): Promise<string> {
  const { mkdir } = await import('node:fs/promises');
  const full = join(root, rel);
  await mkdir(full, { recursive: true });
  return full;
}

/** Write a file under a temp root. */
export async function tempWrite(root: string, rel: string, content: string): Promise<string> {
  const { mkdir, writeFile } = await import('node:fs/promises');
  const full = join(root, rel);
  await mkdir(join(full, '..'), { recursive: true });
  await writeFile(full, content, 'utf8');
  return full;
}

afterEach(async () => {
  while (tempRoots.length > 0) {
    const dir = tempRoots.pop()!;
    await rm(dir, { recursive: true, force: true });
  }
});
