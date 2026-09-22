import { describe, expect, it } from 'vitest';
import { standardsDiscovery } from './standards-discovery.js';

describe('standards-discovery: classification', () => {
  it('classifies root AGENTS.md at rank 0 (policy)', async () => {
    const result = await standardsDiscovery.discover(['AGENTS.md']);
    expect(result.docs).toEqual([
      { path: 'AGENTS.md', kind: 'agents', role: 'policy', depth: 0, rank: 0 },
    ]);
    expect(result.policyDocs).toHaveLength(1);
    expect(result.informationalDocs).toEqual([]);
  });

  it('ranks nested AGENTS.md by depth (root 0 < depth 1 < depth 2)', async () => {
    const result = await standardsDiscovery.discover([
      'src/AGENTS.md',
      'AGENTS.md',
      'packages/scanner/AGENTS.md',
    ]);
    expect(result.docs.map((d) => d.path)).toEqual([
      'AGENTS.md',
      'src/AGENTS.md',
      'packages/scanner/AGENTS.md',
    ]);
    expect(result.docs.map((d) => d.rank)).toEqual([0, 1, 2]);
  });

  it('classifies CLAUDE.md, .cursorrules and README.md with roles', async () => {
    const result = await standardsDiscovery.discover(['CLAUDE.md', '.cursorrules', 'README.md']);
    expect(result.docs.map((d) => d.kind)).toEqual(['claude', 'cursorrules', 'readme']);
    expect(result.docs.map((d) => d.role)).toEqual(['policy', 'policy', 'informational']);
    expect(result.policyDocs.map((d) => d.path)).toEqual(['CLAUDE.md', '.cursorrules']);
    expect(result.informationalDocs.map((d) => d.path)).toEqual(['README.md']);
  });

  it('applies the deterministic precedence order across kinds', async () => {
    const result = await standardsDiscovery.discover([
      'README.md',
      'CLAUDE.md',
      'packages/scanner/AGENTS.md',
      'AGENTS.md',
      '.cursorrules',
      'packages/scanner/CLAUDE.md',
    ]);
    expect(result.docs.map((d) => d.path)).toEqual([
      'AGENTS.md',
      'packages/scanner/AGENTS.md',
      'CLAUDE.md',
      'packages/scanner/CLAUDE.md',
      '.cursorrules',
      'README.md',
    ]);
    // README is informational-only and always ranks last.
    expect(result.docs[result.docs.length - 1]!.kind).toBe('readme');
  });

  it('keeps README informational docs out of policyDocs', async () => {
    const result = await standardsDiscovery.discover(['README.md', 'nested/README.md']);
    expect(result.policyDocs).toEqual([]);
    expect(result.informationalDocs.map((d) => d.rank)).toEqual([3000, 3001]);
  });

  it('depth is segments minus one for nested policy docs', async () => {
    const result = await standardsDiscovery.discover(['a/b/c/AGENTS.md']);
    expect(result.docs[0]).toEqual({
      path: 'a/b/c/AGENTS.md',
      kind: 'agents',
      role: 'policy',
      depth: 3,
      rank: 3,
    });
  });

  it('ignores non-policy, non-README paths', async () => {
    const result = await standardsDiscovery.discover([
      'package.json',
      'src/main.ts',
      'docs/AGENTS.md.bak',
      'AGENTS.txt',
      '',
      './',
    ]);
    expect(result.docs).toEqual([]);
  });

  it('normalises a leading ./ segment', async () => {
    const result = await standardsDiscovery.discover(['./AGENTS.md', './packages/x/CLAUDE.md']);
    expect(result.docs.map((d) => d.path)).toEqual(['AGENTS.md', 'packages/x/CLAUDE.md']);
  });

  it('is deterministic and empty for no input', async () => {
    const empty = await standardsDiscovery.discover([]);
    expect(empty).toEqual({ docs: [], policyDocs: [], informationalDocs: [] });
    const a = await standardsDiscovery.discover(['AGENTS.md', 'README.md']);
    const b = await standardsDiscovery.discover(['AGENTS.md', 'README.md']);
    expect(b).toEqual(a);
  });
});
