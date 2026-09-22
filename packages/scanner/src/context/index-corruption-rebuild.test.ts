/**
 * P12-11 — Scanner context engine corruption & rebuild tests (CHG-001).
 *
 * Pure scanner engines (lexical-context, symbol-index, context-map,
 * memory-bootstrap) on garbage/truncated/corrupt input: deterministic
 * results, no crashes, no invented facts or paths.
 *
 * Memory-provider corruption/rebuild tests live in @planmo/agent-bridge
 * (packages/agent-bridge/src/memory-corruption-rebuild.test.ts) — the scanner
 * package does not depend on agent-bridge (declared boundary graph), so this
 * file only exercises scanner-owned engines.
 */

import { describe, expect, it } from 'vitest';

import type { DetectionReport, ScanReport } from '../contracts.js';
import { lexicalContext } from './lexical-context.js';
import { symbolIndex } from './symbol-index.js';
import { contextMapEngine } from './context-map.js';
import { memoryBootstrap } from './memory-bootstrap.js';

/** Pure binary garbage: no identifier characters, no line structure. */
const GARBAGE_BINARY = '\u0000\u0001\u0002\xff\xfe\u0000\x01\x02\xff\xfe\u0000\u0001';

const VALID_CONTENT = `import { validateToken } from "../core/tokens";
// TODO: migrate legacy parser
export function handle(req) {
  return validateToken(req.token);
}`;

describe('P12-11 scanner context engines: garbage/truncated input stays deterministic', () => {
  it('lexicalContext tolerates binary garbage and is deterministic', async () => {
    const files = new Map<string, string>([['src/garbage.bin', GARBAGE_BINARY]]);
    const first = await lexicalContext.index(files);
    const second = await lexicalContext.index(new Map([['src/garbage.bin', GARBAGE_BINARY]]));
    expect(second).toEqual(first);
    expect(first).toEqual([{ file: 'src/garbage.bin', tokens: [], markers: [] }]);
  });

  it('lexicalContext on truncated content is a stable, deterministic subset (no crash, no fabricated tokens)', async () => {
    const fullFiles = new Map<string, string>([['src/app.ts', VALID_CONTENT]]);
    const truncated = VALID_CONTENT.slice(0, Math.floor(VALID_CONTENT.length / 2));
    const full = await lexicalContext.index(fullFiles);
    const cut = await lexicalContext.index(new Map([['src/app.ts', truncated]]));
    const fullTokens = full[0]?.tokens ?? [];
    const cutTokens = cut[0]?.tokens ?? [];
    // Truncation never invents tokens: every cut token exists in the full index.
    for (const t of cutTokens) {
      const fullToken = fullTokens.find((f) => f.token === t.token);
      expect(fullToken, `token ${t.token}`).toBeDefined();
      expect(t.count, `token ${t.token} count`).toBeLessThanOrEqual(fullToken?.count ?? -1);
    }
    // Deterministic across re-runs on the same truncated bytes.
    const again = await lexicalContext.index(new Map([['src/app.ts', truncated]]));
    expect(again).toEqual(cut);
  });

  it('symbolIndex tolerates a truncated import line and binary garbage', async () => {
    const files = new Map<string, string>([
      ['src/broken.ts', 'import { foo from "../core/tokens"'], // unterminated
      ['src/garbage.bin', GARBAGE_BINARY],
    ]);
    const first = await symbolIndex.index(files);
    const second = await symbolIndex.index(new Map(files));
    expect(second).toEqual(first);
    // The parseable import inside the truncated line is still recovered or
    // skipped deterministically; either way nothing crashes and nothing is invented.
    for (const ref of first) {
      expect(typeof ref.symbol).toBe('string');
      expect(ref.file).toMatch(/^(src\/broken\.ts|src\/garbage\.bin)$/);
    }
  });

  it('memoryBootstrap with a corrupted ScanReport (stats contradict entries) never fabricates', async () => {
    const corrupt: ScanReport = {
      root: '/repo',
      entries: [],
      warnings: [{ code: 'SCN-003', path: 'log', message: 'escape refused' }],
      stats: { files: 42, dirs: 7, symlinks: 2, totalBytes: 999 }, // contradicts entries
      truncatedBy: null,
    };
    const detection: DetectionReport = { stacks: [], testFrameworks: [], ciSystems: [] };
    const first = await memoryBootstrap.bootstrap(corrupt, detection);
    const second = await memoryBootstrap.bootstrap(corrupt, detection);
    expect(second).toEqual(first);
    // Garbage in, garbage out: the aggregate fact echoes the corrupt stats
    // verbatim (never invented zeros), but NO symlink-ENTRY fact can appear
    // because the entry list is empty — nothing is fabricated from nothing.
    expect(first.some((f) => f.fact.includes('42 files'))).toBe(true);
    expect(first.some((f) => f.fact.includes('2 symlinks (999 bytes)'))).toBe(true);
    // The corrupt stats may drive an aggregate symlink fact, but with empty
    // entries there are NO paths to attach: no fabricated provenance.
    const symlinkFact = first.find((f) => f.fact.includes('symlink entries'));
    expect(symlinkFact).toBeDefined();
    expect(symlinkFact?.provenance).toEqual([]);
    // The warning fact carries exactly the warning's own path as provenance.
    const warningFact = first.find((f) => f.fact.includes('warnings'));
    expect(warningFact?.provenance).toEqual(['log']);
    for (const f of first) {
      expect(f.id).toMatch(/^fact-[0-9a-f]{8}$/);
      expect(Array.isArray(f.provenance)).toBe(true);
    }
  });

  it('contextMap with duplicated warnings dedupes and sorts deterministically', async () => {
    const scan: ScanReport = {
      root: '/repo',
      entries: [
        { path: 'src/a.ts', type: 'file', size: 10 },
        { path: 'src', type: 'dir', size: 0 },
        { path: 'package.json', type: 'file', size: 5 },
        { path: 'weird', type: 'other', size: 0 },
      ],
      warnings: [
        { code: 'SCN-006', path: 'weird', message: 'unsupported type' },
        { code: 'SCN-006', path: 'weird', message: 'unsupported type' }, // duplicated corruption
        { code: 'SCN-005', path: 'bin/x', message: 'unreadable' },
      ],
      stats: { files: 2, dirs: 1, symlinks: 0, totalBytes: 15 },
      truncatedBy: null,
    };
    const detection: DetectionReport = { stacks: [], testFrameworks: [], ciSystems: [] };
    const first = await contextMapEngine().map(scan, detection);
    const second = await contextMapEngine().map(scan, detection);
    expect(second).toEqual(first);
    expect(first.warnings).toEqual([
      'SCN-005 bin/x: unreadable',
      'SCN-006 weird: unsupported type',
    ]); // deduped + sorted
  });
});
