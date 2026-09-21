/**
 * P10-02 stack/test/CI detection (Worker B).
 *
 * Pure, deterministic engine over manifest texts passed by the caller
 * (keyed by POSIX-relative path) — it never touches the filesystem.
 * Every claim is backed by structured `DetectionEvidence`:
 *
 * - DET-001 manifest dependency     (package.json deps/devDeps/bin/engines,
 *                                    Cargo.toml, go.mod, pyproject.toml, ...)
 * - DET-002 manifest scripts        (package.json `scripts.test*` values)
 * - DET-003 config file             (vitest.config.*, jest.config.*, pytest.ini, ...)
 * - DET-004 convention file         (tests/ directory convention)
 * - DET-005 CI workflow declaration (.github/workflows/*, .gitlab-ci.yml, ...)
 *
 * Confidence is derived deterministically from the evidence source:
 * first-party manifest/config/CI declaration = high; lockfile only = medium;
 * convention file = heuristic. Never any content sniffing of README or other
 * prose, and never stack claims from a package `name` alone.
 *
 * Output arrays are always sorted: evidence path asc, then code asc, then
 * match asc; stacks/testFrameworks/ciSystems by id asc.
 */
import type {
  Confidence,
  DetectionEngine,
  DetectionEvidence,
  DetectionReport,
  DetectedStack,
  EvidenceSource,
} from '../contracts.js';

type StackCategory = DetectedStack['category'];

/** Highest-confidence wins; list order doubles as the merge rank. */
const CONFIDENCE_RANK: Readonly<Record<Confidence, number>> = {
  heuristic: 0,
  medium: 1,
  high: 2,
};

/** Deterministic source -> confidence mapping. */
const SOURCE_CONFIDENCE: Readonly<Record<EvidenceSource, Confidence>> = {
  manifest: 'high',
  config: 'high',
  'ci-declaration': 'high',
  lockfile: 'medium',
  'file-convention': 'heuristic',
};

/** JS/TS package.json dependency -> stack claim. */
const PKG_DEP_RULES: Readonly<Record<string, { id: string; category: StackCategory }>> = {
  react: { id: 'react', category: 'framework' },
  vue: { id: 'vue', category: 'framework' },
  next: { id: 'next', category: 'framework' },
  express: { id: 'express', category: 'framework' },
  typescript: { id: 'typescript', category: 'toolchain' },
  vite: { id: 'vite', category: 'toolchain' },
};

/** Test frameworks discoverable from package.json deps/devDeps or scripts. */
const PKG_TEST_IDS: readonly string[] = ['vitest', 'jest', 'mocha', 'ava'];

/** Well-known test-runner config filenames -> framework id (DET-003, config). */
const TEST_CONFIG_FILES: Readonly<Record<string, readonly string[]>> = {
  vitest: [
    'vitest.config.ts',
    'vitest.config.js',
    'vitest.config.mts',
    'vitest.config.mjs',
    'vitest.config.cts',
    'vitest.config.cjs',
  ],
  jest: [
    'jest.config.ts',
    'jest.config.js',
    'jest.config.mjs',
    'jest.config.cjs',
    'jest.config.mts',
    'jest.config.cts',
    'jest.config.json',
  ],
  mocha: ['.mocharc.json', '.mocharc.jsonc', '.mocharc.js', '.mocharc.cjs', '.mocharc.mjs', '.mocharc.yaml', '.mocharc.yml'],
  ava: ['ava.config.js', 'ava.config.cjs', 'ava.config.mjs', 'ava.config.ts'],
};

/** Root-relative language/bundler manifest + lockfile markers. */
const MANIFEST_MARKERS: readonly { file: string; id: string; category: StackCategory; source: EvidenceSource }[] = [
  { file: 'Cargo.toml', id: 'rust', category: 'language', source: 'manifest' },
  { file: 'Cargo.lock', id: 'rust', category: 'language', source: 'lockfile' },
  { file: 'go.mod', id: 'go', category: 'language', source: 'manifest' },
  { file: 'pyproject.toml', id: 'python', category: 'language', source: 'manifest' },
  { file: 'requirements.txt', id: 'python', category: 'language', source: 'manifest' },
  { file: 'Pipfile', id: 'python', category: 'language', source: 'manifest' },
  { file: 'pom.xml', id: 'java', category: 'language', source: 'manifest' },
  { file: 'build.gradle', id: 'java', category: 'language', source: 'manifest' },
  { file: 'settings.gradle', id: 'java', category: 'language', source: 'manifest' },
  { file: 'composer.json', id: 'php', category: 'language', source: 'manifest' },
  { file: 'Gemfile', id: 'ruby', category: 'language', source: 'manifest' },
  { file: 'Gemfile.lock', id: 'ruby', category: 'language', source: 'lockfile' },
  // Node is additionally claimed from package.json content below; lockfiles
  // alone yield a medium-confidence node claim.
  { file: 'pnpm-lock.yaml', id: 'node', category: 'runtime', source: 'lockfile' },
  { file: 'package-lock.json', id: 'node', category: 'runtime', source: 'lockfile' },
  { file: 'yarn.lock', id: 'node', category: 'runtime', source: 'lockfile' },
];

