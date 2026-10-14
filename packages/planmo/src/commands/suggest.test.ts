import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HttpProviderConfig, ModelProvider } from '@planmo/ai';
import { suggestionContextEngine } from '@planmo/scanner';
import type {
  FileReader,
  SuggestionContextEngine,
  SuggestionContextOptions,
} from '@planmo/scanner';
import { SuggestionReportSchema } from '@planmo/schema';
import type { CliIO, WizardIO } from '../cli-io.js';
import type { CredentialStore } from '../credential-store.js';
import { run } from '../index.js';
import type { SuggestCommandDependencies } from './suggest.js';

/**
 * T19 — `planmo suggest`: consent-gated command surface.
 *
 * The orchestration (T18), the renderer (T20) and the context engine (T15) are
 * already frozen; this file pins the COMMAND contract around them:
 * `--dry-run` uploads nothing, an interactive run asks before the first provider
 * request, a non-TTY run needs `--allow-upload`, output defaults to stdout with
 * `--json`/`--output` opt-ins, and NOTHING in the scanned project is written.
 *
 * Every seam is injected (provider factory, credential store, config dir, env,
 * interactivity), so the whole file is offline and deterministic. The reader is
 * the real node reader over a temporary workspace so evidence verification runs
 * against real files.
 */

vi.mock('../keyring-credential-store.js', () => ({
  KeyringCredentialStore: class {
    async get() {
      throw new Error('real keyring access is disabled in suggest tests');
    }
    async set() {
      throw new Error('real keyring access is disabled in suggest tests');
    }
    async remove() {
      throw new Error('real keyring access is disabled in suggest tests');
    }
    async has() {
      throw new Error('real keyring access is disabled in suggest tests');
    }
  },
}));

type SuggestCli = (
  argv: string[],
  io: CliIO,
  wizard: WizardIO,
  dependencies: { suggest?: SuggestCommandDependencies },
) => Promise<number>;

const runSuggestCli = run as unknown as SuggestCli;

// ---------------------------------------------------------------------------
// Fixtures and helpers
// ---------------------------------------------------------------------------

const temporaryDirectories: string[] = [];

async function temporaryDirectory(prefix: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
}

beforeEach(() => {
  // Any accidental provider route must fail without real credentials or network.
  vi.stubGlobal('fetch', async () => new Response(null, { status: 401 }));
});

afterEach(async () => {
  vi.unstubAllGlobals();
  while (temporaryDirectories.length > 0) {
    await rm(temporaryDirectories.pop()!, { recursive: true, force: true });
  }
});

function capture() {
  const out: string[] = [];
  const err: string[] = [];
  return {
    io: { out: (line: string) => out.push(line), err: (line: string) => err.push(line) },
    out,
    err,
  };
}

/** A wizard that cancels every prompt, so an unexpected prompt fails loudly. */
const noPromptWizard = (): WizardIO => ({
  prompt: async () => {
    throw new Error('should not prompt');
  },
  password: async () => {
    throw new Error('should not prompt');
  },
  select: async () => undefined,
  multiSelect: async () => undefined,
  confirm: async () => undefined,
  out: () => {},
});

function fakeCredentialStore(initial: Readonly<Record<string, string>> = {}) {
  const values = new Map(Object.entries(initial));
  const store: CredentialStore = {
    async get(ref) {
      return values.get(ref) ?? null;
    },
    async set(ref, value) {
      values.set(ref, value);
    },
    async remove(ref) {
      values.delete(ref);
    },
    async has(ref) {
      const value = values.get(ref);
      return value !== undefined && value.trim() !== '';
    },
  };
  return { store, values };
}

interface RecordingProvider {
  provider: ModelProvider;
  state: { calls: number };
}

/** A provider that returns fixed text and counts how often it was asked. */
function textProvider(text: string, id = 'openai', model = 'gpt-test'): RecordingProvider {
  const state = { calls: 0 };
  const provider: ModelProvider = {
    id,
    model,
    capabilities: { structuredOutput: false, streaming: false, toolCalling: false },
    async generate() {
      state.calls += 1;
      return {
        text,
        usage: { inputTokens: 3, outputTokens: 3 },
        model,
        providerId: id,
        simulated: true,
      };
    },
  };
  return { provider, state };
}

