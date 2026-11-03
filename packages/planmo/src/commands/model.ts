import { AiUserConfigSchema } from '@planmo/schema';
import type { AiUserConfig } from '@planmo/schema';
import { listProviderModels, providerPreset } from '@planmo/ai';
import type { ProviderModelList, ProviderPreset } from '@planmo/ai';
import { resolveUserConfigDir } from '../user-config-path.js';
import { readAiUserConfig, writeAiUserConfig } from '../user-config.js';
import { resolveCredential } from '../credential-store.js';
import type { CredentialStore } from '../credential-store.js';
import { KeyringCredentialStore } from '../keyring-credential-store.js';
import type { CliIO, WizardIO } from '../cli-io.js';

export interface ModelCommandDependencies {
  env?: Readonly<Record<string, string | undefined>>;
  configDir?: string;
  store?: CredentialStore;
  fetcher?: typeof fetch;
  interactive?: boolean;
  writeConfig?: (configDir: string, config: AiUserConfig) => Promise<void>;
}

const NO_CREDENTIAL_STORE: CredentialStore = {
  async get() {
    return null;
  },
  async set() {},
  async remove() {},
  async has() {
    return false;
  },
};

function hasTerminal(): boolean {
  return process.stdin.isTTY === true && process.stdout.isTTY === true;
}

function configDirectory(
  dependencies: ModelCommandDependencies,
  env: Readonly<Record<string, string | undefined>>,
): string {
  return dependencies.configDir ?? resolveUserConfigDir({ env: env as NodeJS.ProcessEnv });
}

function modelFailure(io: CliIO, detail: string): number {
  io.err(`planmo model: ${detail}`);
  return 1;
}

async function readDefaultProfile(
  directory: string,
  io: CliIO,
): Promise<{ config: AiUserConfig; profileIndex: number } | null> {
  let config: AiUserConfig | null;
  try {
    config = await readAiUserConfig(directory);
  } catch {
    modelFailure(
      io,
      'saved AI config is invalid or unavailable; run planmo setup to configure a default profile.',
    );
    return null;
  }

  if (config === null || config.defaultProfileId === null) {
    modelFailure(io, 'no saved default AI profile; run planmo setup first.');
    return null;
  }
  const profileIndex = config.profiles.findIndex(({ id }) => id === config.defaultProfileId);
  if (profileIndex < 0) {
    modelFailure(io, 'no saved default AI profile; run planmo setup first.');
    return null;
  }
  return { config, profileIndex };
}

const MODEL_PROFILE_CONFLICT_MESSAGE =
  'saved default AI profile changed while choosing a model; no changes were saved. Retry the command.';

function matchesProfileSnapshot(
  current: AiUserConfig['profiles'][number],
  original: AiUserConfig['profiles'][number],
): boolean {
  return (
    current.providerId === original.providerId &&
    current.modelId === original.modelId &&
    current.baseUrl === original.baseUrl &&
    current.credentialRef === original.credentialRef
  );
}

async function saveModel(
  configDir: string,
  config: AiUserConfig,
  profileIndex: number,
  modelId: string,
  dependencies: ModelCommandDependencies,
  io: CliIO,
): Promise<number> {
  const originalProfile = config.profiles[profileIndex];
  if (originalProfile === undefined || config.defaultProfileId !== originalProfile.id) {
    return modelFailure(io, MODEL_PROFILE_CONFLICT_MESSAGE);
  }

  let currentConfig: AiUserConfig | null;
  try {
    // This catches changes made while prompting; no lock closes the remaining
    // race with another writer after this read.
    currentConfig = await readAiUserConfig(configDir);
  } catch {
    return modelFailure(io, MODEL_PROFILE_CONFLICT_MESSAGE);
  }
  if (currentConfig === null || currentConfig.defaultProfileId !== originalProfile.id) {
    return modelFailure(io, MODEL_PROFILE_CONFLICT_MESSAGE);
  }

  const currentProfileIndex = currentConfig.profiles.findIndex(
    ({ id }) => id === originalProfile.id,
  );
  const currentProfile =
    currentProfileIndex < 0 ? undefined : currentConfig.profiles[currentProfileIndex];
  if (currentProfile === undefined || !matchesProfileSnapshot(currentProfile, originalProfile)) {
    return modelFailure(io, MODEL_PROFILE_CONFLICT_MESSAGE);
  }

  const profiles = currentConfig.profiles.map((profile, index) =>
    index === currentProfileIndex ? { ...profile, modelId } : profile,
  );
  const result = AiUserConfigSchema.safeParse({ ...currentConfig, profiles });
  if (!result.success) {
    return modelFailure(
      io,
      'could not validate the selected model id; the saved config was not changed.',
    );
  }

  try {
    await (dependencies.writeConfig ?? writeAiUserConfig)(configDir, result.data);
  } catch {
    return modelFailure(
      io,
      'could not save the default model; run planmo setup to check the saved profile.',
    );
  }
  io.out('Default profile model updated.');
  return 0;
}

async function promptManualModel(
  wizard: WizardIO,
  io: CliIO,
  note: string,
): Promise<string | null> {
  io.out(note);
  const modelId = await wizard.prompt('Model id');
  if (typeof modelId !== 'string' || modelId.trim() === '') {
    io.out('No model id entered; selection cancelled.');
    return null;
  }
  return modelId;
}

