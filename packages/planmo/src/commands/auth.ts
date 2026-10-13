import { providerPreset } from '@planmo/ai';
import { AiProfileSchema, type AiProfile, type AiUserConfig } from '@planmo/schema';
import { PRODUCT_SLUG } from '@planmo/shared';
import { type CliIO, parseArgs, type WizardIO } from '../cli-io.js';
import { type CredentialStore } from '../credential-store.js';
import { KeyringCredentialStore } from '../keyring-credential-store.js';
import { readAiUserConfig, writeAiUserConfig } from '../user-config.js';
import { resolveUserConfigDir } from '../user-config-path.js';

export interface AuthCommandDependencies {
  env?: Readonly<Record<string, string | undefined>>;
  configDir?: string;
  store?: CredentialStore;
  interactive?: boolean;
  /** Persistence seam for deterministic failure testing; production uses the atomic writer. */
  writeConfig?: (configDir: string, config: AiUserConfig) => Promise<void>;
}

type CredentialAvailability = 'available' | 'missing';

function argumentError(io: CliIO, message: string): 1 {
  io.err(`${PRODUCT_SLUG} auth: ${message}`);
  io.err(`Run '${PRODUCT_SLUG} auth --help' for usage.`);
  return 1;
}

function safeDisplay(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f-\u009f]/g, (character) => {
    const code = character.charCodeAt(0).toString(16).padStart(4, '0');
    return `\\u${code}`;
  });
}

function normalizedProfileId(value: string): string | null {
  const parsed = AiProfileSchema.safeParse({
    id: value,
    providerId: 'openai',
    modelId: 'auth-profile-id-validation',
    baseUrl: null,
    credentialRef: null,
  });
  return parsed.success ? parsed.data.id : null;
}

function profileCredentialStatus(
  profile: AiProfile,
  env: Readonly<Record<string, string | undefined>>,
): CredentialAvailability | { keyringRef: string } {
  const preset = providerPreset(profile.providerId);
  if (preset === undefined) return 'missing';

  const environmentCredential = env[preset.credentialEnv];
  if (typeof environmentCredential === 'string' && environmentCredential.trim() !== '') {
    return 'available';
  }
  if (profile.credentialRef === null) return 'missing';
  return { keyringRef: profile.credentialRef };
}

async function runStatus(
  io: CliIO,
  dependencies: AuthCommandDependencies,
  env: Readonly<Record<string, string | undefined>>,
  configDir: string,
): Promise<number> {
  let config: AiUserConfig | null;
  try {
    config = await readAiUserConfig(configDir);
  } catch {
    io.err(`${PRODUCT_SLUG} auth: saved AI profiles could not be read.`);
    return 1;
  }

  if (config === null || config.profiles.length === 0) {
    io.out(`No saved AI profiles. Run \`${PRODUCT_SLUG} setup\` to add one.`);
    return 0;
  }

  let defaultStore: CredentialStore | undefined;
  const rows: Array<{ profile: AiProfile; status: CredentialAvailability }> = [];
  for (const profile of config.profiles) {
    const availability = profileCredentialStatus(profile, env);
    if (typeof availability === 'string') {
      rows.push({ profile, status: availability });
      continue;
    }

    try {
      const store = dependencies.store ?? (defaultStore ??= new KeyringCredentialStore());
      const available = await store.has(availability.keyringRef);
      rows.push({ profile, status: available ? 'available' : 'missing' });
    } catch {
      io.err(
        `${PRODUCT_SLUG} auth: secure credential storage is unavailable; profile status could not be checked.`,
      );
      return 1;
    }
  }

  io.out('Saved AI profiles:');
  for (const { profile, status } of rows) {
    const marker = config.defaultProfileId === profile.id ? ' (default)' : '';
    io.out(
      `  ${profile.id}  ${safeDisplay(profile.providerId)} / ${safeDisplay(profile.modelId)}${marker} — credential ${status}`,
    );
  }
  return 0;
}

