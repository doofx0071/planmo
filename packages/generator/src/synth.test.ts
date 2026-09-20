import { describe, expect, it } from 'vitest';
import type { GeneratedArtifact, GenerationManifestEntry } from './contracts.js';
import type { OwnershipMode } from '@planmo/schema';
import { previewSynth } from './synth.js';

/** Minimal artifact factory shared by the P05-08 preview tests. */
function art(path: string, ownership: OwnershipMode, content = '# artifact\n'): GeneratedArtifact {
  return { path, content, kind: 'planning-doc', ownership, sources: ['pack/planning'] };
}

/** Minimal manifest entry factory (checksum shape mirrors the schema). */
function entry(path: string, ownershipMode: OwnershipMode = 'generated'): GenerationManifestEntry {
  return {
    path,
    kind: 'planning-doc',
    generator: 'planmo',
    sources: [],
    checksum: 'a'.repeat(64),
    ownershipMode,
    generationVersion: '0.0.0',
  };
}

describe('previewSynth — create', () => {
  it('creates a generated artifact when the path is missing', () => {
    const preview = previewSynth([art('planning/ROADMAP.md', 'generated')], { existingPaths: [] });
    expect(preview.changes).toEqual([
      {
        path: 'planning/ROADMAP.md',
        action: 'create',
        ownership: 'generated',
        reason: expect.any(String),
      },
    ]);
    expect(preview.safe).toBe(true);
  });

  it('creates a merged artifact when the path is missing (first seed writes markers)', () => {
    const preview = previewSynth([art('planning/TRACKER.md', 'merged')], { existingPaths: [] });
    expect(preview.changes[0]).toMatchObject({
      path: 'planning/TRACKER.md',
      action: 'create',
      ownership: 'merged',
    });
  });

  it('creates a seeded artifact when the path is missing', () => {
    const preview = previewSynth([art('prompts/onboarding.md', 'seeded')], { existingPaths: [] });
    expect(preview.changes[0]).toMatchObject({
      path: 'prompts/onboarding.md',
      action: 'create',
      ownership: 'seeded',
    });
  });

  it('creates when a stale manifest entry exists but the file is gone from disk', () => {
    const preview = previewSynth([art('planning/ROADMAP.md', 'generated')], {
      existingPaths: [],
      entries: [entry('planning/ROADMAP.md')],
    });
    expect(preview.changes[0]?.action).toBe('create');
  });
});

describe('previewSynth — overwrite', () => {
  it('overwrites a generated artifact that exists and is manifest-managed', () => {
    const preview = previewSynth([art('planning/ROADMAP.md', 'generated')], {
      existingPaths: ['planning/ROADMAP.md'],
      entries: [entry('planning/ROADMAP.md')],
    });
    expect(preview.changes[0]).toMatchObject({
      path: 'planning/ROADMAP.md',
      action: 'overwrite',
      ownership: 'generated',
    });
    expect(preview.safe).toBe(true);
  });

  it('treats the legacy managed mode as a generated alias for overwrite', () => {
    const preview = previewSynth([art('planning/ROADMAP.md', 'managed')], {
      existingPaths: ['planning/ROADMAP.md'],
      entries: [entry('planning/ROADMAP.md')],
    });
    expect(preview.changes[0]?.action).toBe('overwrite');
  });
});

describe('previewSynth — merge', () => {
  it('merges a merged artifact into an existing manifest-managed file', () => {
    const preview = previewSynth([art('planning/README.md', 'merged')], {
      existingPaths: ['planning/README.md'],
      entries: [entry('planning/README.md', 'merged')],
    });
    expect(preview.changes[0]).toMatchObject({
      path: 'planning/README.md',
      action: 'merge',
      ownership: 'merged',
    });
    expect(preview.safe).toBe(true);
  });

  it('treats the legacy merge mode as a merged alias', () => {
    const preview = previewSynth([art('planning/README.md', 'merge')], {
      existingPaths: ['planning/README.md'],
      entries: [entry('planning/README.md', 'merged')],
    });
    expect(preview.changes[0]?.action).toBe('merge');
  });
});

describe('previewSynth — skip', () => {
  it('skips a seeded artifact that already exists (user owns it after seeding)', () => {
    const preview = previewSynth([art('prompts/onboarding.md', 'seeded')], {
      existingPaths: ['prompts/onboarding.md'],
      entries: [entry('prompts/onboarding.md', 'seeded')],
    });
    expect(preview.changes[0]).toMatchObject({
      path: 'prompts/onboarding.md',
      action: 'skip',
      ownership: 'seeded',
    });
    expect(preview.changes[0]?.reason).toContain('user owns');
    expect(preview.safe).toBe(true);
  });

  it('skips a seeded artifact that exists even without a manifest entry', () => {
    const preview = previewSynth([art('prompts/onboarding.md', 'seeded')], {
      existingPaths: ['prompts/onboarding.md'],
    });
    expect(preview.changes[0]?.action).toBe('skip');
  });

  it('never writes a user artifact, even when the path is missing', () => {
    const preview = previewSynth([art('config/custom.yml', 'user')], { existingPaths: [] });
    expect(preview.changes[0]).toMatchObject({
      path: 'config/custom.yml',
      action: 'skip',
      ownership: 'user',
    });
    expect(preview.changes[0]?.reason).toBe('user-owned, not modified');
    expect(preview.safe).toBe(true);
  });

  it('never overwrites a user artifact that exists on disk', () => {
    const preview = previewSynth([art('config/custom.yml', 'user')], {
      existingPaths: ['config/custom.yml'],
    });
    expect(preview.changes[0]?.action).toBe('skip');
  });
});

