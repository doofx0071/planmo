import { relative, resolve } from 'node:path';
import {
  createHttpProvider,
  createMockProvider,
  providerPreset,
  resolveProvider,
} from '@planmo/ai';
import type {
  HttpProviderConfig,
  ModelProvider,
  ProviderPreset,
  ProviderResolution,
} from '@planmo/ai';
import { ProjectNotFoundError, readStatus, writeManaged } from '@planmo/core';
import { AiEndpointUrlSchema, SCHEMA_VERSION } from '@planmo/schema';
import type { AiProfile, AiUserConfig } from '@planmo/schema';
import { nodeFileReader, suggestionContextEngine } from '@planmo/scanner';
import type {
  FileReader,
  SuggestionContextEngine,
  SuggestionContextOptions,
  SuggestionContextResult,
} from '@planmo/scanner';
import { resolveCredential, type CredentialStore } from '../credential-store.js';
import { parseArgs, type CliIO, type WizardIO } from '../cli-io.js';
import { KeyringCredentialStore } from '../keyring-credential-store.js';
import { renderSuggestionReport } from '../suggest-render.js';
import { runSuggest } from '../suggest.js';
import { resolveUserConfigDir } from '../user-config-path.js';
import { readAiUserConfig } from '../user-config.js';

/**
 * `planmo suggest` — consent-gated, read-only codebase suggestions (AI-setup Plan T19).
 *
 * This is the COMMAND boundary around the frozen T18 orchestration
 * (`runSuggest`), the T20 renderer (`renderSuggestionReport`) and the T15
 * context engine. It is deliberately thin and does five things the core does not:
 *
 *  1. it resolves WHICH repository and provider to use (mirroring `planmo plan`:
 *     saved default profile, env-first credentials, keyring fallback, `--provider
 *     mock` offline, and `--base-url` validated BEFORE any credential access);
 *  2. it checks the workspace FIRST, so a user in the wrong directory is told
 *     that (exit 3) rather than told to set an API key;
 *  3. it PREVIEWS the upload and obtains consent before the first provider
 *     request (`--dry-run` never asks and never calls; a non-TTY run needs
 *     `--allow-upload`, which skips ONLY the prompt, never the checks). Consent
 *     is granted by a bare `--allow-upload` or an explicit truthy value
 *     (`true`/`1`/`yes`); `--allow-upload=false`/`0`/`no` is NOT consent;
 *  4. it chooses where the report goes (stdout by default, `--json`, or an
 *     explicit `--output` path that REFUSES to overwrite an existing file and
 *     REFUSES any target inside a `.planmo/` directory);
 *  5. it maps the T18 result to an exit code and prints the T18 diagnostics on
 *     failure. A failed run writes nothing at all.
 *
 * The context is built exactly ONCE per run and that single result drives both
 * the consent summary and the upload, so a repository change cannot make the
 * numbers a user consented to diverge from what ships.
 *
 * WRITE DISCIPLINE: the only path this module writes through is the managed
 * writer (`@planmo/core`), and only when the user passes `--output`. It never
 * creates `.planmo/`, never touches `.planmo/plan.yml` (or any other workspace
 * marker), and never modifies any file in the scanned project — the scan is
 * read-only and the report is rendered from the validated model output, not from
 * re-read source. A valued flag with no value (`--output` with nothing after it)
 * is a usage error, not a write to a file named `true`.
 *
 * `exactOptionalPropertyTypes` is ON: optional fields are omitted, never `undefined`.
 */

export interface SuggestCommandDependencies {
  /** The user-scoped AI config directory; defaults to the platform PlanMo directory. */
  configDir?: string;
  /** Environment variables used for provider selection and credential precedence. */
  env?: Readonly<Record<string, string | undefined>>;
  /** Credential store used only for a saved profile's opaque credential reference. */
  store?: CredentialStore;
  /** HTTP-provider seam for tests; production uses the real HTTP provider. */
  providerFactory?: (config: HttpProviderConfig) => ModelProvider;
  /** Read-only repository access; production uses the node file reader. */
  reader?: FileReader;
  /** Whether prompts can be answered; defaults to a real stdin+stdout TTY check. */
  interactive?: boolean;
  /** Context-engine overrides (e.g. a smaller token budget in tests). */
  context?: SuggestionContextOptions;
  /** Context-engine seam for tests; production uses the real T15 engine. */
  contextEngine?: SuggestionContextEngine;
}

