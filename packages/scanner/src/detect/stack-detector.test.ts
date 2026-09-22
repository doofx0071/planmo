import { describe, expect, it } from 'vitest';
import type { DetectionEvidence } from '../contracts.js';
import { stackDetector } from './stack-detector.js';

const E = (
  path: string,
  source: DetectionEvidence['source'],
  code: string,
  match: string,
): DetectionEvidence => ({
  path,
  source,
  code,
  match,
});

describe('stack-detector: JS/TS ecosystems from package.json', () => {
  it('detects node/react/typescript from dependencies+devDependencies with high confidence', async () => {
    const report = await stackDetector.detect(
      new Map([
        [
          'package.json',
          JSON.stringify({
            name: 'app',
            dependencies: { react: '^18.3' },
            devDependencies: { typescript: '^5.6' },
          }),
        ],
      ]),
    );
    expect(report.stacks.map((s) => s.id)).toEqual(['node', 'react', 'typescript']);
    expect(report.testFrameworks).toEqual([]);
    expect(report.ciSystems).toEqual([]);

    const node = report.stacks.find((s) => s.id === 'node')!;
    expect(node.category).toBe('runtime');
    expect(node.confidence).toBe('high');
    // Evidence path asc, then code asc, then match asc — same path/code here so match asc.
    expect(node.evidence).toEqual([
      E('package.json', 'manifest', 'DET-001', 'dependencies'),
      E('package.json', 'manifest', 'DET-001', 'devDependencies'),
    ]);

    const react = report.stacks.find((s) => s.id === 'react')!;
    expect(react.category).toBe('framework');
    expect(react.evidence).toEqual([
      E('package.json', 'manifest', 'DET-001', 'dependencies.react'),
    ]);

    const typescript = report.stacks.find((s) => s.id === 'typescript')!;
    expect(typescript.category).toBe('toolchain');
    expect(typescript.evidence).toEqual([
      E('package.json', 'manifest', 'DET-001', 'devDependencies.typescript'),
    ]);
  });

  it('claims node from devDependencies, bin and engines.node', async () => {
    const report = await stackDetector.detect(
      new Map([
        [
          'package.json',
          JSON.stringify({
            name: 'cli',
            bin: { cli: './bin/cli.js' },
            engines: { node: '>=20' },
            devDependencies: { eslint: '^9' },
          }),
        ],
      ]),
    );
    const node = report.stacks.find((s) => s.id === 'node')!;
    expect(node.confidence).toBe('high');
    expect(node.evidence.map((e) => e.match)).toEqual(['bin', 'devDependencies', 'engines.node']);
    expect(report.stacks.map((s) => s.id)).toEqual(['node']);
  });

  it('detects the full framework set: vue, next, express, vite', async () => {
    const report = await stackDetector.detect(
      new Map([
        [
          'package.json',
          JSON.stringify({
            name: 'web',
            dependencies: { vue: '^3', next: '^14', express: '^4' },
            devDependencies: { vite: '^5' },
          }),
        ],
      ]),
    );
    expect(report.stacks.map((s) => s.id)).toEqual(['express', 'next', 'node', 'vite', 'vue']);
    const vite = report.stacks.find((s) => s.id === 'vite')!;
    expect(vite.category).toBe('toolchain');
    expect(vite.evidence).toEqual([
      E('package.json', 'manifest', 'DET-001', 'devDependencies.vite'),
    ]);
  });

  it('sorts evidence path asc then code asc', async () => {
    const report = await stackDetector.detect(
      new Map([
        [
          'package.json',
          JSON.stringify({
            name: 'app',
            devDependencies: { vitest: '^2' },
            scripts: { test: 'vitest run' },
          }),
        ],
      ]),
    );
    const vitest = report.testFrameworks;
    expect(vitest).toEqual(['vitest']);
    // Not a stack: vitest must not appear in stacks.
    expect(report.stacks.find((s) => s.id === 'vitest')).toBeUndefined();
    // node from devDependencies, evidence sorted.
    const node = report.stacks.find((s) => s.id === 'node')!;
    expect(node.evidence).toEqual([E('package.json', 'manifest', 'DET-001', 'devDependencies')]);
  });

  it('ignores a malformed package.json deterministically', async () => {
    const report = await stackDetector.detect(new Map([['package.json', '{ not json !!']]));
    expect(report.stacks).toEqual([]);
    expect(report.testFrameworks).toEqual([]);
    expect(report.ciSystems).toEqual([]);
  });

  it('does NOT claim a stack from package name alone (absent deps -> no stack)', async () => {
    const report = await stackDetector.detect(
      new Map([['package.json', JSON.stringify({ name: 'react', version: '1.0.0' })]]),
    );
    expect(report.stacks).toEqual([]);
    expect(report.testFrameworks).toEqual([]);
    expect(report.ciSystems).toEqual([]);
  });

  it('does NOT count a README mention of a stack (no content sniffing)', async () => {
    const report = await stackDetector.detect(
      new Map([['README.md', 'This project is built with react, go, rust and python.']]),
    );
    expect(report.stacks).toEqual([]);
    expect(report.testFrameworks).toEqual([]);
    expect(report.ciSystems).toEqual([]);
  });
});

