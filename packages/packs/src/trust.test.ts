import { describe, expect, it } from 'vitest';
import type { TrustInput } from './phase11-contracts.js';
import { classifyTrust, formatTrust } from './trust.js';

const BUILTIN_REASON = 'builtin packs ship with PlanMo and require no review';
const LOCAL_REASON = 'local packs are authored on this machine and require no review';
const VERIFIED_SOURCE_REASON =
  "declared 'verified-source' is reserved for a future signing design and is not assignable to remote packs; classified as third-party";
const NO_INTEGRITY_REASON =
  'remote pack has no integrity checksum; integrity is required for remote packs';
const INTEGRITY_REASON = 'remote pack integrity checksum is present';
const REVIEW_REASON = 'third-party packs always require review and this cannot be disabled';

describe('classifyTrust (P11-01 deterministic trust model)', () => {
  it('classifies builtin packs as builtin with no review', () => {
    const result = classifyTrust({ source: 'builtin' });
    expect(result).toEqual({
      trustLevel: 'builtin',
      requiresReview: false,
      reasons: [BUILTIN_REASON],
    });
  });

  it('classifies local packs as local with no review', () => {
    const result = classifyTrust({ source: 'local' });
    expect(result).toEqual({ trustLevel: 'local', requiresReview: false, reasons: [LOCAL_REASON] });
  });

  it('ignores provenance for builtin/local sources', () => {
    expect(
      classifyTrust({
        source: 'builtin',
        provenance: { source: 'registry' },
        declaredTrust: 'verified-source',
      }),
    ).toEqual({ trustLevel: 'builtin', requiresReview: false, reasons: [BUILTIN_REASON] });
    expect(
      classifyTrust({
        source: 'local',
        provenance: { source: 'git' },
        declaredTrust: 'verified-source',
      }),
    ).toEqual({ trustLevel: 'local', requiresReview: false, reasons: [LOCAL_REASON] });
  });

  it('NEGATIVE: remote declaring verified-source provenance is downgraded to third-party with review', () => {
    const input: TrustInput = {
      source: 'registry',
      provenance: {
        source: 'registry',
        url: 'https://registry.example/packs',
        integrity: { algorithm: 'sha256', digest: 'a'.repeat(64) },
        trustLevel: 'verified-source',
      },
    };
    const result = classifyTrust(input);
    expect(result.trustLevel).toBe('third-party');
    expect(result.requiresReview).toBe(true);
    expect(result.reasons).toContain(VERIFIED_SOURCE_REASON);
    expect(result.reasons).toContain(REVIEW_REASON);
  });

  it('NEGATIVE: remote declaring verified-source via declaredTrust is downgraded the same way', () => {
    const result = classifyTrust({
      source: 'git',
      provenance: { source: 'git', url: 'https://git.example/packs' },
      declaredTrust: 'verified-source',
    });
    expect(result.trustLevel).toBe('third-party');
    expect(result.requiresReview).toBe(true);
    expect(result.reasons).toContain(VERIFIED_SOURCE_REASON);
  });

  it('NEGATIVE: any non-third-party trust level on a remote is unassignable and downgraded', () => {
    for (const level of ['builtin', 'local'] as const) {
      const result = classifyTrust({
        source: 'registry',
        provenance: { source: 'registry', url: 'https://registry.example/packs' },
        declaredTrust: level,
      });
      expect(result.trustLevel).toBe('third-party');
      expect(result.requiresReview).toBe(true);
      expect(result.reasons).toContain(
        `declared trust level '${level}' is not assignable to remote packs; classified as third-party`,
      );
    }
  });

  it('NEGATIVE: remote without integrity checksum requires review and surfaces the missing integrity', () => {
    const result = classifyTrust({
      source: 'registry',
      provenance: { source: 'registry', url: 'https://registry.example/packs' },
      declaredTrust: 'third-party',
    });
    expect(result.trustLevel).toBe('third-party');
    expect(result.requiresReview).toBe(true);
    expect(result.reasons).toContain(NO_INTEGRITY_REASON);
  });

  it('NEGATIVE: remote without any provenance at all still requires review', () => {
    const result = classifyTrust({ source: 'git' });
    expect(result.trustLevel).toBe('third-party');
    expect(result.requiresReview).toBe(true);
    expect(result.reasons).toEqual([NO_INTEGRITY_REASON, REVIEW_REASON].sort());
  });

  it('remote with integrity + third-party declared requires review and CANNOT be disabled', () => {
    const input: TrustInput = {
      source: 'registry',
      provenance: {
        source: 'registry',
        url: 'https://registry.example/packs',
        integrity: { algorithm: 'sha256', digest: 'a'.repeat(64) },
        trustLevel: 'third-party',
      },
      declaredTrust: 'third-party',
    };
    const result = classifyTrust(input);
    expect(result.trustLevel).toBe('third-party');
    expect(result.requiresReview).toBe(true);
    expect(result.reasons).toContain(INTEGRITY_REASON);
    expect(result.reasons).toContain(REVIEW_REASON);
  });

  it('remote defaults to third-party review when nothing is declared', () => {
    const result = classifyTrust({
      source: 'git',
      provenance: {
        source: 'git',
        url: 'https://git.example/packs',
        integrity: { algorithm: 'sha256', digest: 'b'.repeat(64) },
      },
    });
    expect(result.trustLevel).toBe('third-party');
    expect(result.requiresReview).toBe(true);
    expect(result.reasons).toEqual([INTEGRITY_REASON, REVIEW_REASON].sort());
  });

  it('reasons are sorted and stable for identical inputs', () => {
    const input: TrustInput = {
      source: 'registry',
      provenance: {
        source: 'registry',
        url: 'https://registry.example/packs',
        integrity: { algorithm: 'sha256', digest: 'c'.repeat(64) },
        trustLevel: 'verified-source',
      },
    };
    const a = classifyTrust(input);
    const b = classifyTrust(input);
    expect(a).toEqual(b);
    const sorted = [...a.reasons].sort((x, y) => (x < y ? -1 : x > y ? 1 : 0));
    expect([...a.reasons]).toEqual(sorted);
    expect(a.reasons.length).toBe(3);
  });
});

describe('formatTrust (deterministic one-liner)', () => {
  it('renders a no-review classification', () => {
    expect(formatTrust(classifyTrust({ source: 'builtin' }))).toBe(
      `builtin (no review): ${BUILTIN_REASON}`,
    );
  });

  it('renders a review-required classification with sorted reasons joined by "; "', () => {
    const c = classifyTrust({
      source: 'registry',
      provenance: { source: 'registry', url: 'https://registry.example/packs' },
      declaredTrust: 'verified-source',
    });
    expect(formatTrust(c)).toBe(`third-party (review required): ${c.reasons.join('; ')}`);
    expect(formatTrust(c)).toContain(REVIEW_REASON);
  });

  it('is byte-stable for identical classifications', () => {
    const input: TrustInput = { source: 'local' };
    expect(formatTrust(classifyTrust(input))).toBe(formatTrust(classifyTrust(input)));
  });
});
