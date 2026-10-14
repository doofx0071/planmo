#!/usr/bin/env node
/**
 * Credential-free end-to-end proof of the AI setup + codebase-suggestion path
 * (docs/PLAN-ai-setup-and-codebase-suggestions.md, task 21).
 *
 * Drives the REAL built CLI (`packages/planmo/dist/bin.js`) — not the internal
 * modules — through the whole path a user follows:
 *
 *   setup (non-interactive) -> model <id> -> suggest --dry-run
 *     -> suggest --provider mock --allow-upload --json
 *
 * ...with NO real credential and NO network:
 *
 *   - the project is a synthetic temp repository that gets a real `.planmo/`
 *     workspace from the built CLI's own `init --yes`;
 *   - the user config lives in a temp `PLANMO_CONFIG_DIR`, so the real
 *     `~/.planmo` / `%LOCALAPPDATA%/PlanMo` is never read, written, or inspected;
 *   - the only credential is an obvious synthetic placeholder in ONE provider
 *     environment variable, and it must never reach stdout, stderr, or any file
 *     the run writes;
 *   - every provider call goes through `--provider mock`, and a preload module
 *     replaces `globalThis.fetch` with a thrower, so a network call fails the run
 *     loudly instead of silently succeeding.
 *
 * Asserts: the mock path was used and no other provider key is present, the
 * report parses and matches the canonical report shape, the project tree is
 * byte-identical (every file hashed) before and after, no `.planmo/plan.yml` or
 * application file was created or modified, and the fake secret is absent from
 * all output and every written file.
 *
 * Usage: node scripts/e2e-ai-setup-suggest.mjs
 * Exit 0 = passed; stdout carries exactly the five PASS lines below.
 * Non-zero = a check failed, with the reason on stderr.
 *
 * Diagnostics go to stderr on purpose, so stdout is exactly:
 *   PASS setup
 *   PASS model
 *   PASS suggest dry-run (0 provider calls)
 *   PASS mock report validated
 *   PASS project unchanged
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CLI = join(REPO_ROOT, 'packages', 'planmo', 'dist', 'bin.js');

/** An obvious synthetic placeholder; never a real credential. */
const FAKE_SECRET = 'planmo-e2e-fake-credential-0000-not-a-real-key';
/** The single provider variable the synthetic credential is placed in. */
const FAKE_ENV_NAME = 'OPENAI_API_KEY';
/** The provider preset the non-interactive setup saves (no request is made). */
const SETUP_PROVIDER = 'openai';
const SETUP_MODEL = 'gpt-4o-mini';
const CHANGED_MODEL = 'gpt-4o-mini-2024';

/** Every provider credential variable PlanMo resolves credentials from. */
const PROVIDER_ENV_NAMES = [
  'TOKENHARBOR_KEY',
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
  'DEEPSEEK_API_KEY',
  'MOONSHOT_API_KEY',
  'XAI_API_KEY',
  'OPENROUTER_API_KEY',
  'PLANMO_AI_API_KEY',
];

/** The canonical report enums (packages/schema/src/suggestion-report.ts). */
const REPORT_KINDS = ['observation', 'risk', 'improvement', 'feature-idea'];
const REPORT_CATEGORIES = [
  'product',
  'architecture',
  'frontend',
  'backend',
  'data',
  'design',
  'accessibility',
  'security',
  'reliability',
  'performance',
  'testing',
  'documentation',
  'developer-experience',
];
const REPORT_IMPACTS = ['low', 'medium', 'high'];
const REPORT_EFFORTS = ['small', 'medium', 'large'];
const REPORT_COUNTERS = [
  'inventoriedFiles',
  'eligibleFiles',
  'submittedFiles',
  'excludedFiles',
  'redactedFiles',
  'omittedFiles',
  'estimatedInputTokens',
  'actualInputTokens',
];

/** A tiny synthetic project; the CLI's own `init` adds the `.planmo/` workspace. */
const PROJECT_FILES = {
  'package.json': '{\n  "name": "demo-app",\n  "private": true\n}\n',
  'README.md':
    '# demo-app\n\nA tiny synthetic project for the credential-free AI end-to-end test.\n',
  'src/index.ts': 'export function add(a: number, b: number): number {\n  return a + b;\n}\n',
};