async function runRemove(
  profileId: string,
  confirmedByFlag: boolean,
  io: CliIO,
  wizard: WizardIO,
  dependencies: AuthCommandDependencies,
  interactive: boolean,
  configDir: string,
): Promise<number> {
  if (!confirmedByFlag && !interactive) {
    return argumentError(
      io,
      `profile removal needs a terminal; rerun '${PRODUCT_SLUG} auth remove <profile-id>' with --yes to confirm.`,
    );
  }

  let config: AiUserConfig | null;
  try {
    config = await readAiUserConfig(configDir);
  } catch {
    io.err(`${PRODUCT_SLUG} auth: saved AI profiles could not be read.`);
    return 1;
  }

  if (config === null || config.profiles.length === 0) {
    return argumentError(io, 'no saved AI profiles exist; run setup first.');
  }

  const profile = config.profiles.find((candidate) => candidate.id === profileId);
  if (profile === undefined) return argumentError(io, 'no saved AI profile with that id exists.');

  if (!confirmedByFlag) {
    const disclosure =
      profile.credentialRef === null
        ? 'The saved profile will be removed; no OS keyring credential is attached or will be removed; provider environment variables will remain unchanged.'
        : 'The saved OS keyring credential will be removed; provider environment variables will not be changed.';
    let confirmed: boolean | undefined;
    try {
      confirmed = await wizard.confirm(
        `Remove AI profile ${profile.id} (${safeDisplay(profile.providerId)} / ${safeDisplay(profile.modelId)})? ${disclosure}`,
        false,
      );
    } catch {
      io.err(`${PRODUCT_SLUG} auth: could not confirm profile removal; no changes were made.`);
      return 1;
    }
    if (confirmed !== true) {
      io.out('AI profile removal cancelled; no changes were made.');
      return 0;
    }
  }

  const updatedConfig: AiUserConfig = {
    schemaVersion: config.schemaVersion,
    profiles: config.profiles.filter((candidate) => candidate.id !== profileId),
    defaultProfileId: config.defaultProfileId === profileId ? null : config.defaultProfileId,
  };
  try {
    await (dependencies.writeConfig ?? writeAiUserConfig)(configDir, updatedConfig);
  } catch {
    io.err(
      `${PRODUCT_SLUG} auth: could not save the profile removal; no keyring credential was removed.`,
    );
    return 1;
  }

  if (profile.credentialRef !== null) {
    try {
      const store = dependencies.store ?? new KeyringCredentialStore();
      await store.remove(profile.credentialRef);
    } catch {
      io.err(
        `${PRODUCT_SLUG} auth: warning: profile removed, but an unused key may remain in secure credential storage.`,
      );
    }
  }

  io.out(`Removed AI profile ${profile.id}.`);
  return 0;
}

export async function runAuthCommand(
  argv: string[],
  io: CliIO,
  wizard: WizardIO,
  dependencies: AuthCommandDependencies = {},
): Promise<number> {
  const yesArguments = argv.filter(
    (argument) => argument === '--yes' || argument.startsWith('--yes='),
  );
  if (yesArguments.some((argument) => argument !== '--yes')) {
    return argumentError(io, '--yes does not accept a value.');
  }
  if (yesArguments.length > 1) return argumentError(io, '--yes may only be specified once.');

  const confirmedByFlag = yesArguments.length === 1;
  const { flags, positional } = parseArgs(argv.filter((argument) => argument !== '--yes'));
  if (flags.size > 0) return argumentError(io, 'unexpected auth option.');

  const [subcommand, ...operands] = positional;
  if (subcommand === undefined) {
    return argumentError(io, 'expected status or remove <profile-id>.');
  }

  if (subcommand === 'status') {
    if (confirmedByFlag) return argumentError(io, '--yes is only valid with auth remove.');
    if (operands.length !== 0) return argumentError(io, 'status accepts no additional arguments.');
    const env = dependencies.env ?? process.env;
    const configDir =
      dependencies.configDir ?? resolveUserConfigDir({ env: env as NodeJS.ProcessEnv });
    return runStatus(io, dependencies, env, configDir);
  }

  if (subcommand !== 'remove') return argumentError(io, 'expected status or remove <profile-id>.');
  if (operands.length !== 1) return argumentError(io, 'remove requires exactly one profile UUID.');

  const profileId = normalizedProfileId(operands[0]!);
  if (profileId === null) return argumentError(io, 'profile id must be a valid UUID.');

  const env = dependencies.env ?? process.env;
  const configDir =
    dependencies.configDir ?? resolveUserConfigDir({ env: env as NodeJS.ProcessEnv });
  const interactive =
    dependencies.interactive ?? (process.stdin.isTTY === true && process.stdout.isTTY === true);
  return runRemove(profileId, confirmedByFlag, io, wizard, dependencies, interactive, configDir);
}
