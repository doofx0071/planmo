import { resolve } from 'node:path';
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
import { ProjectNotFoundError, readStatus } from '@planmo/core';
import { AiEndpointUrlSchema } from '@planmo/schema';
import type { AiProfile, AiUserConfig } from '@planmo/schema';
import { resolveCredential, type CredentialStore } from '../credential-store.js';
import { parseArgs, type CliIO } from '../cli-io.js';
import { KeyringCredentialStore } from '../keyring-credential-store.js';
import { runPlan, renderPlanSummary } from '../plan.js';
import { mockPlanResponse } from '../plan-build.js';
import { resolveUserConfigDir } from '../user-config-path.js';
import { readAiUserConfig } from '../user-config.js';

/**
 * `planmo plan` — author `.planmo/plan.yml` with a model, once (ADR-0027).
 *
 * The model never runs inside `generate`; this command is the single place a
 * provider is called, and its output is validated before it is written.
 */
export interface PlanCommandDependencies {
  /** The user-scoped AI config directory; defaults to the platform PlanMo directory. */
  configDir?: string;
  /** Environment variables used for provider selection and credential precedence. */
  env?: Readonly<Record<string, string | undefined>>;
  /** Credential store used only for a saved profile's opaque credential reference. */
  store?: CredentialStore;
  /** HTTP-provider seam for tests; production uses the real HTTP provider. */
  providerFactory?: (config: HttpProviderConfig) => ModelProvider;
}

function defaultProfile(config: AiUserConfig | null): AiProfile | undefined {
  if (config === null || config.defaultProfileId === null) return undefined;
  return config.profiles.find((profile) => profile.id === config.defaultProfileId);
}

function reportMissingModel(io: CliIO): 1 {
  io.err('planmo plan: a model is required — pass --model <slug>.');
  io.err('  e.g. --provider tokenharbor --model deepseek/deepseek-v4-flash');
  return 1;
}

function reportProviderResolutionFailure(
  io: CliIO,
  resolved: Extract<ProviderResolution, { configured: false }>,
): void {
  io.err(`planmo plan: no model provider is configured (${resolved.reason}).`);
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

export async function runPlanCommand(
  argv: string[],
  io: CliIO,
  dependencies: PlanCommandDependencies = {},
): Promise<number> {
  const { flags, positional } = parseArgs(argv);
  const root = resolve(flags.get('dir') ?? process.cwd());
  const idea = (flags.get('idea') ?? positional.join(' ')).trim();
  if (idea === '') {
    io.err('planmo plan: an idea is required');
    io.err('  usage: planmo plan "<idea>" [--dir <path>] [--provider <id>] [--model <slug>]');
    return 1;
  }

  // The workspace check comes BEFORE provider resolution, deliberately. A user in
  // the wrong directory should be told that, not told to set an API key — and it
  // keeps the documented exit contract (3 = no project found here) true regardless
  // of what credentials happen to be configured.
  try {
    await readStatus({ root });
  } catch (err) {
    if (err instanceof ProjectNotFoundError) {
      io.err(`planmo plan: ${(err as Error).message}`);
      return 3;
    }
    throw err;
  }

  const requested = flags.get('provider');
  const model = flags.get('model');
  const baseUrl = flags.get('base-url');

  if (baseUrl !== undefined && !AiEndpointUrlSchema.safeParse(baseUrl).success) {
    io.err(
      'planmo plan: --base-url must be HTTPS or loopback HTTP without userinfo, query parameters, or a fragment.',
    );
    return 1;
  }

  let provider: ModelProvider;
  let providerId: string;
  let modelId: string;

  if (requested === 'mock') {
    // Explicitly requested, never selected implicitly: the mock exists so the whole
    // path can be exercised offline, and it says plainly that it is simulated.
    modelId = model ?? 'mock';
    if (modelId.trim() === '') return reportMissingModel(io);
    provider = createMockProvider({ text: mockPlanResponse(idea) });
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
      io.err('planmo plan: could not read the AI profile configuration; no provider was created.');
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
          'planmo plan: the saved default profile uses an unsupported provider; pass --provider to select a supported provider.',
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
        `planmo plan: secure credential storage is unavailable; configure ${preset.credentialEnv} instead.`,
      );
      return 1;
    }
    if (apiKey === null) {
      io.err(`planmo plan: no model provider is configured (missing-credential).`);
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

  try {
    const outcome = await runPlan({
      root,
      idea,
      provider,
      providerId,
      model: modelId,
      ...(flags.has('dry-run') ? { dryRun: true } : {}),
      ...(flags.has('force') ? { allowOverwrite: true } : {}),
    });
    io.out(renderPlanSummary(outcome));
    // A plan that failed validation is a failure of the command: nothing was
    // written, and the caller needs to know that. A refused overwrite is the
    // documented collision code, like every other writing command.
    if (!outcome.ok) return 1;
    return outcome.collisions.length > 0 ? 2 : 0;
  } catch (err) {
    io.err(`planmo plan: ${(err as Error).message}`);
    return err instanceof ProjectNotFoundError ? 3 : 1;
  }
}
