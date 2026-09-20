import { describe, expect, it } from 'vitest';
import { ChangePackageSchema, RequirementDelta, CHANGE_DELTA_KINDS } from './index.js';

const validChange = {
  schemaVersion: 1,
  id: 'CHG-001',
  status: 'proposed',
  slug: 'quality-context-governance',
  proposal: 'Upgrade quality/context/memory/governance across phases 04-12.',
  requirementDeltas: [
    { kind: 'ADDED', requirementId: 'REQ-DESIGN-004', detail: 'New design requirement' },
  ],
};

describe('ChangePackageSchema (P08-11)', () => {
  it('parses the canonical change-package shape', () => {
    const pkg = ChangePackageSchema.parse(validChange);
    expect(pkg.id).toBe('CHG-001');
    expect(pkg.status).toBe('proposed');
    expect(pkg.requirementDeltas[0]?.kind).toBe('ADDED');
  });

  it('requires at least one requirement delta', () => {
    const result = ChangePackageSchema.safeParse({
      ...validChange,
      requirementDeltas: [],
    });
    expect(result.success).toBe(false);
  });

  it('accepts all delta kinds', () => {
    for (const kind of CHANGE_DELTA_KINDS) {
      const delta = RequirementDelta.parse({
        kind,
        requirementId: 'REQ-X-001',
        detail: `delta ${kind}`,
      });
      expect(delta.kind).toBe(kind);
    }
  });

  it('rejects an unknown delta kind', () => {
    const result = RequirementDelta.safeParse({
      kind: 'UPDATED',
      requirementId: 'REQ-X-001',
      detail: 'nope',
    });
    expect(result.success).toBe(false);
  });

  it('rejects unknown fields (strict)', () => {
    const result = ChangePackageSchema.safeParse({ ...validChange, bogus: true });
    expect(result.success).toBe(false);
  });

  it('applied changes carry a decision record (provenance)', () => {
    const applied = ChangePackageSchema.parse({
      ...validChange,
      status: 'applied',
      decision: 'ACCEPTED 2026-09-21: all 11 phase-08 tasks DONE.',
    });
    expect(applied.decision).toMatch(/ACCEPTED/);
  });
});