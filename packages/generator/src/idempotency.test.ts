import { describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildIr } from './ir.js';
import { compileWorkspace } from './compile.js';
import { mediumAssuranceInput } from './fixtures.js';

/**
 * Idempotent regeneration (P05-05, exit gate: "second generation with
 * unchanged inputs produces no unintended diff"). Compile → write →
 * recompile with identical inputs must produce identical bytes and an
 * identical manifest, in a real scratch project on disk.
 */
async function scratchProject(): Promise<{ root: string; cleanup: () => Promise<void> }> {
  const root = await mkdtemp(join(tmpdir(), 'planmo-gen-'));
  await mkdir(join(root, '.planmo'), { recursive: true });
  return { root, cleanup: () => rm(root, { recursive: true, force: true }) };
}

describe('idempotent regeneration (P05-05)', () => {
  it('second generation with unchanged inputs produces no diff', async () => {
    const { root, cleanup } = await scratchProject();
    try {
      const ir = buildIr(mediumAssuranceInput());

      const first = await compileWorkspace(ir, { root });
      expect(first.collisions).toEqual([]);
      expect(first.written.length).toBeGreaterThan(0);

      const firstFiles = new Map<string, string>();
      for (const path of first.written) {
        firstFiles.set(path, await readFile(join(root, path), 'utf8'));
      }
      firstFiles.set(
        '.planmo/manifest.json',
        await readFile(join(root, '.planmo/manifest.json'), 'utf8'),
      );

      // Second generation: same inputs, root already populated.
      const second = await compileWorkspace(ir, { root, allowOverwrite: true });
      expect(second.collisions).toEqual([]);
      expect(second.diff).toBe(''); // no unintended diff

      // Seeded artifacts are created once and then belong to the user, so the
      // second run deliberately does not rewrite them (ADR-0016). Everything it
      // does write must be byte-identical to the first run.
      const seededPaths = new Set(
        second.preview.changes.filter((c) => c.ownership === 'seeded').map((c) => c.path),
      );
      expect(seededPaths.size).toBeGreaterThan(0);
      for (const path of seededPaths) {
        expect(second.written, `seeded file rewritten: ${path}`).not.toContain(path);
        expect(await readFile(join(root, path), 'utf8')).toBe(firstFiles.get(path));
      }
      expect(second.written).toEqual(first.written.filter((p) => !seededPaths.has(p)));

      for (const path of second.written) {
        expect(await readFile(join(root, path), 'utf8'), `file changed: ${path}`).toBe(
          firstFiles.get(path),
        );
      }
      expect(await readFile(join(root, '.planmo/manifest.json'), 'utf8')).toBe(
        firstFiles.get('.planmo/manifest.json'),
      );
    } finally {
      await cleanup();
    }
  });

  it('regeneration preserves unmanaged content (golden exit gate)', async () => {
    const { root, cleanup } = await scratchProject();
    try {
      const ir = buildIr(mediumAssuranceInput());

      // A user-owned file that generation must never touch (not managed).
      await mkdir(join(root, 'planning'), { recursive: true });
      await writeFile(join(root, 'planning/NOTES.md'), '# my notes\nuser content\n', 'utf8');

      const first = await compileWorkspace(ir, { root });
      // planning/NOTES.md was not rendered and must not be listed or lost.
      expect(first.written).not.toContain('planning/NOTES.md');

      const second = await compileWorkspace(ir, { root, allowOverwrite: true });
      expect(second.written).not.toContain('planning/NOTES.md');
      expect(await readFile(join(root, 'planning/NOTES.md'), 'utf8')).toBe(
        '# my notes\nuser content\n',
      );
    } finally {
      await cleanup();
    }
  });

  it('dry-run reports the plan without touching disk', async () => {
    const { root, cleanup } = await scratchProject();
    try {
      const ir = buildIr(mediumAssuranceInput());
      const dry = await compileWorkspace(ir, { root, dryRun: true });
      expect(dry.written.length).toBeGreaterThan(0);
      expect(dry.preview.changes.length).toBeGreaterThan(0);
      // Nothing persisted.
      await expect(readFile(join(root, '.planmo/manifest.json'), 'utf8')).rejects.toThrow();
    } finally {
      await cleanup();
    }
  });

  it('collision refusal: unmanaged existing file blocks the unsafe write', async () => {
    const { root, cleanup } = await scratchProject();
    try {
      const ir = buildIr(mediumAssuranceInput());
      // planning/ROADMAP.md exists but was never manifest-managed.
      await mkdir(join(root, 'planning'), { recursive: true });
      await writeFile(join(root, 'planning/ROADMAP.md'), '# user roadmap\n', 'utf8');

      const result = await compileWorkspace(ir, { root });
      expect(result.preview.safe).toBe(false);
      expect(result.collisions).toContain('planning/ROADMAP.md');
      expect(result.written).toEqual([]);
      // User content intact.
      expect(await readFile(join(root, 'planning/ROADMAP.md'), 'utf8')).toBe('# user roadmap\n');
    } finally {
      await cleanup();
    }
  });

  it('seeded documents survive user edits across regeneration', async () => {
    const { root, cleanup } = await scratchProject();
    try {
      const ir = buildIr(mediumAssuranceInput());
      await compileWorkspace(ir, { root });

      // The user edits a seeded document: PlanMo wrote the starting point, the
      // user owns the file from then on.
      const edited = '# Decision Log\n\n## D-100 — a decision the user recorded\n';
      await writeFile(join(root, 'planning/DECISIONS.md'), edited, 'utf8');

      const again = await compileWorkspace(ir, { root, allowOverwrite: true });
      expect(again.collisions).toEqual([]);
      expect(again.written).not.toContain('planning/DECISIONS.md');
      expect(await readFile(join(root, 'planning/DECISIONS.md'), 'utf8')).toBe(edited);

      // Generated documents are still refreshed in the same run.
      expect(again.written).toContain('planning/MASTER-PLAN.md');
    } finally {
      await cleanup();
    }
  });
});
