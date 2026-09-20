import { describe, expect, it } from 'vitest';
import { ProjectConfigSchema } from '@planmo/schema';
import {
  CANONICAL_PHASES,
  buildIr,
  canonicalJson,
  phasesForDepth,
  sha256Hex,
  type IrInput,
} from './ir.js';

/** Minimal validated project config the IR tests share. */
function project() {
  return ProjectConfigSchema.parse({
    schemaVersion: 1,
    project: {
      name: 'demo',
      lifecycle: 'greenfield',
      type: 'web-application',
      risk: 'medium',
    },
    planning: { depth: 'standard', phaseMode: 'gated', freshSessionPerPhase: true },
    agents: { primary: 'opencode' },
    packs: [],
  });
}

function irInput(overrides: Partial<IrInput> = {}): IrInput {
  return {
    project: project(),
    resolution: {
      packs: [],
      order: [],
      diagnostics: [],
      ok: true,
    },
    lockfile: { planmoVersion: '0.0.0', packs: [] },
    profile: null,
    standards: { rules: [], conflicts: [], sources: [] },
    ...overrides,
  };
}

describe('canonicalJson', () => {
  it('hashes key-sorted objects independently of insertion order', () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: [1, 2] } })).toBe(
      canonicalJson({ a: { c: [1, 2], d: 2 }, b: 1 }),
    );
  });

  it('distinguishes arrays from objects and preserves order', () => {
    expect(canonicalJson([1, 2])).not.toBe(canonicalJson({ 0: 1, 1: 2 }));
    expect(canonicalJson([1, 2])).not.toBe(canonicalJson([2, 1]));
  });
});

describe('sha256Hex', () => {
  it('produces the known sha256 of "abc"', () => {
    expect(sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});

describe('CANONICAL_PHASES', () => {
  it('has the 13-phase spine 00..12', () => {
    expect(CANONICAL_PHASES).toHaveLength(13);
    expect(CANONICAL_PHASES[0]?.id).toBe('00');
    expect(CANONICAL_PHASES[12]?.id).toBe('12');
    expect(new Set(CANONICAL_PHASES.map((p) => p.id)).size).toBe(13);
  });
});

describe('phasesForDepth', () => {
  it('prunes deterministically by depth', () => {
    expect(phasesForDepth('lean')).toHaveLength(4);
    expect(phasesForDepth('standard')).toHaveLength(7);
    expect(phasesForDepth('production')).toHaveLength(10);
    expect(phasesForDepth('high-assurance')).toHaveLength(13);
    expect(phasesForDepth('custom')).toHaveLength(13);
  });
});

describe('buildIr', () => {
  it('produces a plain, hash-stable IR (P05-01)', () => {
    const a = buildIr(irInput());
    const b = buildIr(irInput());
    expect(a).toEqual(b);
    expect(a.inputHash).toBe(b.inputHash);
    expect(a.inputHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('sorts locked packs by ref for determinism', () => {
    const packs = [
      { ref: 'stack/zeta', version: '1.0.0', source: 'local', integrity: { algorithm: 'sha256' as const, digest: 'a'.repeat(64) } },
      { ref: 'stack/alpha', version: '1.0.0', source: 'local', integrity: { algorithm: 'sha256' as const, digest: 'b'.repeat(64) } },
    ];
    const ir = buildIr(
      irInput({ lockfile: { planmoVersion: '0.0.0', packs: packs as never } }),
    );
    expect(ir.lockedPacks.map((p) => p.ref)).toEqual(['stack/alpha', 'stack/zeta']);
  });

  it('changes the input hash when the depth changes', () => {
    const std = buildIr(irInput());
    const lean = buildIr(
      irInput({
        project: ProjectConfigSchema.parse({
          ...project(),
          planning: { depth: 'lean', phaseMode: 'continuous', freshSessionPerPhase: false },
        }),
      }),
    );
    expect(lean.inputHash).not.toBe(std.inputHash);
    expect(lean.phases).toHaveLength(4);
  });

  it('is identical for the same multiset of packs in different input order', () => {
    const alpha = {
      ref: 'stack/alpha',
      version: '1.0.0',
      source: 'local' as const,
      integrity: { algorithm: 'sha256' as const, digest: 'a'.repeat(64) },
    };
    const zeta = {
      ref: 'stack/zeta',
      version: '1.0.0',
      source: 'local' as const,
      integrity: { algorithm: 'sha256' as const, digest: 'b'.repeat(64) },
    };
    const aa = buildIr(irInput({ lockfile: { planmoVersion: '0.0.0', packs: [alpha, zeta] as never } }));
    const bb = buildIr(irInput({ lockfile: { planmoVersion: '0.0.0', packs: [zeta, alpha] as never } }));
    expect(aa.inputHash).toBe(bb.inputHash);
    expect(aa.lockedPacks.map((p) => p.ref)).toEqual(['stack/alpha', 'stack/zeta']);
  });
});