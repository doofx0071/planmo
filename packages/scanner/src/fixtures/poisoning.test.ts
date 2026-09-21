import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { FIXTURE_TREE_ROOT } from '../contracts.js';
import { classify } from '../security/prompt-isolation.js';
import { POISONING_TREE } from './poisoning.js';

/** Repo root, resolved from this file (packages/scanner/src/fixtures/). */
const REPO_ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const TREE_DIR = join(REPO_ROOT, FIXTURE_TREE_ROOT, 'poisoning');

/** The three real files of the on-disk poisoning tree. */
const TREE_FILES = ['README.md', 'AGENTS.instructions.md', 'src/comment.ts'] as const;

describe('fixtures/trees/poisoning — real on-disk tree', () => {
  it('exists on disk with exactly the indexed files', async () => {
    const onDisk: string[] = [];
    const walk = async (dir: string, prefix: string): Promise<void> => {
      const entries = await readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const rel = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
        if (entry.isDirectory()) await walk(join(dir, entry.name), rel);
        else onDisk.push(rel);
      }
    };
    await walk(TREE_DIR, '');
    onDisk.sort();
    expect(onDisk).toEqual([...TREE_FILES].sort());
  });

  it('keeps the index in byte-exact sync with the on-disk tree', async () => {
    expect(POISONING_TREE.name).toBe('poisoning');
    expect(POISONING_TREE.description.length).toBeGreaterThan(0);
    expect([...POISONING_TREE.files.keys()].sort()).toEqual([...TREE_FILES].sort());
    for (const path of TREE_FILES) {
      const onDisk = await readFile(join(TREE_DIR, path), 'utf8');
      expect(POISONING_TREE.files.get(path), `map content for ${path}`).toBe(onDisk);
    }
  });

  it('classifies the real fixtures: benign README, poisoned instructions, poisoned comments', async () => {
    const readme = await readFile(join(TREE_DIR, 'README.md'), 'utf8');
    const instructions = await readFile(join(TREE_DIR, 'AGENTS.instructions.md'), 'utf8');
    const comments = await readFile(join(TREE_DIR, 'src/comment.ts'), 'utf8');

    const readmeResult = classify(readme);
    expect(readmeResult.classification).toBe('benign');
    expect(readmeResult.markers).toHaveLength(0);

    const instructionsResult = classify(instructions);
    expect(instructionsResult.classification).toBe('poisoned');
    expect(instructionsResult.markers.length).toBeGreaterThanOrEqual(2);
    expect(instructionsResult.markers.every((m) => m.code !== 'INJ-003')).toBe(true); // poisoned via 2+ markers

    const commentsResult = classify(comments);
    expect(commentsResult.classification).toBe('poisoned');
    expect(commentsResult.markers.some((m) => m.code === 'INJ-003')).toBe(true); // poisoned via deceptive-system
    expect(commentsResult.markers.some((m) => m.code === 'INJ-004')).toBe(true); // hidden (comment/TODO) markers
  });

  it('keeps real secrets out of the fixtures', async () => {
    const all = await Promise.all(
      TREE_FILES.map(async (path) => await readFile(join(TREE_DIR, path), 'utf8')),
    );
    const joined = all.join('\n');
    expect(joined).not.toMatch(/AKIA[0-9A-Z]{16}/);
    expect(joined).not.toMatch(/sk-[A-Za-z0-9]{20,}/);
    expect(joined).not.toMatch(/-----BEGIN [A-Z ]+PRIVATE KEY-----/);
    expect(joined).not.toMatch(/password\s*[:=]\s*['"][^'"]+/i);
    expect(joined).not.toMatch(/\b\d{4}[ -]?\d{4}[ -]?\d{4}[ -]?\d{4}\b/); // card-like
  });

  it('is deterministic: repeated classification of the fixtures is stable', async () => {
    const instructions = await readFile(join(TREE_DIR, 'AGENTS.instructions.md'), 'utf8');
    expect(classify(instructions)).toEqual(classify(instructions));
  });
});