/** Preloaded into every CLI process: any network call becomes a hard failure. */
const NO_NETWORK_MODULE = `// e2e-ai-setup-suggest: fail loudly if any code path attempts network I/O.
globalThis.fetch = () => {
  throw new Error('NETWORK_BLOCKED: the credential-free AI e2e must not perform network I/O');
};
`;

function fail(message) {
  throw new Error(message);
}

function expect(condition, message) {
  if (!condition) fail(message);
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim() !== '';
}

/** Diagnostics, on stderr so stdout stays exactly the five PASS lines. */
function note(message) {
  process.stderr.write(`${message}\n`);
}

/**
 * The child environment: every real provider credential variable is removed, the
 * temp config dir replaces the user's, and exactly one synthetic credential is
 * present. `NODE_OPTIONS` is dropped so an inherited preload cannot interfere.
 */
function childEnvironment(configDir) {
  const env = { ...process.env };
  for (const name of PROVIDER_ENV_NAMES) delete env[name];
  delete env.PLANMO_CONFIG_DIR;
  delete env.NODE_OPTIONS;
  env.PLANMO_CONFIG_DIR = configDir;
  env[FAKE_ENV_NAME] = FAKE_SECRET;
  return env;
}

/** Every path in a tree, files and directories, as sorted POSIX relative paths. */
async function hashTree(root) {
  const entries = [];
  async function walk(dir) {
    const items = (await readdir(dir, { withFileTypes: true })).sort((a, b) =>
      a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
    );
    for (const item of items) {
      const absolute = join(dir, item.name);
      const path = relative(root, absolute).split('\\').join('/');
      if (item.isDirectory()) {
        entries.push(`${path}/`);
        await walk(absolute);
      } else if (item.isFile()) {
        const digest = createHash('sha256')
          .update(await readFile(absolute))
          .digest('hex');
        entries.push(`${path}:${digest}`);
      } else {
        entries.push(`${path}:non-file`);
      }
    }
  }
  await walk(root);
  return entries.sort();
}

function describeTreeDiff(before, after) {
  const beforeSet = new Set(before);
  const afterSet = new Set(after);
  const added = after.filter((entry) => !beforeSet.has(entry));
  const removed = before.filter((entry) => !afterSet.has(entry));
  const parts = [];
  if (added.length > 0) parts.push(`added or changed: ${added.slice(0, 5).join(', ')}`);
  if (removed.length > 0) parts.push(`removed or changed: ${removed.slice(0, 5).join(', ')}`);
  return `the project tree changed during the AI run — ${parts.join('; ') || 'unknown difference'}`;
}

/** Every regular file under a tree, recursively. */
async function listFiles(root) {
  const files = [];
  async function walk(dir) {
    for (const item of await readdir(dir, { withFileTypes: true })) {
      const absolute = join(dir, item.name);
      if (item.isDirectory()) await walk(absolute);
      else if (item.isFile()) files.push(absolute);
    }
  }
  await walk(root);
  return files;
}

/** The first place the synthetic credential appears, or null. */
async function findSecret(transcripts, roots) {
  for (const transcript of transcripts) {
    if (transcript.out.includes(FAKE_SECRET) || transcript.err.includes(FAKE_SECRET)) {
      return `the output of \`planmo ${transcript.args.join(' ')}\``;
    }
  }
  for (const root of roots) {
    for (const file of await listFiles(root)) {
      if ((await readFile(file)).includes(FAKE_SECRET)) return file;
    }
  }
  return null;
}