/** CI workflow declarations (DET-005, ci-declaration, high). */
const CI_DECLARATIONS: readonly { id: string; isMatch: (path: string) => boolean }[] = [
  {
    id: 'github-actions',
    // Both .yml and .yaml are officially supported by GitHub Actions.
    isMatch: (path) => /^\.github\/workflows\/[^/]+\.ya?ml$/.test(path),
  },
  {
    id: 'gitlab-ci',
    isMatch: (path) => path === '.gitlab-ci.yml' || path === '.gitlab-ci.yaml',
  },
  { id: 'jenkins', isMatch: (path) => path === 'Jenkinsfile' },
  { id: 'circleci', isMatch: (path) => path === '.circleci/config.yml' },
  {
    id: 'azure-pipelines',
    isMatch: (path) => path === 'azure-pipelines.yml' || path === 'azure-pipelines.yaml',
  },
];

interface EvidenceGroup {
  /** null when the id is a test framework or CI system (never a stack). */
  category: StackCategory | null;
  evidence: DetectionEvidence[];
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(text);
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

function objectKeys(value: unknown): readonly string[] {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    return Object.keys(value as Record<string, unknown>);
  }
  return [];
}

function byPathThenCodeThenMatch(a: DetectionEvidence, b: DetectionEvidence): number {
  return (
    (a.path < b.path ? -1 : a.path > b.path ? 1 : 0) ||
    (a.code < b.code ? -1 : a.code > b.code ? 1 : 0) ||
    (a.match < b.match ? -1 : a.match > b.match ? 1 : 0)
  );
}

function byId(a: { id: string }, b: { id: string }): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function groupConfidence(evidence: readonly DetectionEvidence[]): Confidence {
  let best = 0;
  for (const ev of evidence) {
    const rank = CONFIDENCE_RANK[SOURCE_CONFIDENCE[ev.source]];
    if (rank > best) best = rank;
  }
  return best === 2 ? 'high' : best === 1 ? 'medium' : 'heuristic';
}

function finalizeGroups(groups: ReadonlyMap<string, EvidenceGroup>): {
  stacks: DetectedStack[];
  testFrameworks: string[];
  ciSystems: string[];
} {
  const stacks: DetectedStack[] = [];
  const testFrameworks: string[] = [];
  const ciSystems: string[] = [];
  for (const [id, group] of groups) {
    const evidence = [...group.evidence].sort(byPathThenCodeThenMatch);
    if (group.category !== null) {
      stacks.push({ id, category: group.category, confidence: groupConfidence(evidence), evidence });
    } else if (PKG_TEST_IDS.includes(id) || id === 'pytest') {
      testFrameworks.push(id);
    } else if (CI_DECLARATIONS.some((ci) => ci.id === id)) {
      ciSystems.push(id);
    }
  }
  stacks.sort(byId);
  testFrameworks.sort();
  ciSystems.sort();
  return { stacks, testFrameworks, ciSystems };
}

