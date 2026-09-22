import { describe, expect, it } from 'vitest';
import { EXPORT_ADDITIVE_NOTE, EXPORT_PATH_PREFIX, renderGithubExport } from './github-export.js';

const baseInput = {
  owner: 'acme',
  repo: 'my-proj',
  branch: 'main',
  summaryLines: ['Adds planning artifacts from Phase 11'],
  files: [{ path: 'artifacts/planning/phase-11.md', content: '# Phase 11' }],
};

describe('renderGithubExport (P11-05 additive export prototype)', () => {
  it('renders the full additive payload with a deterministic title and body', () => {
    const payload = renderGithubExport(baseInput);

    expect(payload.owner).toBe('acme');
    expect(payload.repo).toBe('my-proj');
    expect(payload.branch).toBe('main');
    expect(payload.title).toBe('feat: my-proj planning artifacts (planmo)');
    expect(payload.body).toContain(EXPORT_ADDITIVE_NOTE);
    expect(payload.body).toContain('- Adds planning artifacts from Phase 11');
    expect(payload.files).toEqual([
      { path: 'artifacts/planning/phase-11.md', content: '# Phase 11' },
    ]);
  });

  it('sorts files deterministically by path, then content', () => {
    const payload = renderGithubExport({
      ...baseInput,
      files: [
        { path: 'artifacts/z.md', content: 'bb' },
        { path: 'artifacts/a.md', content: 'zz' },
        { path: 'artifacts/a.md', content: 'aa' },
      ],
    });

    expect(payload.files.map((f) => `${f.path}:${f.content}`)).toEqual([
      'artifacts/a.md:aa',
      'artifacts/a.md:zz',
      'artifacts/z.md:bb',
    ]);
  });

  it('accepts deep nested paths inside the artifacts/ prefix', () => {
    const payload = renderGithubExport({
      ...baseInput,
      files: [{ path: 'artifacts/deep/nested/file.md', content: 'x' }],
    });
    expect(payload.files[0]?.path).toBe('artifacts/deep/nested/file.md');
  });

  it('rejects parent traversal and paths outside artifacts/', () => {
    const badPaths = [
      'artifacts/../secret.md',
      'artifacts/a/../../b.md',
      '../secret.md',
      'secret.md',
      'artifacts/a\\b.md',
    ];
    for (const path of badPaths) {
      expect(() => renderGithubExport({ ...baseInput, files: [{ path, content: 'x' }] })).toThrow(
        /unsafe export path/,
      );
    }
  });

  it('body is never empty, even with no summary lines and no files', () => {
    const payload = renderGithubExport({
      owner: 'acme',
      repo: 'my-proj',
      branch: 'main',
      summaryLines: [],
      files: [],
    });
    expect(payload.body).toBe(EXPORT_ADDITIVE_NOTE);
    expect(payload.body.length).toBeGreaterThan(0);
    expect(payload.files).toEqual([]);
  });

  it('filters out empty summary lines before rendering bullets', () => {
    const payload = renderGithubExport({
      ...baseInput,
      summaryLines: ['', 'done', ''],
      files: [],
    });
    expect(payload.body).toBe(`${EXPORT_ADDITIVE_NOTE}\n\n- done`);
  });

  it('deterministic: identical inputs → identical payloads', () => {
    const a = renderGithubExport(baseInput);
    const b = renderGithubExport(baseInput);
    expect(a).toEqual(b);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('always scopes exported paths under the single artifacts/ prefix', () => {
    expect(EXPORT_PATH_PREFIX).toBe('artifacts/');
    const payload = renderGithubExport(baseInput);
    for (const file of payload.files) {
      expect(file.path.startsWith(EXPORT_PATH_PREFIX)).toBe(true);
      expect(file.path.split('/').includes('..')).toBe(false);
    }
  });
});
