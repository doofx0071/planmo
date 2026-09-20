import { describe, expect, it } from 'vitest';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPack, PackLoadError } from './loader.js';

const FIXTURES = resolve(fileURLToPath(new URL('.', import.meta.url)), 'fixtures');

function fixture(ref: string): string {
  return join(FIXTURES, ref);
}

describe('loadPack (P04-01 declarative loader)', () => {
  it('loads and validates a valid stack pack', () => {
    const pack = loadPack(fixture('valid/stack/nextjs'));
    expect(pack.document.ref).toBe('stack/nextjs');
    expect(pack.document.category).toBe('stack');
    expect(pack.document.provides).toContain('stack.nextjs');
  });

  it('computes a deterministic sha256 integrity of the raw pack.yml', () => {
    const a = loadPack(fixture('valid/stack/nextjs'));
    const b = loadPack(fixture('valid/stack/nextjs'));
    expect(a.integritySha256).toBe(b.integritySha256);
    expect(a.integritySha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('validates standards-category content shape (CHG-001 P04-06)', () => {
    const pack = loadPack(fixture('valid/standards/web-security'));
    expect(pack.contentShape?.category).toBe('standards');
    const shape = pack.contentShape;
    expect(shape?.category).toBe('standards');
    const standards = shape?.category === 'standards' ? shape.content.standards : [];
    expect(standards).toHaveLength(2);
    expect(standards[0]?.id).toBe('security.secrets');
  });

  it('validates policy-category content shape (CHG-001 P04-07)', () => {
    const pack = loadPack(fixture('valid/policy/engineering'));
    expect(pack.contentShape?.category).toBe('policy');
    const shape = pack.contentShape;
    const policies = shape?.category === 'policy' ? shape.content.policies : [];
    expect(policies).toHaveLength(2);
    expect(policies[0]?.id).toBe('refactor.scope');
  });

  it('validates context-category declarations (CHG-001 P04-09)', () => {
    const pack = loadPack(fixture('valid/context/agent-memory'));
    const shape = pack.contentShape;
    expect(shape?.category).toBe('context');
    if (shape?.category === 'context') {
      expect(shape.content.context.tokenBudget?.tokens).toBe(16000);
      expect(shape.content.context.progressiveDisclosure).toBe(true);
      expect(shape.content.memory.redactSecrets).toBe(true);
    } else {
      throw new Error('expected a context-category content shape');
    }
  });

  it('loads a pack missing an optional provenance field (local packs)', () => {
    const pack = loadPack(fixture('valid/stack/nextjs'));
    expect(pack.document.provenance).toBeUndefined();
  });
});

describe('loadPack — executable construct rejection (ADR-0004)', () => {
  it('rejects a pack with a scripts block', () => {
    expect(() => loadPack(fixture('malicious/evil-scripts'))).toThrowError(PackLoadError);
  });

  it('rejects a pack with a hooks block', () => {
    expect(() => loadPack(fixture('malicious/evil-hooks'))).toThrowError(PackLoadError);
  });

  it('rejects a pack with an exec/run command', () => {
    expect(() => loadPack(fixture('malicious/exec'))).toThrowError(PackLoadError);
  });

  it('rejects executable constructs buried in nested content (deep scan)', () => {
    const err = () => loadPack(fixture('malicious/scripts-nested'));
    expect(err).toThrowError(PackLoadError);
    try {
      err();
    } catch (e) {
      const loadErr = e as PackLoadError;
      expect(loadErr.kind).toBe('executable');
      expect(loadErr.issues.join()).toContain('hooks');
    }
  });

  it('fails closed on a missing pack.yml', () => {
    expect(() => loadPack(join(FIXTURES, 'valid/stack'))).toThrowError(PackLoadError);
  });
});
