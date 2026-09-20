import { describe, expect, it } from 'vitest';
import { PLANNING_DEPTHS } from '@planmo/schema';
import { allPlanningProfiles, compileAllProfiles, compilePlanningProfile } from './profiles.js';

describe('compilePlanningProfile (P04-04 planning-depth profiles)', () => {
  it('compiles all four predefined depths (exit gate: predictable compile)', () => {
    for (const depth of ['lean', 'standard', 'production', 'high-assurance']) {
      const profile = compilePlanningProfile(depth as never);
      expect(profile).not.toBeNull();
      expect(profile?.id).toBe(depth);
      expect(profile?.requiredDocuments.length).toBeGreaterThan(0);
      expect(profile?.gates.length).toBeGreaterThan(0);
    }
  });

  it('compiles predictably: same depth → structurally identical profile', () => {
    for (const depth of PLANNING_DEPTHS) {
      const a = compilePlanningProfile(depth);
      const b = compilePlanningProfile(depth);
      expect(a).toEqual(b);
    }
  });

  it('returns null for a custom depth (no predefined profile)', () => {
    expect(compilePlanningProfile('custom')).toBeNull();
  });

  it('strictly increases required documents/gates from lean to high-assurance', () => {
    const lean = compilePlanningProfile('lean')!;
    const ha = compilePlanningProfile('high-assurance')!;
    expect(ha.requiredDocuments.length).toBeGreaterThan(lean.requiredDocuments.length);
    expect(ha.gates.length).toBeGreaterThan(lean.gates.length);
    expect(lean.requireSecurityReview).toBe(false);
    expect(ha.requireSecurityReview).toBe(true);
    expect(lean.requireTraceability).toBe(false);
    expect(ha.requireTraceability).toBe(true);
  });

  it('maps every predefined depth id to a profile (deterministic enumeration)', () => {
    const profiles = allPlanningProfiles();
    expect(profiles.map((p) => p.id)).toEqual(['lean', 'standard', 'production', 'high-assurance']);
    expect(Object.keys(compileAllProfiles()).sort()).toEqual([
      'high-assurance',
      'lean',
      'production',
      'standard',
    ]);
  });
});