function credentialStore(
  dependencies: ModelCommandDependencies,
  env: Readonly<Record<string, string | undefined>>,
  providerEnvName: string,
  credentialRef: string | null,
): CredentialStore {
  if (dependencies.store !== undefined) return dependencies.store;
  const envValue = env[providerEnvName];
  if (typeof envValue === 'string' && envValue.trim() !== '') return NO_CREDENTIAL_STORE;
  if (credentialRef === null) return NO_CREDENTIAL_STORE;
  return new KeyringCredentialStore();
}

async function loadProviderModelList(
  profile: AiUserConfig['profiles'][number],
  preset: ProviderPreset,
  dependencies: ModelCommandDependencies,
  env: Readonly<Record<string, string | undefined>>,
  reportFallback: (note: string) => void,
): Promise<ProviderModelList | null> {
  let credential: string | null;
  try {
    credential = await resolveCredential({
      envName: preset.credentialEnv,
      env,
      credentialRef: profile.credentialRef,
      store: credentialStore(dependencies, env, preset.credentialEnv, profile.credentialRef),
    });
  } catch {
    reportFallback('No usable provider credential is available; enter a manual model id.');
    return null;
  }

  if (credential === null) {
    reportFallback('No provider credential is available; enter a manual model id.');
    return null;
  }

  try {
    return await listProviderModels({
      providerId: preset.id,
      credential,
      ...(dependencies.fetcher !== undefined ? { fetcher: dependencies.fetcher } : {}),
    });
  } catch {
    reportFallback('Provider model discovery failed; enter a manual model id.');
    return null;
  }
}

async function interactiveModelSelection(
  configDir: string,
  config: AiUserConfig,
  profileIndex: number,
  wizard: WizardIO,
  io: CliIO,
  dependencies: ModelCommandDependencies,
  env: Readonly<Record<string, string | undefined>>,
): Promise<number> {
  const profile = config.profiles[profileIndex]!;
  const preset = providerPreset(profile.providerId);

  if (preset === undefined || preset.modelList === null) {
    const modelId = await promptManualModel(
      wizard,
      io,
      'Model discovery is unavailable for this provider; enter a manual model id.',
    );
    return modelId === null
      ? 0
      : saveModel(configDir, config, profileIndex, modelId, dependencies, io);
  }

  let fallbackNote = '';
  const catalog = await loadProviderModelList(profile, preset, dependencies, env, (note) => {
    fallbackNote = note;
  });
  if (catalog === null) {
    const modelId = await promptManualModel(wizard, io, fallbackNote);
    return modelId === null
      ? 0
      : saveModel(configDir, config, profileIndex, modelId, dependencies, io);
  }

  if (catalog.modelIds.length === 0) {
    const emptyListMessage = catalog.truncated
      ? 'No provider-reported model ids were returned, and the provider-reported model list is incomplete; enter a manual model id.'
      : 'No provider-reported model ids were returned; enter a manual model id.';
    const modelId = await promptManualModel(wizard, io, emptyListMessage);
    return modelId === null
      ? 0
      : saveModel(configDir, config, profileIndex, modelId, dependencies, io);
  }

  io.out('The following ids are provider-reported; PlanMo compatibility is not guaranteed.');
  if (catalog.truncated) {
    io.out(
      'The provider-reported model list is incomplete; enter a model id manually if it is missing.',
    );
  }
  const manualValue = catalog.modelIds.length;
  const choices = [
    ...catalog.modelIds.map((modelId, index) => ({ value: index, label: modelId })),
    { value: manualValue, label: 'Enter a model id manually' },
  ];
  const selected = await wizard.select<number>(
    'Choose a provider-reported model id (compatibility is not guaranteed)',
    choices,
  );
  if (selected === undefined) {
    io.out('Model selection cancelled; the saved profile was not changed.');
    return 0;
  }
  if (!Number.isInteger(selected) || selected < 0 || selected > manualValue) {
    return modelFailure(io, 'model selection was invalid; the saved profile was not changed.');
  }

  const modelId =
    selected === manualValue
      ? await promptManualModel(
          wizard,
          io,
          'Enter a manual model id for the saved default profile.',
        )
      : catalog.modelIds[selected];
  return modelId === null || modelId === undefined
    ? 0
    : saveModel(configDir, config, profileIndex, modelId, dependencies, io);
}

/** Change only the saved default profile's model id; no workspace is required. */
export async function runModelCommand(
  argv: string[],
  io: CliIO,
  wizard: WizardIO,
  dependencies: ModelCommandDependencies = {},
): Promise<number> {
  if (argv.length > 1) {
    return modelFailure(io, 'expected exactly one positional model id.');
  }
  const explicitModelId = argv[0];
  if (explicitModelId?.startsWith('--')) {
    return modelFailure(io, 'option-like model ids are not accepted.');
  }
  if (explicitModelId !== undefined && explicitModelId.trim() === '') {
    return modelFailure(io, 'model id must not be blank.');
  }
  if (explicitModelId === undefined && !(dependencies.interactive ?? hasTerminal())) {
    return modelFailure(
      io,
      'requires an interactive terminal; pass a model id or run planmo setup.',
    );
  }

  const env = dependencies.env ?? process.env;
  const configDir = configDirectory(dependencies, env);
  const saved = await readDefaultProfile(configDir, io);
  if (saved === null) return 1;

  if (explicitModelId !== undefined) {
    return saveModel(
      configDir,
      saved.config,
      saved.profileIndex,
      explicitModelId,
      dependencies,
      io,
    );
  }

  return interactiveModelSelection(
    configDir,
    saved.config,
    saved.profileIndex,
    wizard,
    io,
    dependencies,
    env,
  );
}
