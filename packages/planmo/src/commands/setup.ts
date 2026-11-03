import { randomUUID } from 'node:crypto';
import { PROVIDER_PRESETS, providerPreset } from '@planmo/ai';
import { AiProfileSchema, AiUserConfigSchema } from '@planmo/schema';
import type { AiProfile, AiUserConfig } from '@planmo/schema';
import { parseArgs, type CliIO, type WizardIO } from '../cli-io.js';
import { resolveCredential, type CredentialStore } from '../credential-store.js';
import { KeyringCredentialStore } from '../keyring-credential-store.js';
import { resolveUserConfigDir } from '../user-config-path.js';
import { readAiUserConfig, writeAiUserConfig } from '../user-config.js';

const URL_VALIDATION_ID = '00000000-0000-4000-8000-000000000000';

type WriteAiUserConfig = (configDir: string, config: AiUserConfig) => Promise<void>;

export interface SetupCommandDependencies {
  /** Credential values are read by provider-declared environment name only. */
  env?: Readonly<Record<string, string | undefined>>;
  configDir?: string;
  credentialStore?: CredentialStore;
  /** Stable identity source for tests; production uses `randomUUID`. */
  createId?: () => string;
  /** Override terminal detection in tests. */
  interactive?: boolean;
  /** Persistence seam for exercising keyring rollback on config-write failure. */
  writeConfig?: WriteAiUserConfig;
}

function isNonBlank(value: string | undefined): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

function missingOptionValue(argv: readonly string[], name: string): boolean {
  return argv.some((arg, index) => {
    if (arg !== `--${name}`) return false;
    const next = argv[index + 1];
    return next === undefined || next.startsWith('--');
  });
}

function repeatedOption(argv: readonly string[], name: string): boolean {
  return argv.filter((arg) => arg === `--${name}` || arg.startsWith(`--${name}=`)).length > 1;
}

function cancel(io: CliIO): 0 {
  io.out('Setup cancelled; no changes were made.');
  return 0;
}

function fail(io: CliIO, message: string): 1 {
  io.err(`planmo setup: ${message}`);
  return 1;
}

function matchingProfile(
  config: AiUserConfig | null,
  providerId: string,
  modelId: string,
  baseUrl: string | null,
): AiProfile | undefined {
  return config?.profiles.find(
    (profile) =>
      profile.providerId === providerId &&
      profile.modelId === modelId &&
      profile.baseUrl === baseUrl,
  );
}

function validateEndpoint(providerId: string, baseUrl: string | null): boolean {
  return AiProfileSchema.safeParse({
    id: URL_VALIDATION_ID,
    providerId,
    modelId: 'setup-validation',
    baseUrl,
    credentialRef: null,
  }).success;
}

function nextConfig(current: AiUserConfig | null, profile: AiProfile): AiUserConfig | undefined {
  const existingProfiles = current?.profiles ?? [];
  const profiles = existingProfiles.some((existing) => existing.id === profile.id)
    ? existingProfiles.map((existing) => (existing.id === profile.id ? profile : existing))
    : [...existingProfiles, profile];
  const result = AiUserConfigSchema.safeParse({
    schemaVersion: 1,
    profiles,
    defaultProfileId: profile.id,
  });
  return result.success ? result.data : undefined;
}

function nonInteractiveGuidance(io: CliIO, envName: string, detail?: string): 1 {
  io.err(
    `Run planmo setup interactively or configure ${envName}${detail === undefined ? '.' : `; ${detail}.`}`,
  );
  return 1;
}

function defaultEnvironmentName(env: Readonly<Record<string, string | undefined>>): string {
  return (
    PROVIDER_PRESETS.find((preset) => isNonBlank(env[preset.credentialEnv]))?.credentialEnv ??
    'OPENAI_API_KEY'
  );
}

async function readConfig(configDir: string, io: CliIO): Promise<AiUserConfig | null | undefined> {
  try {
    return await readAiUserConfig(configDir);
  } catch {
    fail(io, 'could not read the AI profile configuration; no changes were made.');
    return undefined;
  }
}