/** A real terminal is required to ask a question (mirrors `model`). */
function hasTerminal(): boolean {
  return process.stdin.isTTY === true && process.stdout.isTTY === true;
}

/**
 * The suggest flags that TAKE a value. A bare or empty one (`--output` with
 * nothing after it) is a usage error, never an implicit default: `parseArgs`
 * stores a valueless flag as the literal `'true'`, so treating it as a path
 * would write a file named `true` and treating it as a provider would resolve a
 * provider named `true`.
 */
const VALUED_SUGGEST_FLAGS = ['dir', 'provider', 'model', 'base-url', 'output'] as const;

/**
 * The only values that affirmatively grant upload consent. Anything else —
 * including `false`, `0`, `no`, or an unrecognized value — is NOT consent. A
 * bare `--allow-upload` (no `=value`) is consent and is recognized separately
 * through the parser's `valueless` set.
 */
const AFFIRMATIVE_FLAG_VALUES: ReadonlySet<string> = new Set(['true', '1', 'yes']);

/** Whether `--allow-upload` grants consent. */
function consentGranted(valueless: ReadonlySet<string>, value: string | undefined): boolean {
  if (valueless.has('allow-upload')) return true;
  return value !== undefined && AFFIRMATIVE_FLAG_VALUES.has(value.trim().toLowerCase());
}

/**
 * True when an `--output` target resolves inside a `.planmo/` directory.
 *
 * `.planmo/` is PlanMo's own workspace state — the `project.yml` / `state.yml` /
 * `manifest.json` markers and everything derived from them. `planmo suggest` is
 * read-only with respect to the workspace, so it refuses any target under a
 * `.planmo/` directory (at the root or nested). Absolute and traversal paths
 * that escape the root are still rejected by the managed writer below.
 */
function resolvesIntoWorkspaceState(root: string, output: string): boolean {
  const absoluteRoot = resolve(root);
  const relativePath = relative(absoluteRoot, resolve(absoluteRoot, output));
  return relativePath.split(/[\\/]+/).includes('.planmo');
}

/** The saved default profile, or undefined when none is configured. */
function defaultProfile(config: AiUserConfig | null): AiProfile | undefined {
  if (config === null || config.defaultProfileId === null) return undefined;
  return config.profiles.find((profile) => profile.id === config.defaultProfileId);
}

/** Estimated input tokens for the whole run (sum of redacted per-file estimates). */
function estimatedTokens(context: SuggestionContextResult): number {
  return context.files.reduce((sum, file) => sum + file.estimatedTokens, 0);
}

/**
 * The `--dry-run` report: exactly what WOULD be uploaded, and an explicit
 * statement that nothing was. It is printed and the command returns without
 * ever resolving a provider, so a dry run cannot leak content or spend tokens.
 */
function renderDryRunSummary(root: string, context: SuggestionContextResult): string {
  const { coverage } = context;
  const skipped = coverage.skippedByReason;
  return [
    'planmo suggest — dry run (nothing is uploaded; no provider is called).',
    `  project root: ${root}`,
    `  inventoried files: ${coverage.totalFiles}`,
    `  submitted files: ${coverage.included}`,
    `  batches: ${coverage.batchCount}`,
    `  estimated input tokens: ${estimatedTokens(context)}`,
    `  excluded files: ${skipped.excluded}`,
    `  skipped (binary ${skipped.binary}, oversize ${skipped.oversize}, unreadable ${skipped.unreadable}, budget ${skipped.budget})`,
    `  truncated: ${coverage.truncated ? 'yes' : 'no'}`,
    '  [dry-run] 0 provider calls; confirm interactively or pass --allow-upload to run.',
  ].join('\n');
}

