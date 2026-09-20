import { describe, expect, it } from 'vitest';
import { AiProposalSchema, ContextBundleSchema } from './index.js';

function roundTripJson<T>(schema: { parse: (v: unknown) => T }, value: object): T {
  return schema.parse(JSON.parse(JSON.stringify(value)));
}

describe('AiProposalSchema (P06-06)', () => {
  const valid = {
    schemaVersion: 1,
    agent: 'opencode',
    requestId: 'req-001',
    items: [
      {
        id: 'p1',
        summary: 'Add retry with exponential backoff to the fetch client',
        rationale: 'Observed intermittent timeouts on slow networks.',
        references: ['REQ-GEN-004'],
      },
    ],
  };

  it('parses and round-trips a valid proposal', () => {
    const parsed = roundTripJson(AiProposalSchema, valid);
    expect(parsed.items[0]?.id).toBe('p1');
    expect(parsed.items[0]?.status).toBe('proposed');
  });

  it('rejects unknown top-level keys', () => {
    expect(() => AiProposalSchema.parse({ ...valid, execute: true })).toThrow();
  });

  it('rejects items with unknown keys', () => {
    expect(() =>
      AiProposalSchema.parse({
        ...valid,
        items: [{ ...valid.items[0], command: 'rm -rf /' }],
      }),
    ).toThrow();
  });

  it('rejects an empty summary', () => {
    expect(() =>
      AiProposalSchema.parse({ ...valid, items: [{ ...valid.items[0], summary: ' ' }] }),
    ).toThrow();
  });

  it('accepts explicit accepted/rejected statuses', () => {
    const parsed = roundTripJson(AiProposalSchema, {
      ...valid,
      items: [{ ...valid.items[0], status: 'rejected' }],
    });
    expect(parsed.items[0]?.status).toBe('rejected');
  });
});

describe('ContextBundleSchema (P06-07)', () => {
  const valid = {
    schemaVersion: 1,
    project: 'acme-web',
    contextId: 'phase-03',
    l0Capsule: 'Acme web; phase 03; branch feat/auth; blockers: none.',
    l1Index: 'REQ-GEN-004; ADR-0012; standards: sec-basic.',
    l2Evidence: '',
    estimatedTokens: 1200,
    budgetTokens: 8000,
    retrievalHandles: ['docs/12-adrs/ADR-0012.md', 'planning/TRACKER.md'],
  };

  it('parses and round-trips a valid bundle', () => {
    const parsed = roundTripJson(ContextBundleSchema, valid);
    expect(parsed.l0Capsule).toContain('Acme web');
    expect(parsed.retrievalHandles).toHaveLength(2);
  });

  it('rejects unknown keys', () => {
    expect(() => ContextBundleSchema.parse({ ...valid, raw: 'x' })).toThrow();
  });

  it('rejects negative token estimates', () => {
    expect(() => ContextBundleSchema.parse({ ...valid, estimatedTokens: -1 })).toThrow();
  });

  it('accepts an empty evidence layer (budget-constrained)', () => {
    const parsed = roundTripJson(ContextBundleSchema, { ...valid, l2Evidence: '' });
    expect(parsed.l2Evidence).toBe('');
  });
});