function warnCredentialCleanupFailure(io: CliIO): void {
  io.err(
    'planmo setup: warning: an unreferenced key may remain in the OS keyring; credential cleanup failed.',
  );
}

async function removeBestEffort(store: CredentialStore, ref: string): Promise<boolean> {
  try {
    await store.remove(ref);
    return true;
  } catch {
    // Never surface keyring implementation errors or credential data.
    return false;
  }
}

export async function runSetupCommand(
  argv: string[],
  io: CliIO,
  wizard: WizardIO,
  dependencies: SetupCommandDependencies = {},
): Promise<number> {
  const env = dependencies.env ?? process.env;
  const configDir =
    dependencies.configDir ?? resolveUserConfigDir({ env: env as NodeJS.ProcessEnv });
  const credentialStore = dependencies.credentialStore ?? new KeyringCredentialStore();
  const createId = dependencies.createId ?? randomUUID;
  const writeConfig = dependencies.writeConfig ?? writeAiUserConfig;
  const interactive =
    dependencies.interactive ?? (process.stdin.isTTY === true && process.stdout.isTTY === true);
  const { flags, positional } = parseArgs(argv);

  for (const option of ['provider', 'model', 'base-url']) {
    if (repeatedOption(argv, option)) return fail(io, `--${option} may only be specified once.`);
  }
  if (positional.length > 0)
    return fail(io, 'use --provider, --model, and --base-url instead of positional values.');
  for (const option of ['provider', 'model', 'base-url']) {
    if (missingOptionValue(argv, option)) return fail(io, `--${option} requires a value.`);
  }

  const providerFlag = flags.get('provider')?.trim();
  let providerId = providerFlag;
  if (providerId === undefined) {
    if (!interactive) {
      return nonInteractiveGuidance(io, defaultEnvironmentName(env));
    }
    const selected = await wizard.select(
      'Choose an AI provider',
      PROVIDER_PRESETS.map((preset) => ({
        value: preset.id,
        label: preset.label,
        hint: `API key via ${preset.credentialEnv}`,
      })),
    );
    if (selected === undefined) return cancel(io);
    providerId = selected;
  }

  const preset = providerPreset(providerId);
  if (preset === undefined) {
    return fail(io, 'unknown provider id; run `planmo provider list` to see supported presets.');
  }

  const baseUrlFlag = flags.get('base-url');
  let baseUrl: string | null = null;
  if (preset.id === 'custom') {
    let enteredBaseUrl = baseUrlFlag?.trim();
    if (enteredBaseUrl === undefined) {
      if (!interactive) {
        return nonInteractiveGuidance(
          io,
          preset.credentialEnv,
          'pass --provider custom --base-url <url> and --model <id>',
        );
      }
      enteredBaseUrl = (await wizard.prompt('Custom endpoint base URL')).trim();
    }
    if (enteredBaseUrl === '' || !validateEndpoint(preset.id, enteredBaseUrl)) {
      return fail(
        io,
        'custom base URL must be HTTPS or loopback HTTP without userinfo, query, or fragment.',
      );
    }
    baseUrl = enteredBaseUrl;
  } else if (baseUrlFlag !== undefined) {
    return fail(io, '--base-url is only valid with the custom provider.');
  }

  const modelFlag = flags.get('model');
  let modelId = modelFlag?.trim();
  if (modelId === undefined) {
    if (!interactive) {
      return nonInteractiveGuidance(
        io,
        preset.credentialEnv,
        'pass --provider <id> and --model <id>',
      );
    }
    modelId = (await wizard.prompt('Model id')).trim();
  }
  if (modelId === '') return fail(io, 'model id must not be blank.');

  const current = await readConfig(configDir, io);
  if (current === undefined) return 1;
  const existing = matchingProfile(current, preset.id, modelId, baseUrl);
  const profileId = existing?.id ?? createId();
  const hasEnvironmentCredential = isNonBlank(env[preset.credentialEnv]);
  let credentialRef: string | null = existing?.credentialRef ?? null;
  let newCredentialRef: string | null = null;
  let secretToStore: string | undefined;
  let usingEnvironmentCredential = hasEnvironmentCredential;

  if (!interactive) {
    let available = hasEnvironmentCredential;
    if (!available) {
      try {
        available =
          (await resolveCredential({
            envName: preset.credentialEnv,
            env,
            credentialRef: existing?.credentialRef ?? null,
            store: credentialStore,
          })) !== null;
      } catch {
        return nonInteractiveGuidance(
          io,
          preset.credentialEnv,
          'secure credential storage is unavailable',
        );
      }
    }
    if (!available) return nonInteractiveGuidance(io, preset.credentialEnv);
    usingEnvironmentCredential = hasEnvironmentCredential;
    if (existing === undefined) credentialRef = null;
  } else {
    if (hasEnvironmentCredential) {
      const authMethod = await wizard.select('Choose how to provide the API key', [
        {
          value: 'env',
          label: `Use ${preset.credentialEnv} from the environment (takes precedence while nonblank)`,
          hint: 'environment credentials are resolved before any saved keyring key; value is never displayed',
        },
        {
          value: 'keyring',
          label: `Save a new API key in the OS keyring (${preset.credentialEnv} currently takes precedence while nonblank)`,
          hint: `${preset.credentialEnv} takes precedence while nonblank; keyring is used only when it is blank`,
        },
      ]);
      if (authMethod === undefined) return cancel(io);
      if (authMethod === 'env') {
        usingEnvironmentCredential = true;
      } else if (authMethod === 'keyring') {
        usingEnvironmentCredential = false;
      } else {
        return fail(io, 'invalid credential selection.');
      }
    } else {
      usingEnvironmentCredential = false;
    }

    if (!usingEnvironmentCredential) {
      const secret = await wizard.password('API key (stored in the OS keyring)');
      if (secret === undefined) return cancel(io);
      if (!isNonBlank(secret)) return fail(io, 'API key must not be blank.');
      secretToStore = secret;
      credentialRef = createId().toLowerCase();
      newCredentialRef = credentialRef;
    }
  }

  const candidateResult = AiProfileSchema.safeParse({
    id: profileId,
    providerId: preset.id,
    modelId,
    baseUrl,
    credentialRef,
  });
  if (!candidateResult.success) {
    return fail(io, 'profile validation failed; no changes were made.');
  }
  const candidate = candidateResult.data;
  const updated = nextConfig(current, candidate);
  if (updated === undefined) {
    return fail(io, 'profile validation failed; no changes were made.');
  }

  if (newCredentialRef !== null) {
    if (secretToStore === undefined) return fail(io, 'API key must not be blank.');
    try {
      await credentialStore.set(newCredentialRef, secretToStore);
    } catch {
      if (!(await removeBestEffort(credentialStore, newCredentialRef))) {
        warnCredentialCleanupFailure(io);
      }
      return fail(
        io,
        `secure credential storage failed; configure ${preset.credentialEnv} instead.`,
      );
    }
  }

  try {
    await writeConfig(configDir, updated);
  } catch {
    if (newCredentialRef !== null && !(await removeBestEffort(credentialStore, newCredentialRef))) {
      warnCredentialCleanupFailure(io);
    }
    return fail(
      io,
      'could not save the AI profile configuration; newly stored credentials were removed when possible.',
    );
  }

  if (
    existing?.credentialRef !== null &&
    existing?.credentialRef !== undefined &&
    existing.credentialRef !== candidate.credentialRef
  ) {
    if (!(await removeBestEffort(credentialStore, existing.credentialRef))) {
      warnCredentialCleanupFailure(io);
    }
  }

  io.out(`AI profile set: ${preset.id} / ${modelId} (default).`);
  const credentialDescription = usingEnvironmentCredential
    ? `${preset.credentialEnv} environment variable`
    : hasEnvironmentCredential
      ? `OS keyring saved; ${preset.credentialEnv} currently overrides it while nonblank`
      : 'OS keyring';
  io.out(`Credential: ${credentialDescription} (secret not displayed).`);
  return 0;
}