/** A context engine that counts how many times the repository is scanned. */
function countingContextEngine(): { engine: SuggestionContextEngine; builds: () => number } {
  const inner = suggestionContextEngine();
  let builds = 0;
  const engine: SuggestionContextEngine = {
    name: 'suggestion-context',
    build: (root: string, reader: FileReader, options?: SuggestionContextOptions) => {
      builds += 1;
      return inner.build(root, reader, options);
    },
  };
  return { engine, builds: () => builds };
}

/** `src/app.ts` is 3 lines long — the evidence range below is load-bearing. */
const APP_SOURCE = 'export function add(a, b) {\n  return a + b;\n}\n';

/** A schema-valid suggestion over a file that really exists in the workspace. */
function suggestion(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'SUG-001',
    kind: 'improvement',
    category: 'testing',
    title: 'Add a unit test for add()',
    rationale: 'src/app.ts exports add() but nothing exercises it.',
    recommendation: 'Add a unit test that asserts add(1, 2) === 3.',
    impact: 'low',
    effort: 'small',
    confidence: 0.7,
    evidence: [{ path: 'src/app.ts', startLine: 1, endLine: 3 }],
    ...overrides,
  };
}

/** The JSON a model might return; `provider`/`coverage` are PlanMo-supplied. */
function reportJson(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    schemaVersion: 1,
    provider: { id: 'model-claimed', model: 'model-claimed-model' },
    summary: 'A small demo repository with one source module.',
    coverage: {
      inventoriedFiles: 0,
      eligibleFiles: 0,
      submittedFiles: 0,
      excludedFiles: 0,
      redactedFiles: 0,
      omittedFiles: 0,
      estimatedInputTokens: 0,
      actualInputTokens: 0,
      truncated: false,
    },
    limitations: [],
    suggestions: [suggestion()],
    ...overrides,
  });
}

/** A fresh workspace with one real source file the model can cite. */
async function suggestWorkspace(): Promise<string> {
  const root = await temporaryDirectory('planmo-suggest-workspace-');
  const code = await run(['init', root, '--yes'], capture().io, noPromptWizard());
  expect(code).toBe(0);
  await mkdir(join(root, 'src'), { recursive: true });
  await writeFile(join(root, 'src', 'app.ts'), APP_SOURCE, 'utf8');
  return root;
}

/** Every file under `root`, relative path -> exact content. */
async function snapshot(root: string): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  async function walk(directory: string, prefix: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const absolute = join(directory, entry.name);
      const relative = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
      if (entry.isDirectory()) await walk(absolute, relative);
      else if (entry.isFile()) files[relative] = await readFile(absolute, 'utf8');
    }
  }
  await walk(root, '');
  return files;
}

function dependencies(
  configDir: string,
  overrides: Partial<SuggestCommandDependencies> = {},
): { suggest: SuggestCommandDependencies } {
  return {
    suggest: {
      configDir,
      env: { OPENAI_API_KEY: 'synthetic-openai-suggest-key' },
      store: fakeCredentialStore().store,
      ...overrides,
    },
  };
}

// ---------------------------------------------------------------------------
// --dry-run: zero provider calls, upload summary on stdout
// ---------------------------------------------------------------------------

describe('planmo suggest — --dry-run', () => {
  it('makes zero provider calls and prints what would be uploaded', async () => {
    const root = await suggestWorkspace();
    const configDir = await temporaryDirectory('planmo-suggest-config-');
    const recording = textProvider(reportJson());
    const factoryCalls: HttpProviderConfig[] = [];
    const { io, out } = capture();

    const code = await runSuggestCli(
      ['suggest', '--dir', root, '--dry-run'],
      io,
      noPromptWizard(),
      {
        suggest: {
          configDir,
          env: { OPENAI_API_KEY: 'synthetic-key' },
          store: fakeCredentialStore().store,
          providerFactory: (config) => {
            factoryCalls.push(config);
            return recording.provider;
          },
        },
      },
    );

    expect(code).toBe(0);
    expect(factoryCalls).toEqual([]);
    expect(recording.state.calls).toBe(0);

    const text = out.join('\n');
    expect(text).toContain('dry run');
    expect(text).toContain('inventoried files:');
    expect(text).toContain('submitted files:');
    expect(text).toContain('batches:');
    expect(text).toContain('estimated input tokens:');
    expect(text).toContain('excluded files:');
    expect(text).toContain('0 provider calls');
  });
});