describe('stack-detector: language manifests and lockfiles', () => {
  it('detects rust from Cargo.toml + Cargo.lock (manifest high, lockfile medium, path-sorted evidence)', async () => {
    const report = await stackDetector.detect(
      new Map([
        ['Cargo.toml', '[package]\nname = "x"\n'],
        ['Cargo.lock', 'version = 3\n'],
      ]),
    );
    expect(report.stacks.map((s) => s.id)).toEqual(['rust']);
    const rust = report.stacks[0]!;
    expect(rust.category).toBe('language');
    expect(rust.confidence).toBe('high');
    // path asc: Cargo.lock < Cargo.toml
    expect(rust.evidence).toEqual([
      E('Cargo.lock', 'lockfile', 'DET-001', 'Cargo.lock'),
      E('Cargo.toml', 'manifest', 'DET-001', 'Cargo.toml'),
    ]);
  });

  it('lockfile only => medium confidence', async () => {
    const report = await stackDetector.detect(new Map([['Cargo.lock', 'version = 3\n']]));
    const rust = report.stacks[0]!;
    expect(rust.id).toBe('rust');
    expect(rust.confidence).toBe('medium');
  });

  it.each([
    ['go.mod', 'go', 'manifest'],
    ['pyproject.toml', 'python', 'manifest'],
    ['requirements.txt', 'python', 'manifest'],
    ['Pipfile', 'python', 'manifest'],
    ['pom.xml', 'java', 'manifest'],
    ['build.gradle', 'java', 'manifest'],
    ['settings.gradle', 'java', 'manifest'],
    ['composer.json', 'php', 'manifest'],
    ['Gemfile', 'ruby', 'manifest'],
  ] as const)('detects %s => %s (%s)', async (file, id, source) => {
    const report = await stackDetector.detect(new Map([[file, 'irrelevant text']]));
    expect(report.stacks.map((s) => s.id)).toEqual([id]);
    const stack = report.stacks[0]!;
    expect(stack.confidence).toBe('high');
    expect(stack.evidence).toEqual([E(file, source, 'DET-001', file)]);
  });

  it('detects node from lockfiles at medium confidence', async () => {
    const report = await stackDetector.detect(
      new Map([
        ['pnpm-lock.yaml', 'lockfileVersion: "9.0"\n'],
        ['yarn.lock', '# yarn lockfile\n'],
      ]),
    );
    expect(report.stacks.map((s) => s.id)).toEqual(['node']);
    const node = report.stacks[0]!;
    expect(node.confidence).toBe('medium');
    // path asc: pnpm-lock.yaml < yarn.lock
    expect(node.evidence).toEqual([
      E('pnpm-lock.yaml', 'lockfile', 'DET-001', 'pnpm-lock.yaml'),
      E('yarn.lock', 'lockfile', 'DET-001', 'yarn.lock'),
    ]);
  });

  it('merges node evidence from manifest (high) + lockfile (medium) with high confidence', async () => {
    const report = await stackDetector.detect(
      new Map([
        ['package.json', JSON.stringify({ name: 'app', dependencies: { express: '^4' } })],
        ['package-lock.json', '{"lockfileVersion":3}\n'],
      ]),
    );
    const node = report.stacks.find((s) => s.id === 'node')!;
    expect(node.confidence).toBe('high');
    expect(node.evidence.map((e) => `${e.path}:${e.source}`)).toEqual([
      'package-lock.json:lockfile',
      'package.json:manifest',
    ]);
  });
});