/** The consent question: the destination and the exact upload size. */
function consentQuestion(
  context: SuggestionContextResult,
  providerId: string,
  modelId: string,
): string {
  const { included, batchCount } = context.coverage;
  return (
    `Upload ${included} file(s) in ${batchCount} batch(es) ` +
    `(~${estimatedTokens(context)} estimated tokens) to ${providerId} (${modelId}) for review?`
  );
}

/** The offline mock's canned response: a valid, empty report (no evidence to verify). */
function mockSuggestResponse(): string {
  return JSON.stringify({
    schemaVersion: SCHEMA_VERSION,
    provider: { id: 'mock', model: 'mock' },
    summary: 'Mock suggestion run; no repository content was analyzed.',
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
    limitations: ['The offline mock provider does not analyze the repository.'],
    suggestions: [],
  });
}

function reportMissingModel(io: CliIO): 1 {
  io.err('planmo suggest: a model is required — pass --model <slug>.');
  io.err('  e.g. --provider tokenharbor --model deepseek/deepseek-v4-flash');
  return 1;
}

function reportProviderResolutionFailure(
  io: CliIO,
  resolved: Extract<ProviderResolution, { configured: false }>,
): void {
  io.err(`planmo suggest: no model provider is configured (${resolved.reason}).`);
  if (resolved.reason === 'missing-credential' && resolved.preset !== undefined) {
    io.err(`  set ${resolved.preset.credentialEnv} to use ${resolved.preset.label}.`);
  } else if (resolved.reason === 'missing-base-url') {
    io.err('  the custom preset needs --base-url <url>.');
  } else {
    io.err('  set one of: TOKENHARBOR_KEY, OPENAI_API_KEY, ANTHROPIC_API_KEY,');
    io.err('             DEEPSEEK_API_KEY, MOONSHOT_API_KEY, XAI_API_KEY, OPENROUTER_API_KEY');
  }
  io.err('  or run with --provider mock to exercise the flow offline.');
}

/** The directory part of a user-supplied path, in POSIX form ('' when there is none). */
function parentDirectory(path: string): string {
  const normalized = path.replace(/\\/g, '/');
  const index = normalized.lastIndexOf('/');
  return index <= 0 ? '' : normalized.slice(0, index);
}

/**
 * Write the report to `--output`.
 *
 * The ONLY sanctioned write path is the managed writer (`@planmo/core`), which
 * enforces root containment, symlink safety, atomic replacement, and — the
 * property that matters here — REFUSES to overwrite an existing file unless
 * `allowOverwrite` is set. `planmo suggest` never sets it, so an existing report
 * is a refusal, not a silent clobber: the file is left byte-identical. There is
 * no `--force` for this command on purpose (the spec says `--output` refuses
 * overwrite), because a suggestion report is a user artifact, not a regenerable
 * workspace file.
 */
async function writeReport(
  io: CliIO,
  root: string,
  output: string,
  content: string,
): Promise<number> {
  if (resolvesIntoWorkspaceState(root, output)) {
    io.err(
      `planmo suggest: refusing --output '${output}': it resolves inside .planmo/, PlanMo's own workspace state; nothing was written.`,
    );
    io.err('  choose a path outside .planmo/ (e.g. review.md).');
    return 1;
  }

  const parent = parentDirectory(output);
  let collisions: readonly string[];
  try {
    const result = await writeManaged(root, [{ path: output, content }], {
      ...(parent === '' ? {} : { contentDirs: [parent] }),
    });
    collisions = result.collisions;
  } catch {
    io.err('planmo suggest: --output must be a path inside the project root; nothing was written.');
    return 1;
  }

  if (collisions.length > 0) {
    io.err(
      `planmo suggest: refusing to overwrite the existing file '${output}'; nothing was written.`,
    );
    io.err('  choose a different --output path.');
    return 1;
  }

  io.out(`wrote suggestion report to ${output}`);
  return 0;
}