// ---------------------------------------------------------------------------
// Consent
// ---------------------------------------------------------------------------

describe('planmo suggest — consent', () => {
  it('asks before the first provider request and aborts cleanly when declined', async () => {
    const root = await suggestWorkspace();
    const configDir = await temporaryDirectory('planmo-suggest-config-');
    const recording = textProvider(reportJson());
    const before = await snapshot(root);
    let confirmCalls = 0;
    const wizard: WizardIO = {
      ...noPromptWizard(),
      confirm: async () => {
        confirmCalls += 1;
        return false;
      },
    };
    const { io, out, err } = capture();

    const code = await runSuggestCli(
      ['suggest', '--dir', root, '--provider', 'openai', '--model', 'gpt-test'],
      io,
      wizard,
      dependencies(configDir, {
        providerFactory: () => recording.provider,
        interactive: true,
      }),
    );

    expect(code).toBe(0);
    expect(confirmCalls).toBe(1);
    expect(recording.state.calls).toBe(0);
    expect(`${out.join('\n')}\n${err.join('\n')}`).toContain('declined');
    expect(await snapshot(root)).toEqual(before);
  });

  it('exits 1 with a clear message when a non-TTY run lacks --allow-upload', async () => {
    const root = await suggestWorkspace();
    const configDir = await temporaryDirectory('planmo-suggest-config-');
    const recording = textProvider(reportJson());
    const { io, out, err } = capture();

    const code = await runSuggestCli(
      ['suggest', '--dir', root, '--provider', 'openai', '--model', 'gpt-test'],
      io,
      noPromptWizard(),
      dependencies(configDir, {
        providerFactory: () => recording.provider,
        interactive: false,
      }),
    );

    expect(code).toBe(1);
    expect(err.join('\n')).toContain('--allow-upload');
    expect(recording.state.calls).toBe(0);
    expect(out.join('\n')).not.toContain('PlanMo codebase suggestions');
  });

  it.each(['false', '0', 'no', 'nope'])(
    'treats --allow-upload=%s as NOT consent (non-TTY exits 1, no provider call)',
    async (value) => {
      const root = await suggestWorkspace();
      const configDir = await temporaryDirectory('planmo-suggest-config-');
      const recording = textProvider(reportJson());
      const { io, out, err } = capture();

      const code = await runSuggestCli(
        [
          'suggest',
          '--dir',
          root,
          '--provider',
          'openai',
          '--model',
          'gpt-test',
          `--allow-upload=${value}`,
        ],
        io,
        noPromptWizard(),
        dependencies(configDir, { providerFactory: () => recording.provider, interactive: false }),
      );

      expect(code).toBe(1);
      expect(err.join('\n')).toContain('--allow-upload');
      expect(recording.state.calls).toBe(0);
      expect(out.join('\n')).not.toContain('PlanMo codebase suggestions');
    },
  );

  it.each(['true', '1', 'yes'])(
    'treats --allow-upload=%s as consent (non-TTY uploads once)',
    async (value) => {
      const root = await suggestWorkspace();
      const configDir = await temporaryDirectory('planmo-suggest-config-');
      const recording = textProvider(reportJson());
      const { io, out } = capture();

      const code = await runSuggestCli(
        [
          'suggest',
          '--dir',
          root,
          '--provider',
          'openai',
          '--model',
          'gpt-test',
          `--allow-upload=${value}`,
        ],
        io,
        noPromptWizard(),
        dependencies(configDir, { providerFactory: () => recording.provider, interactive: false }),
      );

      expect(code).toBe(0);
      expect(recording.state.calls).toBe(1);
      expect(out.join('\n')).toContain('PlanMo codebase suggestions');
    },
  );

  it('prompts (and does not upload) when --allow-upload=false on an interactive terminal', async () => {
    const root = await suggestWorkspace();
    const configDir = await temporaryDirectory('planmo-suggest-config-');
    const recording = textProvider(reportJson());
    let confirmCalls = 0;
    const wizard: WizardIO = {
      ...noPromptWizard(),
      confirm: async () => {
        confirmCalls += 1;
        return false;
      },
    };
    const { io } = capture();

    const code = await runSuggestCli(
      [
        'suggest',
        '--dir',
        root,
        '--provider',
        'openai',
        '--model',
        'gpt-test',
        '--allow-upload=false',
      ],
      io,
      wizard,
      dependencies(configDir, { providerFactory: () => recording.provider, interactive: true }),
    );

    expect(code).toBe(0);
    expect(confirmCalls).toBe(1);
    expect(recording.state.calls).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Valued flags require a value
// ---------------------------------------------------------------------------

describe('planmo suggest — valued flags require a value', () => {
  it.each(['--dir', '--provider', '--model', '--base-url', '--output'])(
    'rejects %s with no value as a usage error',
    async (flag) => {
      const { io, err } = capture();

      const code = await runSuggestCli(
        ['suggest', flag],
        io,
        noPromptWizard(),
        dependencies('unused'),
      );

      expect(code).not.toBe(0);
      expect(err.join('\n')).toContain(flag);
      expect(err.join('\n')).toContain('needs a value');
    },
  );

  it('--output with no value exits non-zero and writes no file named "true"', async () => {
    const root = await suggestWorkspace();
    const configDir = await temporaryDirectory('planmo-suggest-config-');
    const before = await snapshot(root);
    const recording = textProvider(reportJson());
    const { io, out, err } = capture();

    const code = await runSuggestCli(
      ['suggest', '--dir', root, '--provider', 'mock', '--allow-upload', '--output'],
      io,
      noPromptWizard(),
      dependencies(configDir, { env: {}, store: fakeCredentialStore().store }),
    );

    expect(code).not.toBe(0);
    expect(err.join('\n')).toContain('--output');
    expect(out.join('\n')).not.toContain('wrote suggestion report');
    expect(recording.state.calls).toBe(0);
    expect(await snapshot(root)).toEqual(before);
    await expect(stat(join(root, 'true'))).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Output: stdout, --json, --output
// ---------------------------------------------------------------------------

describe('planmo suggest — output', () => {
  it('prints the rendered report to stdout by default', async () => {
    const root = await suggestWorkspace();
    const configDir = await temporaryDirectory('planmo-suggest-config-');
    const recording = textProvider(reportJson());
    const { io, out } = capture();

    const code = await runSuggestCli(
      ['suggest', '--dir', root, '--provider', 'openai', '--model', 'gpt-test', '--allow-upload'],
      io,
      noPromptWizard(),
      dependencies(configDir, { providerFactory: () => recording.provider }),
    );

    expect(code).toBe(0);
    expect(recording.state.calls).toBe(1);
    expect(out.join('\n')).toContain('PlanMo codebase suggestions');
    expect(out.join('\n')).toContain('Add a unit test for add()');
    expect(out.join('\n')).toContain('src/app.ts:1-3');
  });

  it('--json prints the validated report as parseable JSON', async () => {
    const root = await suggestWorkspace();
    const configDir = await temporaryDirectory('planmo-suggest-config-');
    const recording = textProvider(reportJson());
    const { io, out } = capture();

    const code = await runSuggestCli(
      [
        'suggest',
        '--dir',
        root,
        '--provider',
        'openai',
        '--model',
        'gpt-test',
        '--allow-upload',
        '--json',
      ],
      io,
      noPromptWizard(),
      dependencies(configDir, { providerFactory: () => recording.provider }),
    );

    expect(code).toBe(0);
    const parsed: unknown = JSON.parse(out.join('\n'));
    const result = SuggestionReportSchema.safeParse(parsed);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.provider).toEqual({ id: 'openai', model: 'gpt-test' });
      expect(result.data.suggestions).toHaveLength(1);
      expect(result.data.suggestions[0]?.id).toBe('SUG-001');
    }
  });

  it('--output writes the report when the target is absent', async () => {
    const root = await suggestWorkspace();
    const configDir = await temporaryDirectory('planmo-suggest-config-');
    const recording = textProvider(reportJson());
    const { io, out } = capture();

    const code = await runSuggestCli(
      [
        'suggest',
        '--dir',
        root,
        '--provider',
        'openai',
        '--model',
        'gpt-test',
        '--allow-upload',
        '--output',
        'review.md',
      ],
      io,
      noPromptWizard(),
      dependencies(configDir, { providerFactory: () => recording.provider }),
    );

    expect(code).toBe(0);
    const written = await readFile(join(root, 'review.md'), 'utf8');
    expect(written).toContain('PlanMo codebase suggestions');
    expect(out.join('\n')).toContain('review.md');
  });

  it('--output refuses to overwrite an existing file and leaves it byte-identical', async () => {
    const root = await suggestWorkspace();
    const configDir = await temporaryDirectory('planmo-suggest-config-');
    const target = join(root, 'review.md');
    await writeFile(target, 'MINE\n', 'utf8');
    const recording = textProvider(reportJson());
    const { io, err } = capture();

    const code = await runSuggestCli(
      [
        'suggest',
        '--dir',
        root,
        '--provider',
        'openai',
        '--model',
        'gpt-test',
        '--allow-upload',
        '--output',
        'review.md',
      ],
      io,
      noPromptWizard(),
      dependencies(configDir, { providerFactory: () => recording.provider }),
    );

    expect(code).not.toBe(0);
    expect(err.join('\n')).toContain('refus');
    expect(await readFile(target, 'utf8')).toBe('MINE\n');
  });
});

// ---------------------------------------------------------------------------
// --output never writes into the workspace
// ---------------------------------------------------------------------------

describe('planmo suggest — --output refuses workspace state', () => {
  it.each(['.planmo/plan.yml', '.planmo/state.yml', 'nested/.planmo/report.md'])(
    'refuses --output %s and leaves the workspace unchanged',
    async (target) => {
      const root = await suggestWorkspace();
      const configDir = await temporaryDirectory('planmo-suggest-config-');
      const before = await snapshot(root);
      const recording = textProvider(reportJson());
      const { io, out, err } = capture();

      const code = await runSuggestCli(
        ['suggest', '--dir', root, '--provider', 'mock', '--allow-upload', '--output', target],
        io,
        noPromptWizard(),
        dependencies(configDir, { env: {}, store: fakeCredentialStore().store }),
      );

      expect(code).not.toBe(0);
      expect(err.join('\n')).toContain('.planmo');
      expect(out.join('\n')).not.toContain('wrote suggestion report');
      expect(await snapshot(root)).toEqual(before);
    },
  );

  it('still refuses an --output path that escapes the project root', async () => {
    const root = await suggestWorkspace();
    const configDir = await temporaryDirectory('planmo-suggest-config-');
    const before = await snapshot(root);
    const { io, out, err } = capture();

    const code = await runSuggestCli(
      [
        'suggest',
        '--dir',
        root,
        '--provider',
        'mock',
        '--allow-upload',
        '--output',
        '../escape.md',
      ],
      io,
      noPromptWizard(),
      dependencies(configDir, { env: {}, store: fakeCredentialStore().store }),
    );

    expect(code).not.toBe(0);
    expect(out.join('\n')).not.toContain('wrote suggestion report');
    expect(err.join('\n')).toContain('inside the project root');
    expect(await snapshot(root)).toEqual(before);
  });
});

// ---------------------------------------------------------------------------
// One context build per run (no consent TOCTOU / double scan)
// ---------------------------------------------------------------------------

describe('planmo suggest — single scan', () => {
  it('builds the context once and uses that same result for consent and upload', async () => {
    const root = await suggestWorkspace();
    const configDir = await temporaryDirectory('planmo-suggest-config-');
    const recording = textProvider(reportJson());
    const counting = countingContextEngine();
    let question = '';
    const wizard: WizardIO = {
      ...noPromptWizard(),
      confirm: async (prompt) => {
        question = prompt;
        return true;
      },
    };
    const { io, out } = capture();

    const code = await runSuggestCli(
      ['suggest', '--dir', root, '--provider', 'openai', '--model', 'gpt-test', '--json'],
      io,
      wizard,
      dependencies(configDir, {
        providerFactory: () => recording.provider,
        interactive: true,
        contextEngine: counting.engine,
      }),
    );

    expect(code).toBe(0);
    expect(counting.builds()).toBe(1);
    expect(recording.state.calls).toBe(1);

    const report = SuggestionReportSchema.parse(JSON.parse(out.join('\n')));
    expect(question).toContain('Upload');
    const consentFiles = Number(/Upload (\d+) file/.exec(question)?.[1]);
    expect(consentFiles).toBe(report.coverage.submittedFiles);
  });

  it('builds the context exactly once on a non-interactive --allow-upload run', async () => {
    const root = await suggestWorkspace();
    const configDir = await temporaryDirectory('planmo-suggest-config-');
    const recording = textProvider(reportJson());
    const counting = countingContextEngine();
    const { io } = capture();

    const code = await runSuggestCli(
      ['suggest', '--dir', root, '--provider', 'openai', '--model', 'gpt-test', '--allow-upload'],
      io,
      noPromptWizard(),
      dependencies(configDir, {
        providerFactory: () => recording.provider,
        interactive: false,
        contextEngine: counting.engine,
      }),
    );

    expect(code).toBe(0);
    expect(counting.builds()).toBe(1);
    expect(recording.state.calls).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Failures write nothing
// ---------------------------------------------------------------------------

describe('planmo suggest — failures', () => {
  it('exits non-zero with the diagnostic and writes nothing on malformed output', async () => {
    const root = await suggestWorkspace();
    const configDir = await temporaryDirectory('planmo-suggest-config-');
    const recording = textProvider('not json at all');
    const { io, out, err } = capture();

    const code = await runSuggestCli(
      [
        'suggest',
        '--dir',
        root,
        '--provider',
        'openai',
        '--model',
        'gpt-test',
        '--allow-upload',
        '--output',
        'review.md',
      ],
      io,
      noPromptWizard(),
      dependencies(configDir, { providerFactory: () => recording.provider }),
    );

    expect(code).toBe(1);
    expect(err.join('\n')).toContain('SUG-101');
    expect(out.join('\n')).not.toContain('PlanMo codebase suggestions');
    await expect(readFile(join(root, 'review.md'), 'utf8')).rejects.toThrow();
  });

  it('exits non-zero when evidence cites a file outside the scanned inventory', async () => {
    const root = await suggestWorkspace();
    const configDir = await temporaryDirectory('planmo-suggest-config-');
    const recording = textProvider(
      reportJson({
        suggestions: [
          suggestion({ evidence: [{ path: 'src/ghost.ts', startLine: 1, endLine: 1 }] }),
        ],
      }),
    );
    const { io, out, err } = capture();

    const code = await runSuggestCli(
      ['suggest', '--dir', root, '--provider', 'openai', '--model', 'gpt-test', '--allow-upload'],
      io,
      noPromptWizard(),
      dependencies(configDir, { providerFactory: () => recording.provider }),
    );

    expect(code).toBe(1);
    expect(err.join('\n')).toContain('SUG-103');
    expect(out.join('\n')).not.toContain('PlanMo codebase suggestions');
  });
});

// ---------------------------------------------------------------------------
// Read-only guarantee
// ---------------------------------------------------------------------------

describe('planmo suggest — read-only', () => {
  it('touches no scanned file and never creates .planmo/plan.yml', async () => {
    const root = await suggestWorkspace();
    const configDir = await temporaryDirectory('planmo-suggest-config-');
    const before = await snapshot(root);
    const recording = textProvider(reportJson());
    const { io } = capture();

    const code = await runSuggestCli(
      ['suggest', '--dir', root, '--provider', 'openai', '--model', 'gpt-test', '--allow-upload'],
      io,
      noPromptWizard(),
      dependencies(configDir, { providerFactory: () => recording.provider }),
    );

    expect(code).toBe(0);
    expect(await snapshot(root)).toEqual(before);
    await expect(stat(join(root, '.planmo', 'plan.yml'))).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Offline mock and the router
// ---------------------------------------------------------------------------

describe('planmo suggest — mock and router', () => {
  it('runs fully offline with --provider mock', async () => {
    const root = await suggestWorkspace();
    const configDir = await temporaryDirectory('planmo-suggest-config-');
    const { io, out, err } = capture();

    const code = await runSuggestCli(
      ['suggest', '--dir', root, '--provider', 'mock', '--allow-upload'],
      io,
      noPromptWizard(),
      dependencies(configDir, { env: {}, store: fakeCredentialStore().store }),
    );

    expect(code).toBe(0);
    expect(err.join('\n')).toContain('mock provider');
    expect(out.join('\n')).toContain('PlanMo codebase suggestions');
  });

  it('rejects an unknown option through the router', async () => {
    const { io, err } = capture();

    const code = await run(['suggest', '--bogus'], io, noPromptWizard());

    expect(code).toBe(1);
    expect(err.join('\n')).toContain('unknown option --bogus');
  });
});