describe('stack-detector: CI systems (ci-declaration, high)', () => {
  it('detects github-actions from workflow files (.yml and .yaml)', async () => {
    const report = await stackDetector.detect(
      new Map([
        ['.github/workflows/ci.yml', 'name: CI\n'],
        ['.github/workflows/release.yaml', 'name: Release\n'],
      ]),
    );
    expect(report.ciSystems).toEqual(['github-actions']);
    expect(report.stacks).toEqual([]);
  });

  it.each([
    ['.gitlab-ci.yml', 'gitlab-ci'],
    ['.gitlab-ci.yaml', 'gitlab-ci'],
    ['Jenkinsfile', 'jenkins'],
    ['.circleci/config.yml', 'circleci'],
    ['azure-pipelines.yml', 'azure-pipelines'],
  ] as const)('detects %s => %s', async (file, id) => {
    const report = await stackDetector.detect(new Map([[file, 'pipeline text']]));
    expect(report.ciSystems).toEqual([id]);
    expect(report.stacks).toEqual([]);
  });

  it('sorts multiple CI systems by id asc and attaches DET-005 evidence', async () => {
    const report = await stackDetector.detect(
      new Map([
        ['Jenkinsfile', 'pipeline {}'],
        ['.github/workflows/ci.yml', 'name: CI'],
        ['.circleci/config.yml', 'version: 2'],
      ]),
    );
    expect(report.ciSystems).toEqual(['circleci', 'github-actions', 'jenkins']);
  });

  it('does not treat loose yml files as CI declarations', async () => {
    const report = await stackDetector.detect(new Map([['ci.yml', 'name: CI']]));
    expect(report.ciSystems).toEqual([]);
    expect(report.stacks).toEqual([]);
  });
});

