import { describe, expect, it } from 'vitest';
import { ProjectConfigSchema, type PackLockEntry as PackLockEntryType } from '@planmo/schema';
import type { StandardsSelection } from '@planmo/packs';
import {
  buildIr,
  canonicalJson,
  IR_SCHEMA_VERSION,
  sha256Hex,
  type IrInput,
  type PhaseNode,
  type PlanningIR,
} from './ir.js';
import { renderPlanningDocuments } from './render.js';

/**
 * Property / fuzz tests for the IR pipeline (P12-02, P-IR).
 *
 * Properties under test (docs/09-testing/property-and-fuzz.md — Manifest
 * regeneration, deterministic generation):
 * - P-IR-1  No-op regeneration: unchanged inputs produce byte-identical IR
 *           and byte-identical rendered artifacts — the render of an IR is a
 *           pure function of the IR (no clocks, no randomness, no
 *           deployment-order dependence).
 * - P-IR-2  Malformed input is rejected without a crash: garbage project
 *           configs fail ProjectConfigSchema deterministically (never an
 *           uncaught error, never a partial IR), and pathological IR shapes
 *           still render deterministically without throwing.
 * All randomness is seeded (mulberry32, fixed seeds).
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

const REFS = ['stack/nextjs', 'stack/vite', 'design/minimal', 'domain/payments'] as const;

/** A schema-valid project config with seeded-random values. */
function genProjectRaw(rnd: () => number): Record<string, unknown> {
  const doc: Record<string, unknown> = {
    schemaVersion: 1,
    project: {
      name: pick(rnd, ['demo', 'proj-alpha', 'web-app', 'blog']),
      lifecycle: pick(rnd, ['greenfield', 'brownfield']),
      type: pick(rnd, ['web-application', 'cli', 'library', 'service']),
      risk: pick(rnd, ['low', 'medium', 'high']),
    },
    planning: {
      depth: pick(rnd, ['lean', 'standard', 'production', 'high-assurance']),
      phaseMode: pick(rnd, ['gated', 'continuous']),
      freshSessionPerPhase: rnd() < 0.5,
    },
    agents: { primary: pick(rnd, ['opencode', 'claude-code', 'generic']) },
    packs:
      rnd() < 0.6 ? Array.from({ length: 1 + Math.floor(rnd() * 3) }, () => pick(rnd, REFS)) : [],
  };
  if (rnd() < 0.4) {
    doc.design = {
      style: pick(rnd, ['minimal', 'editorial', 'neobrutalism', 'soft-product']),
      density: pick(rnd, ['compact', 'balanced', 'spacious']),
      accessibility: 'WCAG-2.2-AA',
    };
  }
  return doc;
}

function genLockedPack(rnd: () => number): PackLockEntryType {
  const ref = pick(rnd, REFS);
  const digest = Array.from({ length: 64 }, () => '0123456789abcdef'[Math.floor(rnd() * 16)]).join(
    '',
  );
  const withIntegrity = rnd() < 0.8;
  // The name derives from the ref — realistic lock entries; equal sort keys
  // (ref, version, digest) then imply identical entries, so multiset
  // permutation can never reorder distinct packs.
  const entry: PackLockEntryType = {
    ref,
    name: `Pack ${ref}`,
    version: pick(rnd, ['1.0.0', '1.1.0', '2.0.0']),
    source: pick(rnd, ['local', 'registry', 'git']),
  };
  return withIntegrity ? { ...entry, integrity: { algorithm: 'sha256', digest } } : entry;
}

/** Build a fully-typed IrInput from seeded randomness. */
function genIrInput(rnd: () => number): IrInput {
  const project = ProjectConfigSchema.parse(genProjectRaw(rnd));
  const lockfile = {
    planmoVersion: '0.0.0',
    packs: Array.from({ length: Math.floor(rnd() * 4) }, () => genLockedPack(rnd)),
  };
  return {
    project,
    resolution: { packs: [], order: [], diagnostics: [], ok: true },
    lockfile,
    profile: null,
    standards: { rules: [], conflicts: [], sources: [] } satisfies StandardsSelection,
  };
}

function renderBytes(ir: PlanningIR): string {
  return renderPlanningDocuments(ir)
    .map((a) => `${a.path}\u0000${a.content}`)
    .join('\u0001');
}