export const stackDetector: DetectionEngine = {
  name: 'stack-detector',

  /**
   * Pure detection over manifest texts keyed by POSIX-relative path.
   * Malformed package.json files are ignored deterministically; prose
   * (README etc.) is never inspected.
   */
  async detect(manifests: ReadonlyMap<string, string>): Promise<DetectionReport> {
    const groups = new Map<string, EvidenceGroup>();
    const seen = new Set<string>();

    const addEvidence = (id: string, category: StackCategory | null, ev: DetectionEvidence): void => {
      const key = `${id}\u0000${ev.path}\u0000${ev.code}\u0000${ev.match}`;
      if (seen.has(key)) return;
      seen.add(key);
      let group = groups.get(id);
      if (group === undefined) {
        group = { category, evidence: [] };
        groups.set(id, group);
      }
      group.evidence.push(ev);
    };

    const manifestEv = (path: string, code: DetectionEvidence['code'], match: string): DetectionEvidence => ({
      path,
      source: 'manifest',
      code,
      match,
    });

    for (const [path, text] of manifests) {
      // --- package.json: JS ecosystems, toolchain, node runtime, test deps ---
      if (path === 'package.json') {
        const pkg = parseJsonObject(text);
        if (pkg === null) continue;
        const dependencies = objectKeys(pkg['dependencies']);
        const devDependencies = objectKeys(pkg['devDependencies']);
        const bin = pkg['bin'];
        const hasBin = typeof bin === 'string' || objectKeys(bin).length > 0;
        if (dependencies.length > 0) {
          addEvidence('node', 'runtime', manifestEv(path, 'DET-001', 'dependencies'));
        }
        if (devDependencies.length > 0) {
          addEvidence('node', 'runtime', manifestEv(path, 'DET-001', 'devDependencies'));
        }
        if (hasBin) {
          addEvidence('node', 'runtime', manifestEv(path, 'DET-001', 'bin'));
        }
        const engines = pkg['engines'];
        if (engines !== null && typeof engines === 'object' && !Array.isArray(engines) && 'node' in engines) {
          addEvidence('node', 'runtime', manifestEv(path, 'DET-001', 'engines.node'));
        }
        for (const section of [
          ['dependencies', dependencies],
          ['devDependencies', devDependencies],
        ] as const) {
          for (const dep of section[1]) {
            const rule = PKG_DEP_RULES[dep];
            if (rule !== undefined) {
              addEvidence(rule.id, rule.category, manifestEv(path, 'DET-001', `${section[0]}.${dep}`));
            }
            if (PKG_TEST_IDS.includes(dep)) {
              addEvidence(dep, null, manifestEv(path, 'DET-001', `${section[0]}.${dep}`));
            }
          }
        }
        const scripts = pkg['scripts'];
        if (scripts !== null && typeof scripts === 'object' && !Array.isArray(scripts)) {
          for (const [name, value] of Object.entries(scripts as Record<string, unknown>)) {
            if (!name.startsWith('test') || typeof value !== 'string') continue;
            for (const framework of PKG_TEST_IDS) {
              if (new RegExp(`\\b${framework}\\b`).test(value)) {
                addEvidence(framework, null, manifestEv(path, 'DET-002', `scripts.${name}`));
              }
            }
          }
        }
        continue;
      }

      // --- exact-name language/bundler manifests and lockfiles ---
      const marker = MANIFEST_MARKERS.find((m) => m.file === path);
      if (marker !== undefined) {
        addEvidence(
          marker.id,
          marker.category,
          marker.source === 'lockfile'
            ? { path, source: 'lockfile', code: 'DET-001', match: path }
            : manifestEv(path, 'DET-001', path),
        );
        continue;
      }

      // --- CI workflow declarations ---
      for (const ci of CI_DECLARATIONS) {
        if (ci.isMatch(path)) {
          addEvidence(ci.id, null, { path, source: 'ci-declaration', code: 'DET-005', match: path });
        }
      }

      // --- test framework config files (DET-003) ---
      for (const [framework, files] of Object.entries(TEST_CONFIG_FILES)) {
        if (files.includes(path)) {
          addEvidence(framework, null, { path, source: 'config', code: 'DET-003', match: path });
        }
      }

      // --- pytest specifics ---
      if (path === 'pytest.ini') {
        addEvidence('pytest', null, { path, source: 'config', code: 'DET-003', match: path });
      }
      if (path === 'pyproject.toml' && text.includes('[tool.pytest')) {
        addEvidence('pytest', null, { path, source: 'config', code: 'DET-003', match: '[tool.pytest]' });
      }

      // --- tests/ directory convention (file-convention heuristic) ---
      if (path === 'tests/' || path.startsWith('tests/')) {
        addEvidence('pytest', null, { path, source: 'file-convention', code: 'DET-004', match: path });
      }
    }

    const { stacks, testFrameworks, ciSystems } = finalizeGroups(groups);
    return { stacks, testFrameworks, ciSystems };
  },
};