describe('previewSynth — collision refusal', () => {
  it('refuses to overwrite an unmanaged existing file (generated, not in manifest)', () => {
    const preview = previewSynth([art('planning/ROADMAP.md', 'generated')], {
      existingPaths: ['planning/ROADMAP.md'],
    });
    expect(preview.changes[0]).toMatchObject({
      path: 'planning/ROADMAP.md',
      action: 'collision',
      ownership: 'generated',
    });
    expect(preview.changes[0]?.reason).toBe('unmanaged file — not overwriting');
    expect(preview.safe).toBe(false);
  });

  it('refuses to merge over an unmanaged existing file (merged, not in manifest)', () => {
    const preview = previewSynth([art('planning/README.md', 'merged')], {
      existingPaths: ['planning/README.md'],
    });
    expect(preview.changes[0]?.action).toBe('collision');
    expect(preview.safe).toBe(false);
  });

  it('refuses to overwrite when the manifest records the path as user-owned', () => {
    const preview = previewSynth([art('planning/ROADMAP.md', 'generated')], {
      existingPaths: ['planning/ROADMAP.md'],
      entries: [entry('planning/ROADMAP.md', 'user')],
    });
    expect(preview.changes[0]?.action).toBe('collision');
    expect(preview.changes[0]?.reason).toBe('user-owned per manifest — not overwriting');
  });

  it('treats a missing manifest as no manifest at all', () => {
    const preview = previewSynth([art('planning/ROADMAP.md', 'generated')], {
      existingPaths: ['planning/ROADMAP.md'],
    });
    expect(preview.changes[0]?.action).toBe('collision');
    expect(preview.safe).toBe(false);
  });
});

describe('previewSynth — determinism', () => {
  it('produces identical output for identical inputs', () => {
    const artifacts = [
      art('planning/TRACKER.md', 'generated'),
      art('planning/ROADMAP.md', 'generated'),
      art('prompts/onboarding.md', 'seeded'),
    ];
    const existing = {
      existingPaths: ['planning/TRACKER.md'],
      entries: [entry('planning/TRACKER.md')],
    };
    expect(previewSynth(artifacts, existing)).toEqual(previewSynth(artifacts, existing));
  });

  it('is insensitive to artifact and existing-path input order (path-sorted output)', () => {
    const a = art('planning/ROADMAP.md', 'generated');
    const b = art('planning/TRACKER.md', 'merged');
    const c = art('prompts/onboarding.md', 'seeded');
    const forward = previewSynth([a, b, c], {
      existingPaths: ['planning/TRACKER.md'],
      entries: [entry('planning/TRACKER.md', 'merged')],
    });
    const reversed = previewSynth([c, b, a], {
      existingPaths: ['planning/TRACKER.md'],
      entries: [entry('planning/TRACKER.md', 'merged')],
    });
    expect(forward).toEqual(reversed);
    expect(forward.changes.map((change) => change.path)).toEqual([
      'planning/ROADMAP.md',
      'planning/TRACKER.md',
      'prompts/onboarding.md',
    ]);
  });

  it('emits exactly one change for a duplicate artifact path (stable first-wins)', () => {
    const preview = previewSynth(
      [
        art('planning/ROADMAP.md', 'seeded', '# seeded'),
        art('planning/ROADMAP.md', 'generated', '# generated'),
      ],
      { existingPaths: ['planning/ROADMAP.md'] },
    );
    expect(preview.changes).toHaveLength(1);
    // 'generated' < 'seeded' lexicographically, so the generated artifact wins.
    expect(preview.changes[0]).toMatchObject({
      path: 'planning/ROADMAP.md',
      ownership: 'generated',
      action: 'collision',
    });
  });
});

describe('previewSynth — empty artifacts', () => {
  it('returns an empty, safe preview', () => {
    expect(previewSynth([], { existingPaths: [] })).toEqual({
      changes: [],
      safe: true,
      summary: [],
    });
  });
});

describe('previewSynth — summary', () => {
  it('emits one deterministic, human-readable line per change', () => {
    const preview = previewSynth(
      [art('planning/TRACKER.md', 'generated'), art('prompts/onboarding.md', 'seeded')],
      { existingPaths: ['prompts/onboarding.md'] },
    );
    expect(preview.summary).toEqual([
      'create planning/TRACKER.md: missing on disk — will be created',
      'skip prompts/onboarding.md: seeded — user owns the file after first creation',
    ]);
  });
});

describe('previewSynth — safe flag', () => {
  it('is true for a collision-free plan mixing create/overwrite/merge/skip', () => {
    const preview = previewSynth(
      [art('planning/ROADMAP.md', 'generated'), art('config/custom.yml', 'user')],
      { existingPaths: [], entries: [] },
    );
    expect(preview.safe).toBe(true);
  });

  it('is false when any single change is a collision', () => {
    const preview = previewSynth(
      [art('planning/ROADMAP.md', 'generated', '# ro'), art('config/custom.yml', 'user')],
      { existingPaths: ['planning/ROADMAP.md'] },
    );
    expect(preview.safe).toBe(false);
  });
});