describe('P-IR-1 unchanged inputs regenerate byte-identical output (no-op property)', () => {
  it('200 seeded inputs: buildIr twice equal, render twice byte-identical', () => {
    const rnd = mulberry32(0x1c0de);
    for (let iter = 0; iter < 200; iter += 1) {
      const input = genIrInput(rnd);
      const a = buildIr(input);
      const b = buildIr(input);
      expect(a).toEqual(b);
      expect(a.schemaVersion).toBe(IR_SCHEMA_VERSION);
      expect(a.inputHash).toBe(b.inputHash);
      expect(a.inputHash).toMatch(/^[0-9a-f]{64}$/);
      expect(renderBytes(a)).toBe(renderBytes(b));
      expect(renderBytes(a)).toBe(renderBytes(a)); // repeated renders stable
    }
  });

  it('locked-pack permutation (same multiset, reversed order) leaves the IR and artifacts untouched', () => {
    const rnd = mulberry32(0xabcd);
    for (let iter = 0; iter < 60; iter += 1) {
      const base = genIrInput(rnd);
      const reversed: IrInput = {
        ...base,
        lockfile: { ...base.lockfile, packs: [...base.lockfile.packs].reverse() },
      };
      const a = buildIr(base);
      const b = buildIr(reversed);
      expect(a.inputHash, `iter ${iter}`).toBe(b.inputHash);
      expect(a.lockedPacks).toEqual(b.lockedPacks);
      expect(renderBytes(a)).toBe(renderBytes(b));
    }
  });

  it('no-op regeneration property: rendering an already-generated artifact set twice yields identical bytes', () => {
    const rnd = mulberry32(0x0bad);
    const ir = buildIr(genIrInput(rnd));
    const once = renderBytes(ir);
    const twice = renderBytes(ir);
    expect(twice).toBe(once);
    const artifactPaths = renderPlanningDocuments(ir).map((a) => a.path);
    expect(artifactPaths[0]).toBe('planning/ROADMAP.md');
    expect(artifactPaths[1]).toBe('planning/TRACKER.md');
    expect(artifactPaths[artifactPaths.length - 1]).toBe('planning/handoffs/TEMPLATE.md');
    for (const p of artifactPaths) {
      expect(p).toMatch(/^planning\//);
      expect(p.endsWith('.md')).toBe(true);
    }
  });

  it('sha256Hex/canonicalJson sanity: sorting inputs does not change the hash', () => {
    const objA = { z: [3, 1, 2], a: { y: 1, x: 2 } };
    const objB = { a: { x: 2, y: 1 }, z: [3, 1, 2] };
    expect(canonicalJson(objA)).toBe(canonicalJson(objB));
    expect(sha256Hex(canonicalJson(objA))).toBe(sha256Hex(canonicalJson(objB)));
    expect(sha256Hex('abc')).toHaveLength(64);
  });
});

describe('P-IR-2 malformed input is rejected without a crash', () => {
  it('80 seeded garbage project configs: safeParse decides deterministically, never throws', () => {
    const rnd = mulberry32(0x64a7);
    for (let iter = 0; iter < 80; iter += 1) {
      const mode = iter % 4;
      let raw: unknown;
      if (mode === 0) {
        raw = { schemaVersion: 1, project: { name: 'x' } }; // missing required fields
      } else if (mode === 1) {
        raw = { schemaVersion: 1, project: { name: 'x', lifecycle: 'nope', type: 'y', risk: 'z' } };
      } else if (mode === 2) {
        raw = pick(rnd, [null, 42, 'schemaVersion: 2', [], { schemaVersion: 'x' }]);
      } else {
        raw = genProjectRaw(rnd);
        if (rnd() < 0.5) (raw as Record<string, unknown>).schemaVersion = 2; // future major
      }

      const first = ProjectConfigSchema.safeParse(raw);
      const second = ProjectConfigSchema.safeParse(raw);
      const issueKey = (r: typeof first) =>
        r.success ? 'ok' : JSON.stringify(r.error.issues.map((i) => i.path.join('.')));
      expect(issueKey(second)).toBe(issueKey(first)); // deterministic diagnostics

      if (!first.success) {
        expect(first.error.issues.length).toBeGreaterThan(0);
        continue;
      }
      // Valid configs must compile and render without crashing.
      const ir = buildIr({
        project: first.data,
        resolution: { packs: [], order: [], diagnostics: [], ok: true },
        lockfile: { planmoVersion: '0.0.0', packs: [] },
        profile: null,
        standards: { rules: [], conflicts: [], sources: [] } satisfies StandardsSelection,
      });
      expect(renderPlanningDocuments(ir).length).toBeGreaterThanOrEqual(4);
    }
  });

  it('pathological IR shapes (huge/duplicate/empty phases, garbage locked packs) render deterministically', () => {
    const rnd = mulberry32(0xfeed);
    const base = buildIr(genIrInput(rnd));

    const weirdPhase: PhaseNode = { id: 'x', title: '☃\nline', objective: 'a'.repeat(10_000) };
    const duplicatePhases = [weirdPhase, weirdPhase, weirdPhase];
    const mutated: PlanningIR[] = [
      { ...base, phases: [] as unknown as readonly PhaseNode[] },
      { ...base, phases: duplicatePhases as unknown as readonly PhaseNode[] },
      {
        ...base,
        phases: [
          { id: '00', title: 'T', objective: 'O' },
          { id: '00', title: 'T2', objective: 'a\nb\nc' },
        ] as unknown as readonly PhaseNode[],
      },
      {
        ...base,
        lockedPacks: [
          { ref: ' bad ref ', name: '', version: 'nope', source: 'local' as const },
        ] as unknown as readonly PackLockEntryType[],
      },
      {
        ...base,
        phases: [
          { id: '0'.repeat(10_000), title: '', objective: '' },
        ] as unknown as readonly PhaseNode[],
      },
    ];

    for (const ir of mutated) {
      let artifacts: ReturnType<typeof renderPlanningDocuments>;
      try {
        artifacts = renderPlanningDocuments(ir);
      } catch (err) {
        throw new Error(`render crashed on malformed IR: ${(err as Error).message}`);
      }
      expect(artifacts.length).toBeGreaterThanOrEqual(2);
      expect(renderBytes(ir)).toBe(
        renderPlanningDocuments(ir)
          .map((a) => `${a.path}\u0000${a.content}`)
          .join('\u0001'),
      );
    }
  });

  it('negative: buildIr never mutates or partially consumes its input', () => {
    const rnd = mulberry32(0x5a17);
    const input = genIrInput(rnd);
    const snapshot = JSON.stringify(input);
    buildIr(input);
    buildIr(input);
    expect(JSON.stringify(input)).toBe(snapshot);
  });
});