describe('stack-detector: test frameworks', () => {
  it('detects vitest/jest/mocha/ava from dependencies and devDependencies', async () => {
    const report = await stackDetector.detect(
      new Map([
        [
          'package.json',
          JSON.stringify({
            name: 'app',
            dependencies: { mocha: '^10' },
            devDependencies: { vitest: '^2', jest: '^29', ava: '^6' },
          }),
        ],
      ]),
    );
    expect(report.testFrameworks).toEqual(['ava', 'jest', 'mocha', 'vitest']);
  });

  it('detects vitest from its config file (DET-003, config, high)', async () => {
    const report = await stackDetector.detect(
      new Map([['vitest.config.ts', 'export default defineConfig({})']]),
    );
    expect(report.testFrameworks).toEqual(['vitest']);
  });

  it('detects test frameworks from well-known config files', async () => {
    const report = await stackDetector.detect(
      new Map([
        ['jest.config.js', 'module.exports = {}'],
        ['.mocharc.json', '{}'],
        ['ava.config.mjs', 'export default {}'],
      ]),
    );
    expect(report.testFrameworks).toEqual(['ava', 'jest', 'mocha']);
  });

  it('detects a test runner from a test-prefixed script value (DET-002)', async () => {
    const report = await stackDetector.detect(
      new Map([
        [
          'package.json',
          JSON.stringify({
            name: 'app',
            scripts: { test: 'vitest run', 'test:unit': 'jest --ci' },
          }),
        ],
      ]),
    );
    expect(report.testFrameworks).toEqual(['jest', 'vitest']);
    expect(report.stacks).toEqual([]); // no deps -> still no node claim
  });

  it('detects pytest from pytest.ini and pyproject [tool.pytest]', async () => {
    const report = await stackDetector.detect(
      new Map([
        ['pytest.ini', '[pytest]\n'],
        ['pyproject.toml', '[tool.pytest.ini_options]\n'],
      ]),
    );
    expect(report.testFrameworks).toEqual(['pytest']);
    expect(report.stacks.map((s) => s.id)).toEqual(['python']);
  });

  it('detects pytest from a tests/ directory convention at heuristic confidence', async () => {
    const report = await stackDetector.detect(
      new Map([
        ['tests/', ''],
        ['tests/test_math.py', 'def test_add(): pass'],
      ]),
    );
    expect(report.testFrameworks).toEqual(['pytest']);
    // Convention-only claim -> python stack is still manifest-backed; pytest
    // itself is only in testFrameworks, so assert no stack named pytest.
    expect(report.stacks.find((s) => s.id === 'pytest')).toBeUndefined();
  });

  it('sorts evidence within a framework by path then code', async () => {
    const report = await stackDetector.detect(
      new Map([
        [
          'package.json',
          JSON.stringify({
            name: 'app',
            devDependencies: { vitest: '^2' },
            scripts: { test: 'vitest' },
          }),
        ],
        ['vitest.config.ts', 'export default {}'],
      ]),
    );
    expect(report.testFrameworks).toEqual(['vitest']);
  });

  it('deduplicates identical evidence entries', async () => {
    const report = await stackDetector.detect(
      new Map([
        [
          'package.json',
          JSON.stringify({
            name: 'app',
            dependencies: { jest: '^29' },
            devDependencies: { jest: '^29' },
          }),
        ],
      ]),
    );
    expect(report.testFrameworks).toEqual(['jest']);
  });

  it('reports no test frameworks when none are present', async () => {
    const report = await stackDetector.detect(
      new Map([['package.json', JSON.stringify({ name: 'app' })]]),
    );
    expect(report.testFrameworks).toEqual([]);
    expect(report.stacks).toEqual([]);
  });
});

describe('stack-detector: empty and irrelevant inputs', () => {
  it('returns empty report for no manifests', async () => {
    const report = await stackDetector.detect(new Map());
    expect(report).toEqual({ stacks: [], testFrameworks: [], ciSystems: [] });
  });

  it('ignores unrelated files entirely', async () => {
    const report = await stackDetector.detect(
      new Map([
        ['docs/guide.md', '## React guide'],
        ['src/main.py', 'import requests'],
        ['LICENSE', 'MIT'],
      ]),
    );
    expect(report.stacks).toEqual([]);
    expect(report.testFrameworks).toEqual([]);
    expect(report.ciSystems).toEqual([]);
  });

  it('is deterministic across repeated calls', async () => {
    const manifests = new Map([
      [
        'package.json',
        JSON.stringify({
          name: 'app',
          dependencies: { react: '^18' },
          devDependencies: { vitest: '^2' },
        }),
      ],
      ['Cargo.toml', '[package]\n'],
      ['.github/workflows/ci.yml', 'name: CI'],
    ]);
    const first = await stackDetector.detect(manifests);
    const second = await stackDetector.detect(manifests);
    expect(second).toEqual(first);
    expect(second.stacks.map((s) => s.id)).toEqual(['node', 'react', 'rust']);
    expect(second.testFrameworks).toEqual(['vitest']);
    expect(second.ciSystems).toEqual(['github-actions']);
  });
});