/** Structural validation of the canonical suggestion report shape. */
function validateReportShape(report) {
  expect(isPlainObject(report), 'the mock report must be a JSON object');
  expect(
    report.schemaVersion === 1,
    `report.schemaVersion must be 1, got ${JSON.stringify(report.schemaVersion)}`,
  );
  expect(isPlainObject(report.provider), 'report.provider must be an object');
  expect(isNonEmptyString(report.provider.id), 'report.provider.id must be a non-empty string');
  expect(
    isNonEmptyString(report.provider.model),
    'report.provider.model must be a non-empty string',
  );
  expect(report.provider.id === 'mock', 'the report must name the mock provider');
  expect(isNonEmptyString(report.summary), 'report.summary must be a non-empty string');

  expect(isPlainObject(report.coverage), 'report.coverage must be an object');
  for (const field of REPORT_COUNTERS) {
    const value = report.coverage[field];
    expect(
      Number.isInteger(value) && value >= 0,
      `report.coverage.${field} must be a non-negative integer, got ${JSON.stringify(value)}`,
    );
  }
  expect(
    typeof report.coverage.truncated === 'boolean',
    'report.coverage.truncated must be a boolean',
  );

  expect(
    Array.isArray(report.limitations) && report.limitations.every(isNonEmptyString),
    'report.limitations must be an array of non-empty strings',
  );
  expect(Array.isArray(report.suggestions), 'report.suggestions must be an array');

  for (const suggestion of report.suggestions) {
    expect(isPlainObject(suggestion), 'each suggestion must be an object');
    for (const field of ['id', 'title', 'rationale', 'recommendation']) {
      expect(isNonEmptyString(suggestion[field]), `suggestion.${field} must be a non-empty string`);
    }
    expect(REPORT_KINDS.includes(suggestion.kind), 'suggestion.kind is not a known kind');
    expect(
      REPORT_CATEGORIES.includes(suggestion.category),
      'suggestion.category is not a known category',
    );
    expect(REPORT_IMPACTS.includes(suggestion.impact), 'suggestion.impact is not a known impact');
    expect(REPORT_EFFORTS.includes(suggestion.effort), 'suggestion.effort is not a known effort');
    expect(
      typeof suggestion.confidence === 'number' &&
        suggestion.confidence >= 0 &&
        suggestion.confidence <= 1,
      'suggestion.confidence must be within [0, 1]',
    );
    expect(
      Array.isArray(suggestion.evidence) && suggestion.evidence.length >= 1,
      'each suggestion must cite at least one evidence entry',
    );
    for (const evidence of suggestion.evidence) {
      expect(isNonEmptyString(evidence.path), 'evidence.path must be a non-empty string');
      expect(
        Number.isInteger(evidence.startLine) && evidence.startLine >= 1,
        'evidence.startLine must be a positive integer',
      );
      expect(
        Number.isInteger(evidence.endLine) && evidence.endLine >= evidence.startLine,
        'evidence.endLine must be greater than or equal to startLine',
      );
    }
  }
}

