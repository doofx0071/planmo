import { describe, expect, it } from 'vitest';
import { expectRejected, roundTripJson } from './test-utils.js';
import {
  ContextMemoryPolicySchema,
  EngineeringPolicyEntrySchema,
  EngineeringPolicyContentSchema,
  PackContentShapeSchema,
  StandardRuleSchema,
  StandardsPackContentSchema,
} from './pack-content.js';
import { PackSchema } from './pack-design.js';

describe('StandardRuleSchema', () => {
  const valid = {
    id: 'react.hooks-order',
    class: 'framework',
    precedence: 'stack-framework',
    rule: 'Hooks must be called at the top level of a component.',
    appliesTo: { stack: ['react'], risk: ['high'] },
    rationale: 'Violations break React state integrity.',
  };

  it('parses and round-trips a structured standard', () => {
    const parsed = roundTripJson(StandardRuleSchema, valid);
    expect(parsed.id).toBe('react.hooks-order');
    expect(parsed.appliesTo?.stack).toEqual(['react']);
  });

  it('rejects a blank rule (vague prose guard)', () => {
    expectRejected(StandardRuleSchema, { ...valid, rule: '   ' });
  });

  it('rejects an unknown precedence tier', () => {
    expectRejected(StandardRuleSchema, { ...valid, precedence: 'maybe' });
  });

  it('rejects an unknown standard class', () => {
    expectRejected(StandardRuleSchema, { ...valid, class: 'opinions' });
  });
});

describe('StandardsPackContentSchema', () => {
  it('parses a standards pack body', () => {
    const parsed = StandardsPackContentSchema.parse({
      standards: [
        { id: 'r1', class: 'language', precedence: 'language', rule: 'Use strict mode.' },
      ],
    });
    expect(parsed.standards).toHaveLength(1);
  });

  it('defaults to an empty standards list', () => {
    expect(StandardsPackContentSchema.parse({}).standards).toEqual([]);
  });

  it('rejects an unknown content key (strict)', () => {
    expectRejected(StandardsPackContentSchema, { standards: [], scripts: {} });
  });
});

describe('EngineeringPolicyContentSchema', () => {
  it('parses a policy entry with scope-default precedence', () => {
    const parsed = EngineeringPolicyContentSchema.parse({
      policies: [
        { id: 'refactor.scope', scope: 'project', rule: 'No unrelated stylistic refactors.' },
      ],
    });
    expect(parsed.policies[0]?.precedence).toBeUndefined();
  });

  it('rejects an invalid scope', () => {
    expectRejected(EngineeringPolicyEntrySchema, {
      id: 'x',
      scope: 'team',
      rule: 'r',
    });
  });
});

describe('ContextMemoryPolicySchema (declarations only)', () => {
  it('parses context + memory declarations', () => {
    const parsed = ContextMemoryPolicySchema.parse({
      context: { tokenBudget: { tokens: 16000 }, progressiveDisclosure: true },
      memory: { allowedScopes: ['project', 'package'], requireProvenance: true },
    });
    expect(parsed.memory.allowedScopes).toEqual(['project', 'package']);
  });

  it('defaults progressive disclosure and redaction to on', () => {
    const parsed = ContextMemoryPolicySchema.parse({});
    expect(parsed.context.progressiveDisclosure).toBe(true);
    expect(parsed.memory.redactSecrets).toBe(true);
  });

  it('rejects a non-positive token budget', () => {
    expectRejected(ContextMemoryPolicySchema, { context: { tokenBudget: { tokens: 0 } } });
  });

  it('rejects unknown memory scope values', () => {
    expectRejected(ContextMemoryPolicySchema, { memory: { allowedScopes: ['org'] } });
  });
});

describe('PackContentShapeSchema (category discrimination)', () => {
  it('validates standards-category content', () => {
    const parsed = PackContentShapeSchema.parse({
      category: 'standards',
      content: {
        standards: [
          { id: 's1', class: 'security', precedence: 'security', rule: 'No secrets in logs.' },
        ],
      },
    });
    expect(parsed.category).toBe('standards');
  });

  it('validates policy-category content', () => {
    const parsed = PackContentShapeSchema.parse({
      category: 'policy',
      content: { policies: [{ id: 'p1', scope: 'global', rule: 'Determinism first.' }] },
    });
    expect(parsed.category).toBe('policy');
  });

  it('validates context-category content', () => {
    const parsed = PackContentShapeSchema.parse({
      category: 'context',
      content: { context: { tokenBudget: { tokens: 8000 } }, memory: {} },
    });
    expect(parsed.category).toBe('context');
  });

  it('rejects content shape mismatched to its category', () => {
    expectRejected(PackContentShapeSchema, {
      category: 'standards',
      content: { policies: [{ id: 'p1', scope: 'global', rule: 'x' }] },
    });
  });

  it('rejects non-policy categories in the discriminated union', () => {
    expectRejected(PackContentShapeSchema, { category: 'design', content: {} });
  });
});

describe('PackSchema with provenance (CHG-001 P04-08)', () => {
  const base = {
    schemaVersion: 1,
    ref: 'stack/nextjs',
    name: 'Next.js Stack Pack',
    version: '1.0.0',
    category: 'stack',
    description: 'Next.js conventions.',
  };

  it('accepts optional remote provenance', () => {
    const parsed = PackSchema.parse({
      ...base,
      provenance: {
        source: 'registry',
        url: 'https://registry.example.com/packs/stack-nextjs',
        author: 'planmo',
        publishedAt: '2026-09-01T00:00:00Z',
        integrity: { algorithm: 'sha256', digest: 'a'.repeat(64) },
      },
    });
    expect(parsed.provenance?.source).toBe('registry');
  });

  it('rejects non-url provenance origins', () => {
    expectRejected(PackSchema, {
      ...base,
      provenance: { source: 'registry', url: 'not-a-url' },
    });
  });
});