export async function runSuggestCommand(
  argv: string[],
  io: CliIO,
  wizard: WizardIO,
  dependencies: SuggestCommandDependencies = {},
): Promise<number> {
  const { flags, valueless } = parseArgs(argv);

  // A valued flag with no value is a usage error, never an implicit default.
  // This runs before the workspace check: `--output` with nothing after it must
  // fail loudly here, not be treated as the literal path `true`.
  for (const name of VALUED_SUGGEST_FLAGS) {
    if (valueless.has(name) || flags.get(name) === '') {
      io.err(`planmo suggest: --${name} needs a value; nothing was written.`);
      return 1;
    }
  }

  const root = resolve(flags.get('dir') ?? process.cwd());

  // The workspace check comes BEFORE provider resolution, deliberately — the
  // documented exit contract (3 = no project found here) must hold regardless of
  // what credentials happen to be configured.
  try {
    await readStatus({ root });
  } catch (err) {
    if (err instanceof ProjectNotFoundError) {
      io.err(`planmo suggest: ${(err as Error).message}`);
      return 3;
    }
    throw err;
  }

  // An explicit endpoint is validated BEFORE any credential access or provider
  // creation, so an unsafe URL can never reach a provider.
  const baseUrl = flags.get('base-url');
  if (baseUrl !== undefined && !AiEndpointUrlSchema.safeParse(baseUrl).success) {
    io.err(
      'planmo suggest: --base-url must be HTTPS or loopback HTTP without userinfo, query parameters, or a fragment.',
    );
    return 1;
  }

  const reader = dependencies.reader ?? nodeFileReader();
  const contextEngine = dependencies.contextEngine ?? suggestionContextEngine();

  // A dry run previews the upload and returns; it never resolves a provider and
  // never asks for consent, so it makes ZERO provider calls by construction.
  if (flags.has('dry-run')) {
    const preview = await contextEngine.build(root, reader, dependencies.context);
    io.out(renderDryRunSummary(root, preview));
    return 0;
  }

  const interactive = dependencies.interactive ?? hasTerminal();
  // Only a bare `--allow-upload`, or an explicit truthy value (`true`/`1`/`yes`),
  // grants consent. `--allow-upload=false` (or `0`, `no`, anything else) is NOT
  // consent: on a non-TTY it exits 1 and on a TTY it still prompts.
  const allowUpload = consentGranted(valueless, flags.get('allow-upload'));

  // A run that uploads repository content needs explicit consent. With no
  // terminal to ask, `--allow-upload` is the documented way to consent.
  if (!interactive && !allowUpload) {
    io.err(
      'planmo suggest: this run uploads repository content to a model provider, which needs explicit consent.',
    );
    io.err('  run it in an interactive terminal to confirm, or pass --allow-upload to consent.');
    return 1;
  }

  const requested = flags.get('provider');
  const model = flags.get('model');

  let provider: ModelProvider;
  let providerId: string;
  let modelId: string;

  if (requested === 'mock') {
    // Explicitly requested, never selected implicitly: the mock exists so the
    // whole path can be exercised offline, and it says plainly that it is simulated.
    modelId = model ?? 'mock';
    if (modelId.trim() === '') return reportMissingModel(io);
    provider = createMockProvider({ text: mockSuggestResponse() });
    providerId = 'mock';
    io.err('note: using the mock provider — output is simulated, not a real model.');
  } else {
    const env = dependencies.env ?? process.env;
    const configDir =
      dependencies.configDir ?? resolveUserConfigDir({ env: env as NodeJS.ProcessEnv });
    let userConfig: AiUserConfig | null;
    try {
      userConfig = await readAiUserConfig(configDir);
    } catch {
      io.err(
        'planmo suggest: could not read the AI profile configuration; no provider was created.',
      );
      return 1;
    }

    const savedDefault = defaultProfile(userConfig);
    const useSavedProfile =
      savedDefault !== undefined &&
      (requested === undefined || requested === savedDefault.providerId);
    let preset: ProviderPreset;
    let effectiveBaseUrl: string;
    let effectiveModel: string | undefined;
    let credentialRef: string | null;

    if (useSavedProfile) {
      const savedPreset = providerPreset(savedDefault.providerId);
      if (savedPreset === undefined) {
        io.err(
          'planmo suggest: the saved default profile uses an unsupported provider; pass --provider to select a supported provider.',
        );
        return 1;
      }
      preset = savedPreset;
      effectiveModel = model ?? savedDefault.modelId;
      effectiveBaseUrl = baseUrl ?? savedDefault.baseUrl ?? savedPreset.baseUrl;
      credentialRef = savedDefault.credentialRef;
      if (effectiveBaseUrl.trim() === '') {
        reportProviderResolutionFailure(io, { configured: false, reason: 'missing-base-url' });
        return 1;
      }
    } else {
      const resolved = resolveProvider({
        ...(requested !== undefined ? { preset: requested } : {}),
        ...(model !== undefined ? { model } : {}),
        ...(baseUrl !== undefined ? { baseUrl } : {}),
        env: { ...env },
      });
      if (!resolved.configured) {
        reportProviderResolutionFailure(io, resolved);
        return 1;
      }
      preset = resolved.preset;
      effectiveBaseUrl = resolved.baseUrl;
      effectiveModel = resolved.model;
      credentialRef = null;
    }

    if (effectiveModel === undefined || effectiveModel.trim() === '') {
      return reportMissingModel(io);
    }

    let apiKey: string | null;
    try {
      apiKey = await resolveCredential({
        envName: preset.credentialEnv,
        credentialRef,
        env,
        store: dependencies.store ?? new KeyringCredentialStore(),
      });
    } catch {
      io.err(
        `planmo suggest: secure credential storage is unavailable; configure ${preset.credentialEnv} instead.`,
      );
      return 1;
    }
    if (apiKey === null) {
      io.err('planmo suggest: no model provider is configured (missing-credential).');
      io.err(`  set ${preset.credentialEnv} to use ${preset.label}.`);
      io.err('  or run with --provider mock to exercise the flow offline.');
      return 1;
    }

    const providerFactory = dependencies.providerFactory ?? createHttpProvider;
    provider = providerFactory({
      baseUrl: effectiveBaseUrl,
      apiKey,
      model: effectiveModel,
      wireFormat: preset.wireFormat,
    });
    providerId = preset.id;
    modelId = effectiveModel;
  }

  // The context is built ONCE and used for BOTH the consent summary and the
  // upload. Building it again inside `runSuggest` would let a repository change
  // between the numbers the user consented to and the bytes that actually ship.
  const context = await contextEngine.build(root, reader, dependencies.context);

  // Consent is asked AFTER the provider is chosen (so the question names the real
  // destination) but BEFORE the first request. `--allow-upload` skips only this
  // prompt — never the workspace, endpoint, or credential checks above.
  if (interactive && !allowUpload) {
    const confirmed = await wizard.confirm(consentQuestion(context, providerId, modelId), false);
    if (confirmed !== true) {
      io.out('planmo suggest: upload declined — nothing was sent and nothing was written.');
      return 0;
    }
  }

  const outcome = await runSuggest({
    provider,
    reader,
    root,
    prebuiltContext: context,
  });

  if (!outcome.ok || outcome.report === null) {
    // A failed run is a failed command: nothing was written, and the caller needs
    // the machine-readable diagnostic to know why.
    io.err('planmo suggest: the suggestion run failed; nothing was written.');
    for (const diagnostic of outcome.diagnostics) {
      io.err(`  ${diagnostic.code} ${diagnostic.message}`);
    }
    return 1;
  }

  const report = outcome.report;
  const content = flags.has('json')
    ? JSON.stringify(report, null, 2)
    : renderSuggestionReport(report);

  const output = flags.get('output');
  if (output !== undefined) {
    return writeReport(io, root, output, content);
  }

  io.out(content);
  return 0;
}