async function main() {
  // Build only when the CLI has not been built yet; CI runs `pnpm build` first.
  if (!existsSync(CLI)) {
    note('e2e-ai: packages/planmo/dist/bin.js is missing — running `pnpm build` once');
    const build = spawnSync('pnpm', ['build'], {
      cwd: REPO_ROOT,
      stdio: 'ignore',
      shell: process.platform === 'win32',
    });
    expect(build.status === 0, '`pnpm build` failed; the built CLI is required');
    expect(existsSync(CLI), 'packages/planmo/dist/bin.js is still missing after `pnpm build`');
  }

  const tempRoot = await mkdtemp(join(tmpdir(), 'planmo-e2e-ai-'));
  const project = join(tempRoot, 'demo-app');
  const configDir = join(tempRoot, 'user-config');
  const preload = join(tempRoot, 'no-network.mjs');

  try {
    // 1. A synthetic project plus a real workspace from the CLI's own `init`.
    await mkdir(join(project, 'src'), { recursive: true });
    for (const [name, content] of Object.entries(PROJECT_FILES)) {
      await writeFile(join(project, name), content, 'utf8');
    }
    await mkdir(configDir, { recursive: true });
    await writeFile(preload, NO_NETWORK_MODULE, 'utf8');

    const env = childEnvironment(configDir);
    const presentProviderKeys = PROVIDER_ENV_NAMES.filter((name) => env[name] !== undefined);
    expect(
      presentProviderKeys.length === 1 && presentProviderKeys[0] === FAKE_ENV_NAME,
      `expected only ${FAKE_ENV_NAME} to be set, found: ${presentProviderKeys.join(', ') || '(none)'}`,
    );

    const transcripts = [];
    const run = (args, cwd = project) => {
      const result = spawnSync(
        process.execPath,
        ['--import', pathToFileURL(preload).href, CLI, ...args],
        { cwd, env, encoding: 'utf8', windowsHide: true },
      );
      const transcript = {
        args,
        code: typeof result.status === 'number' ? result.status : 1,
        out: result.stdout ?? '',
        err: result.stderr ?? '',
      };
      transcripts.push(transcript);
      return transcript;
    };

    const init = run(['init', project, '--yes']);
    expect(init.code === 0, `init exited ${init.code}: ${init.err.trim()}`);
    expect(
      existsSync(join(project, '.planmo', 'project.yml')),
      'init did not write .planmo/project.yml',
    );

    // The baseline: everything the AI commands must leave untouched.
    const before = await hashTree(project);
    expect(before.length > 0, 'the synthetic project tree is empty after init');

    // 2. setup — non-interactive, satisfied by the synthetic environment credential.
    const setup = run(['setup', '--provider', SETUP_PROVIDER, '--model', SETUP_MODEL]);
    expect(setup.code === 0, `setup exited ${setup.code}: ${setup.err.trim()}`);
    expect(
      setup.out.includes(`AI profile set: ${SETUP_PROVIDER} / ${SETUP_MODEL}`),
      `setup did not report the saved profile: ${setup.out.trim()}`,
    );
    expect(setup.out.includes(FAKE_ENV_NAME), 'setup did not name the credential source variable');
    console.log('PASS setup');

    // 3. model — an explicit id, so no discovery request and no network.
    const model = run(['model', CHANGED_MODEL]);
    expect(model.code === 0, `model exited ${model.code}: ${model.err.trim()}`);
    expect(
      model.out.includes('Default profile model updated'),
      `model did not confirm the change: ${model.out.trim()}`,
    );
    const savedConfig = JSON.parse(await readFile(join(configDir, 'config.json'), 'utf8'));
    expect(
      savedConfig.profiles?.[0]?.modelId === CHANGED_MODEL,
      'the saved default profile did not record the new model id',
    );
    console.log('PASS model');

    // 4. suggest --dry-run — previews the upload and never resolves a provider.
    const dryRun = run(['suggest', '--dry-run']);
    expect(dryRun.code === 0, `suggest --dry-run exited ${dryRun.code}: ${dryRun.err.trim()}`);
    expect(
      dryRun.out.includes('0 provider calls'),
      `the dry run did not report zero provider calls: ${dryRun.out.trim()}`,
    );
    expect(
      !dryRun.err.includes('using the mock provider'),
      'the dry run created a provider instead of returning early',
    );
    console.log('PASS suggest dry-run (0 provider calls)');

    // 5. suggest with the offline mock provider, emitting the report as JSON.
    const mock = run(['suggest', '--provider', 'mock', '--allow-upload', '--json']);
    expect(mock.code === 0, `suggest --provider mock exited ${mock.code}: ${mock.err.trim()}`);
    expect(mock.err.includes('using the mock provider'), 'the mock provider path was not used');
    let report;
    try {
      report = JSON.parse(mock.out);
    } catch (error) {
      fail(`the mock report is not valid JSON: ${error.message}`);
    }
    validateReportShape(report);
    console.log('PASS mock report validated');

    // 6. The project tree must be byte-identical: every file hashed, compared.
    const after = await hashTree(project);
    expect(before.join('\n') === after.join('\n'), describeTreeDiff(before, after));
    // `planmo plan` owns `.planmo/plan.yml`; a suggestion run must never create it.
    expect(
      !existsSync(join(project, '.planmo', 'plan.yml')),
      'the AI run created .planmo/plan.yml',
    );
    console.log('PASS project unchanged');

    // 7. No network call escaped the mock path, and no fake secret leaked.
    const networkAttempt = transcripts.find((t) => `${t.out}${t.err}`.includes('NETWORK_BLOCKED'));
    expect(
      networkAttempt === undefined,
      `a network call was attempted during \`planmo ${networkAttempt?.args.join(' ')}\``,
    );
    const leaked = await findSecret(transcripts, [project, configDir]);
    expect(leaked === null, `the synthetic credential leaked into ${leaked}`);

    note(
      'e2e-ai: OK (setup, model, dry run, mock report, unchanged tree; no credential, no network)',
    );
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  note(`e2e-ai: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
