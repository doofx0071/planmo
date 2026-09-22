import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { FIXTURE_TREE_ROOT } from '../contracts.js';
import {
  brownfieldDescription,
  brownfieldFiles,
  brownfieldFixture,
  brownfieldTreeRoot,
} from '../fixtures/brownfield.js';
import { nodeFileReader } from '../scan/node-reader.js';
import { safeScanner } from '../scan/safe-scanner.js';
import { constructorReader } from '../scan/virtual-reader.js';

// Resolve the on-disk tree WITHOUT relying on the process CWD (vitest may run
// from any directory).
const treeDir = fileURLToPath(new URL('../fixtures/trees/brownfield', import.meta.url));

function walkTree(dir: string, prefix = ''): Map<string, string> {
  const out = new Map<string, string>();
  for (const name of readdirSync(dir).sort()) {
    const abs = join(dir, name);
    const rel = prefix === '' ? name : `${prefix}/${name}`;
    const st = statSync(abs);
    if (st.isDirectory()) {
      for (const [k, v] of walkTree(abs, rel)) out.set(k, v);
    } else if (st.isFile()) {
      out.set(rel, readFileSync(abs, 'utf8'));
    } else {
      throw new Error(`unexpected non-file entry in fixture tree: ${rel}`);
    }
  }
  return out;
}

describe('brownfield fixture (P10-05)', () => {
  it('is registered with the frozen contract root path', () => {
    expect(brownfieldFixture.name).toBe('brownfield');
    expect(brownfieldTreeRoot).toBe(`${FIXTURE_TREE_ROOT}/brownfield`);
    expect(treeDir.replace(/\\/g, '/')).toMatch(/fixtures\/trees\/brownfield$/);
  });

  it('the on-disk tree matches the fixture files map byte-for-byte', () => {
    const disk = walkTree(treeDir);
    expect(disk.size).toBeGreaterThanOrEqual(15); // sanity: not a stub
    expect(new Map(brownfieldFiles)).toEqual(disk);
  });

  it('contains cross-platform-safe devious file names and ordinary repo files', () => {
    const paths = [...brownfieldFiles.keys()];
    expect(paths).toContain('scripts/-rf');
    expect(paths).toContain('src/..hidden.ts');
    expect(paths).toContain('tools/--upload.txt');
    expect(paths).toContain('.github/workflows/ci.yml');
    expect(paths).toContain('.env.example');
    expect(paths).toContain('pnpm-lock.yaml');
    expect(paths).toContain('package.json');
    expect(paths).toContain('README.md');
    // README documents the fixture's synthetic nature
    expect(brownfieldFiles.get('README.md')).toContain('synthetic');
  });

  it('describes the fixture and never contains real secrets', () => {
    expect(brownfieldDescription.length).toBeGreaterThan(40);
    expect(brownfieldFixture.description).toBe(brownfieldDescription);
    const all = [...brownfieldFiles.values()].join('\n');
    // synthetic placeholder conventions only
    expect(all).toContain('EXAMPLE_PASSWORD');
    expect(all).toContain('dev-only-placeholder');
    // no real-secret shapes
    expect(all).not.toMatch(/-----BEGIN [A-Z ]*PRIVATE KEY-----/);
    expect(all).not.toMatch(/AKIA[0-9A-Z]{16}/);
    expect(all).not.toMatch(/ghp_[A-Za-z0-9]{36}/);
    // benign content: no prompt-injection markers (those belong to the
    // poisoning fixtures, not the brownfield tree)
    expect(all.toLowerCase()).not.toContain('ignore all previous instructions');
    expect(all.toLowerCase()).not.toContain('disregard previous');
  });
});

describe('brownfield fixture — scanner integration', () => {
  it('no symlinks in the committed tree (creation-time safety)', async () => {
    const disk = walkTree(treeDir);
    for (const [rel] of disk) {
      const st = statSync(join(treeDir, ...rel.split('/')));
      expect(st.isSymbolicLink(), rel).toBe(false);
    }
  });

  it('scans the REAL tree deterministically with the node reader', async () => {
    const report = await safeScanner().scan(treeDir, nodeFileReader());
    expect(report.warnings).toEqual([]);
    expect(report.truncatedBy).toBeNull();
    // 21 files + 12 dirs in this tree
    expect(report.stats.files).toBe(brownfieldFiles.size);
    expect(report.entries.length).toBe(report.stats.files + report.stats.dirs);
    const entryPaths = report.entries.map((e) => e.path);
    // entries are DFS-ordered: every dir precedes its descendants
    for (const entry of report.entries) {
      if (entry.type === 'dir') {
        const idx = entryPaths.indexOf(entry.path);
        for (const child of report.entries) {
          if (child.path.startsWith(`${entry.path}/`)) {
            expect(entryPaths.indexOf(child.path)).toBeGreaterThan(idx);
          }
        }
      }
    }
    const textEncoder = new TextEncoder();
    for (const entry of report.entries) {
      if (entry.type === 'file') {
        const expected = brownfieldFiles.get(entry.path);
        expect(expected, entry.path).toBeDefined();
        expect(entry.size).toBe(textEncoder.encode(expected as string).length);
      } else {
        expect(entry.type).toBe('dir');
        expect(entry.size).toBe(0);
      }
    }
    expect(report.stats.files).toBe(brownfieldFiles.size);
  });

  it('virtual reader scan over the fixture map is byte-identical to the real scan', async () => {
    const real = await safeScanner().scan(treeDir, nodeFileReader());
    const virtual = await safeScanner().scan(
      '',
      constructorReader(Object.fromEntries(brownfieldFiles)),
    );
    expect(virtual.entries).toEqual(real.entries);
    expect(virtual.stats).toEqual(real.stats);
    expect(virtual.warnings).toEqual(real.warnings);
  });

  it('exclusion, size caps and depth caps behave on the real tree', async () => {
    const scanner = safeScanner();
    const report = await scanner.scan(treeDir, nodeFileReader(), { exclude: ['docs', 'public'] });
    expect(report.entries.some((e) => e.path.startsWith('docs/'))).toBe(false);
    expect(report.entries.some((e) => e.path.startsWith('public/'))).toBe(false);
    expect(report.warnings.filter((w) => w.code === 'SCN-007').map((w) => w.path)).toEqual([
      'docs',
      'public',
    ]);

    const sized = await scanner.scan(treeDir, nodeFileReader(), { maxFileBytes: 16 });
    const skipped = sized.warnings.filter((w) => w.code === 'SCN-004');
    expect(skipped.length).toBeGreaterThan(0);
    for (const s of skipped) {
      const content = brownfieldFiles.get(s.path);
      expect(new TextEncoder().encode(content as string).length).toBeGreaterThan(16);
    }

    const shallow = await scanner.scan(treeDir, nodeFileReader(), { maxDepth: 1 });
    expect(shallow.truncatedBy).toBe('depth');
    expect(shallow.entries.every((e) => !e.path.includes('/'))).toBe(true);
  });
});
