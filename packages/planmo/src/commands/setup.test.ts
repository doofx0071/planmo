import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { PROVIDER_PRESETS } from '@planmo/ai';
import type { AiUserConfig } from '@planmo/schema';
import type { CliIO, WizardIO } from '../cli-io.js';
import { resolveCredential, type CredentialStore } from '../credential-store.js';
import { readAiUserConfig, writeAiUserConfig } from '../user-config.js';
import { run } from '../index.js';

type SetupTestDependencies = {
  env?: Readonly<Record<string, string | undefined>>;
  configDir?: string;
  credentialStore?: CredentialStore;
  createId?: () => string;
  interactive?: boolean;
  writeConfig?: (configDir: string, config: AiUserConfig) => Promise<void>;
};

type SetupCli = (
  argv: string[],
  io: CliIO,
  wizard: WizardIO,
  dependencies?: { setup?: SetupTestDependencies },
) => Promise<number>;

// The injected fourth argument exercises the setup route without mutating process.env.
const runSetup = run as unknown as SetupCli;

function capture() {
  const out: string[] = [];
  const err: string[] = [];
  return {
    io: { out: (line: string) => out.push(line), err: (line: string) => err.push(line) },
    out,
    err,
  };
}

const temporaryDirectories: string[] = [];
async function temporaryDirectory(): Promise<string> {
  const localAppData = process.env.LOCALAPPDATA;
  const scratchRoot =
    localAppData === undefined ? undefined : join(localAppData, 'hermes', 'cache', 'scratch');
  const root = scratchRoot !== undefined && existsSync(scratchRoot) ? scratchRoot : tmpdir();
  const directory = await mkdtemp(join(root, 'planmo-setup-'));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  while (temporaryDirectories.length > 0) {
    await rm(temporaryDirectories.pop()!, { recursive: true, force: true });
  }
});

function deterministicIds(start = 1): () => string {
  let next = start;
  return () => `00000000-0000-4000-8000-${String(next++).padStart(12, '0')}`;
}

function setupDependencies(
  configDir: string,
  credentialStore: CredentialStore,
  overrides: SetupTestDependencies = {},
): { setup: SetupTestDependencies } {
  return {
    setup: {
      env: {},
      configDir,
      credentialStore,
      createId: deterministicIds(),
      interactive: true,
      ...overrides,
    },
  };
}

function fakeCredentialStore(
  initial: Readonly<Record<string, string>> = {},
  setFailure?: Error,
  removeFailure?: Error,
) {
  const values = new Map(Object.entries(initial));
  const gets: string[] = [];
  const sets: Array<{ ref: string; value: string }> = [];
  const removes: string[] = [];
  const store: CredentialStore = {
    async get(ref) {
      gets.push(ref);
      return values.get(ref) ?? null;
    },
    async set(ref, value) {
      sets.push({ ref, value });
      if (setFailure !== undefined) throw setFailure;
      values.set(ref, value);
    },
    async remove(ref) {
      removes.push(ref);
      if (removeFailure !== undefined) throw removeFailure;
      values.delete(ref);
    },
    async has(ref) {
      const value = values.get(ref);
      return value !== undefined && value.trim() !== '';
    },
  };
  return { store, values, gets, sets, removes };
}

function scriptedWizard(
  options: {
    selections?: Array<string | undefined>;
    prompts?: string[];
    password?: string | undefined;
  } = {},
) {
  const selections = [...(options.selections ?? [])];
  const prompts = [...(options.prompts ?? [])];
  const selectCalls: Array<{
    question: string;
    values: string[];
    labels: string[];
    hints: string[];
  }> = [];
  const promptCalls: string[] = [];
  const passwordCalls: string[] = [];
  const wizard: WizardIO = {
    async prompt(question) {
      promptCalls.push(question);
      return prompts.shift() ?? '';
    },
    async password(question) {
      passwordCalls.push(question);
      return options.password;
    },
    async select<T extends string | boolean | number>(
      question: string,
      choices: Array<{ value: T; label: string; hint?: string }>,
    ) {
      selectCalls.push({
        question,
        values: choices.map((choice) => String(choice.value)),
        labels: choices.map((choice) => choice.label),
        hints: choices.map((choice) => choice.hint ?? ''),
      });
      const selection = selections.shift();
      return choices.find((choice) => choice.value === selection)?.value;
    },
    async multiSelect<T extends string | boolean | number>() {
      return undefined;
    },
    async confirm() {
      return undefined;
    },
    out() {},
  };
  return { wizard, selectCalls, promptCalls, passwordCalls };
}

function profile(
  id: string,
  providerId: string,
  modelId: string,
  credentialRef: string | null,
  baseUrl: string | null = null,
) {
  return { id, providerId, modelId, baseUrl, credentialRef };
}

const uuid = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;

describe('planmo setup', () => {
  it('selects a current preset, stores a masked API key, and saves only its reference', async () => {
    const configDir = await temporaryDirectory();
    const secret = 'synthetic-api-key-never-print-this';
    const credentialStore = fakeCredentialStore();
    const prompts = scriptedWizard({
      selections: ['openai'],
      prompts: ['gpt-4.1-mini'],
      password: secret,
    });
    const { io, out, err } = capture();

    const code = await runSetup(
      ['setup'],
      io,
      prompts.wizard,
      setupDependencies(configDir, credentialStore.store, { createId: deterministicIds(10) }),
    );

    expect(code).toBe(0);
    expect(err).toEqual([]);
    expect(prompts.selectCalls[0]?.values).toEqual(PROVIDER_PRESETS.map(({ id }) => id));
    expect(credentialStore.sets).toEqual([{ ref: uuid(11), value: secret }]);
    const config = await readAiUserConfig(configDir);
    expect(config).toEqual({
      schemaVersion: 1,
      profiles: [profile(uuid(10), 'openai', 'gpt-4.1-mini', uuid(11))],
      defaultProfileId: uuid(10),
    });
    const serialized = await readFile(join(configDir, 'config.json'), 'utf8');
    expect(serialized).not.toContain(secret);
    expect(`${out.join('\n')}\n${err.join('\n')}`).not.toContain(secret);
    expect(out.join('\n')).toContain('openai');
    expect(out.join('\n')).toContain('gpt-4.1-mini');
    expect(out.join('\n').toLowerCase()).toContain('keyring');
  });

  it('offers a configured environment variable or a masked keyring entry', async () => {
    const configDir = await temporaryDirectory();
    const secret = 'synthetic-openai-env-secret';
    const credentialStore = fakeCredentialStore();
    const prompts = scriptedWizard({
      selections: ['openai', 'env'],
      prompts: ['gpt-4.1-mini'],
      password: 'must-not-be-requested',
    });
    const { io, out, err } = capture();

    const code = await runSetup(
      ['setup'],
      io,
      prompts.wizard,
      setupDependencies(configDir, credentialStore.store, {
        env: { OPENAI_API_KEY: secret },
      }),
    );

    expect(code).toBe(0);
    expect(credentialStore.sets).toEqual([]);
    expect(prompts.passwordCalls).toEqual([]);
    expect(prompts.selectCalls[1]?.values).toEqual(['env', 'keyring']);
    expect(await readAiUserConfig(configDir)).toEqual({
      schemaVersion: 1,
      profiles: [profile(uuid(1), 'openai', 'gpt-4.1-mini', null)],
      defaultProfileId: uuid(1),
    });
    expect(`${out.join('\n')}\n${err.join('\n')}`).not.toContain(secret);
    expect(out.join('\n')).toContain('OPENAI_API_KEY');
  });

  it('preserves an existing keyring reference when the matching profile selects environment auth', async () => {
    const configDir = await temporaryDirectory();
    const matchingProfile = profile(uuid(1), 'openai', 'gpt-4.1-mini', uuid(2));
    await writeAiUserConfig(configDir, {
      schemaVersion: 1,
      profiles: [matchingProfile],
      defaultProfileId: uuid(1),
    });
    const keyringSecret = 'synthetic-retained-keyring-secret';
    const environmentSecret = 'synthetic-openai-env-secret';
    const credentialStore = fakeCredentialStore({ [uuid(2)]: keyringSecret });
    const prompts = scriptedWizard({
      selections: ['openai', 'env'],
      prompts: ['gpt-4.1-mini'],
    });
    const { io, out, err } = capture();

    const code = await runSetup(
      ['setup'],
      io,
      prompts.wizard,
      setupDependencies(configDir, credentialStore.store, {
        env: { OPENAI_API_KEY: environmentSecret },
      }),
    );

    expect(code).toBe(0);
    expect(await readAiUserConfig(configDir)).toEqual({
      schemaVersion: 1,
      profiles: [matchingProfile],
      defaultProfileId: uuid(1),
    });
    expect(credentialStore.sets).toEqual([]);
    expect(credentialStore.removes).toEqual([]);
    expect(credentialStore.values.get(uuid(2))).toBe(keyringSecret);
    expect(`${out.join('\n')}\n${err.join('\n')}`).not.toContain(keyringSecret);
    expect(`${out.join('\n')}\n${err.join('\n')}`).not.toContain(environmentSecret);
  });

  it('labels and reports that a nonblank environment credential overrides a newly saved keyring entry', async () => {
    const configDir = await temporaryDirectory();
    const environmentSecret = 'synthetic-openai-env-secret';
    const keyringSecret = 'synthetic-new-keyring-secret';
    const env = { OPENAI_API_KEY: environmentSecret };
    const credentialStore = fakeCredentialStore();
    const prompts = scriptedWizard({
      selections: ['openai', 'keyring'],
      prompts: ['gpt-4.1-mini'],
      password: keyringSecret,
    });
    const { io, out, err } = capture();

    const code = await runSetup(
      ['setup'],
      io,
      prompts.wizard,
      setupDependencies(configDir, credentialStore.store, { env }),
    );

    expect(code).toBe(0);
    const savedProfile = (await readAiUserConfig(configDir))?.profiles[0];
    expect(savedProfile?.credentialRef).toBe(uuid(2));
    expect(credentialStore.values.get(uuid(2))).toBe(keyringSecret);
    expect(prompts.selectCalls[1]?.labels[1]).toContain('OPENAI_API_KEY');
    expect(prompts.selectCalls[1]?.hints[1]).toContain('OPENAI_API_KEY');
    expect(prompts.selectCalls[1]?.hints[1]?.toLowerCase()).toContain('precedence');
    await expect(
      resolveCredential({
        envName: 'OPENAI_API_KEY',
        env,
        credentialRef: savedProfile?.credentialRef ?? null,
        store: credentialStore.store,
      }),
    ).resolves.toBe(environmentSecret);
    expect(credentialStore.gets).toEqual([]);
    expect(out.join('\n')).toContain('OPENAI_API_KEY');
    expect(out.join('\n').toLowerCase()).toContain('overrides');
    expect(`${out.join('\n')}\n${err.join('\n')}`).not.toContain(environmentSecret);
    expect(`${out.join('\n')}\n${err.join('\n')}`).not.toContain(keyringSecret);
  });

  it('keeps an existing keyring reference when non-interactive setup uses environment auth', async () => {
    const configDir = await temporaryDirectory();
    const matchingProfile = profile(uuid(1), 'openai', 'gpt-4.1-mini', uuid(2));
    await writeAiUserConfig(configDir, {
      schemaVersion: 1,
      profiles: [matchingProfile],
      defaultProfileId: uuid(1),
    });
    const environmentSecret = 'synthetic-openai-env-secret';
    const keyringSecret = 'synthetic-existing-keyring-secret';
    const credentialStore = fakeCredentialStore({ [uuid(2)]: keyringSecret });
    const { io, out, err } = capture();

    const code = await runSetup(
      ['setup', '--provider', 'openai', '--model', 'gpt-4.1-mini'],
      io,
      scriptedWizard().wizard,
      setupDependencies(configDir, credentialStore.store, {
        env: { OPENAI_API_KEY: environmentSecret },
        interactive: false,
      }),
    );

    expect(code).toBe(0);
    expect(await readAiUserConfig(configDir)).toEqual({
      schemaVersion: 1,
      profiles: [matchingProfile],
      defaultProfileId: uuid(1),
    });
    expect(credentialStore.gets).toEqual([]);
    expect(credentialStore.sets).toEqual([]);
    expect(credentialStore.removes).toEqual([]);
    expect(`${out.join('\n')}\n${err.join('\n')}`).not.toContain(environmentSecret);
    expect(`${out.join('\n')}\n${err.join('\n')}`).not.toContain(keyringSecret);
  });

  it.each([
    {
      option: '--provider',
      args: ['--provider', 'openai', '--provider=deepseek', '--model', 'gpt-4.1-mini'],
    },
    {
      option: '--model',
      args: ['--provider', 'openai', '--model', 'first-model', '--model=second-model'],
    },
    {
      option: '--base-url',
      args: [
        '--provider',
        'custom',
        '--model',
        'local-model',
        '--base-url',
        'https://one.example/v1',
        '--base-url=https://two.example/v1',
      ],
    },
  ])(
    'rejects repeated $option flags instead of silently using the last value',
    async ({ option, args }) => {
      const configDir = await temporaryDirectory();
      const credentialStore = fakeCredentialStore();
      const prompts = scriptedWizard();
      const { io, err } = capture();

      const code = await runSetup(
        ['setup', ...args],
        io,
        prompts.wizard,
        setupDependencies(configDir, credentialStore.store, { interactive: false }),
      );

      expect(code).toBe(1);
      expect(err.join('\n')).toContain(`${option} may only be specified once`);
      expect(prompts.selectCalls).toEqual([]);
      expect(prompts.promptCalls).toEqual([]);
      expect(prompts.passwordCalls).toEqual([]);
      expect(credentialStore.sets).toEqual([]);
      expect(await readAiUserConfig(configDir)).toBeNull();
    },
  );

  it('validates custom endpoints before collecting credentials and accepts loopback HTTP', async () => {
    const unsafeConfigDir = await temporaryDirectory();
    const unsafeSecret = 'query-secret-never-echo';
    const unsafeCredentialStore = fakeCredentialStore();
    const unsafePrompts = scriptedWizard({
      selections: ['custom'],
      prompts: [`https://gateway.example/v1?token=${unsafeSecret}`, 'local-model'],
      password: 'not-collected',
    });
    const unsafeCapture = capture();

    const unsafeCode = await runSetup(
      ['setup'],
      unsafeCapture.io,
      unsafePrompts.wizard,
      setupDependencies(unsafeConfigDir, unsafeCredentialStore.store),
    );

    expect(unsafeCode).toBe(1);
    expect(unsafePrompts.promptCalls).toHaveLength(1);
    expect(unsafePrompts.passwordCalls).toEqual([]);
    expect(unsafeCredentialStore.sets).toEqual([]);
    expect(`${unsafeCapture.out.join('\n')}\n${unsafeCapture.err.join('\n')}`).not.toContain(
      unsafeSecret,
    );
    expect(await readAiUserConfig(unsafeConfigDir)).toBeNull();

    const configDir = await temporaryDirectory();
    const credentialStore = fakeCredentialStore();
    const { io } = capture();
    const code = await runSetup(
      [
        'setup',
        '--provider',
        'custom',
        '--model',
        'local-model',
        '--base-url',
        'http://127.0.0.1:11434/v1',
      ],
      io,
      scriptedWizard().wizard,
      setupDependencies(configDir, credentialStore.store, {
        env: { PLANMO_AI_API_KEY: 'synthetic-custom-env-key' },
        interactive: false,
      }),
    );

    expect(code).toBe(0);
    expect(await readAiUserConfig(configDir)).toEqual({
      schemaVersion: 1,
      profiles: [profile(uuid(1), 'custom', 'local-model', null, 'http://127.0.0.1:11434/v1')],
      defaultProfileId: uuid(1),
    });
  });

  it('fails non-interactively without flags and names a safe provider environment variable', async () => {
    const root = await temporaryDirectory();
    const configDir = join(root, 'not-a-directory');
    await writeFile(configDir, 'config reads must not happen');
    const credentialStore = fakeCredentialStore();
    const prompts = scriptedWizard();
    const { io, err } = capture();

    const code = await runSetup(
      ['setup'],
      io,
      prompts.wizard,
      setupDependencies(configDir, credentialStore.store, {
        env: { OPENAI_API_KEY: 'synthetic-env-secret' },
        interactive: false,
      }),
    );

    expect(code).toBe(1);
    expect(err.join('\n')).toContain('Run planmo setup interactively or configure OPENAI_API_KEY');
    expect(prompts.selectCalls).toEqual([]);
    expect(prompts.promptCalls).toEqual([]);
    expect(prompts.passwordCalls).toEqual([]);
    expect(credentialStore.gets).toEqual([]);
  });

  it('accepts provider/model flags non-interactively only with a matching environment credential', async () => {
    const configDir = await temporaryDirectory();
    const secret = 'synthetic-env-secret';
    const credentialStore = fakeCredentialStore();
    const prompts = scriptedWizard();
    const { io, out, err } = capture();

    const code = await runSetup(
      ['setup', '--provider', 'openai', '--model', 'gpt-4.1-mini'],
      io,
      prompts.wizard,
      setupDependencies(configDir, credentialStore.store, {
        env: { OPENAI_API_KEY: secret },
        interactive: false,
      }),
    );

    expect(code).toBe(0);
    expect(await readAiUserConfig(configDir)).toEqual({
      schemaVersion: 1,
      profiles: [profile(uuid(1), 'openai', 'gpt-4.1-mini', null)],
      defaultProfileId: uuid(1),
    });
    expect(prompts.selectCalls).toEqual([]);
    expect(prompts.promptCalls).toEqual([]);
    expect(prompts.passwordCalls).toEqual([]);
    expect(credentialStore.sets).toEqual([]);
    expect(`${out.join('\n')}\n${err.join('\n')}`).not.toContain(secret);
  });

  it('uses an available saved keyring credential non-interactively and preserves other profiles', async () => {
    const configDir = await temporaryDirectory();
    const openAiProfile = profile(uuid(1), 'openai', 'gpt-4.1-mini', uuid(2));
    const otherProfile = profile(uuid(3), 'deepseek', 'deepseek-chat', uuid(4));
    const existing: AiUserConfig = {
      schemaVersion: 1,
      profiles: [openAiProfile, otherProfile],
      defaultProfileId: uuid(3),
    };
    await writeAiUserConfig(configDir, existing);
    const credentialStore = fakeCredentialStore({ [uuid(2)]: 'synthetic-keyring-secret' });
    const prompts = scriptedWizard();
    const { io, out, err } = capture();

    const code = await runSetup(
      ['setup', '--provider', 'openai', '--model', 'gpt-4.1-mini'],
      io,
      prompts.wizard,
      setupDependencies(configDir, credentialStore.store, { interactive: false }),
    );

    expect(code).toBe(0);
    expect(credentialStore.gets).toEqual([uuid(2)]);
    expect(credentialStore.sets).toEqual([]);
    expect(await readAiUserConfig(configDir)).toEqual({
      schemaVersion: 1,
      profiles: [openAiProfile, otherProfile],
      defaultProfileId: uuid(1),
    });
    expect(prompts.selectCalls).toEqual([]);
    expect(prompts.promptCalls).toEqual([]);
    expect(prompts.passwordCalls).toEqual([]);
    expect(`${out.join('\n')}\n${err.join('\n')}`).not.toContain('synthetic-keyring-secret');
  });

  it('does not prompt or write when non-interactive credentials are missing', async () => {
    const configDir = await temporaryDirectory();
    const credentialStore = fakeCredentialStore();
    const prompts = scriptedWizard();
    const { io, err } = capture();

    const code = await runSetup(
      ['setup', '--provider', 'openai', '--model', 'gpt-4.1-mini'],
      io,
      prompts.wizard,
      setupDependencies(configDir, credentialStore.store, { interactive: false }),
    );

    expect(code).toBe(1);
    expect(err.join('\n')).toContain('OPENAI_API_KEY');
    expect(prompts.selectCalls).toEqual([]);
    expect(prompts.promptCalls).toEqual([]);
    expect(prompts.passwordCalls).toEqual([]);
    expect(credentialStore.sets).toEqual([]);
    expect(await readAiUserConfig(configDir)).toBeNull();
  });

  it('treats cancellation and a blank API key as safe no-write outcomes', async () => {
    const cancelledConfigDir = await temporaryDirectory();
    const cancelledStore = fakeCredentialStore();
    const cancelled = scriptedWizard();
    const { io: cancelledIo } = capture();

    const cancelledCode = await runSetup(
      ['setup'],
      cancelledIo,
      cancelled.wizard,
      setupDependencies(cancelledConfigDir, cancelledStore.store),
    );

    expect(cancelledCode).toBe(0);
    expect(await readAiUserConfig(cancelledConfigDir)).toBeNull();
    expect(cancelledStore.sets).toEqual([]);

    const blankConfigDir = await temporaryDirectory();
    const blankStore = fakeCredentialStore();
    const blankPrompts = scriptedWizard({
      selections: ['openai'],
      prompts: ['gpt-4.1-mini'],
      password: ' \t\n ',
    });
    const blankCapture = capture();

    const blankCode = await runSetup(
      ['setup'],
      blankCapture.io,
      blankPrompts.wizard,
      setupDependencies(blankConfigDir, blankStore.store),
    );

    expect(blankCode).toBe(1);
    expect(blankStore.sets).toEqual([]);
    expect(await readAiUserConfig(blankConfigDir)).toBeNull();
    expect(blankCapture.err.join('\n').toLowerCase()).toContain('blank');
  });

  it('redacts keyring failures and removes a newly saved key if config writing fails', async () => {
    const storeSecret = 'synthetic-store-error-secret';
    const cleanupDetail = 'synthetic-cleanup-error-detail';
    const failedStore = fakeCredentialStore(
      {},
      new Error(`keyring rejected ${storeSecret}`),
      new Error(`keyring removal rejected ${cleanupDetail} ${uuid(2)}`),
    );
    const failedStoreConfigDir = await temporaryDirectory();
    const failedStorePrompts = scriptedWizard({
      selections: ['openai'],
      prompts: ['gpt-4.1-mini'],
      password: storeSecret,
    });
    const failedStoreCapture = capture();

    const failedStoreCode = await runSetup(
      ['setup'],
      failedStoreCapture.io,
      failedStorePrompts.wizard,
      setupDependencies(failedStoreConfigDir, failedStore.store),
    );

    expect(failedStoreCode).toBe(1);
    expect(failedStore.removes).toEqual([uuid(2)]);
    expect(
      `${failedStoreCapture.out.join('\n')}\n${failedStoreCapture.err.join('\n')}`,
    ).not.toContain(storeSecret);
    expect(failedStoreCapture.err.join('\n')).not.toContain('keyring rejected');
    expect(failedStoreCapture.err.join('\n')).toContain(
      'unreferenced key may remain in the OS keyring',
    );
    expect(
      `${failedStoreCapture.out.join('\n')}\n${failedStoreCapture.err.join('\n')}`,
    ).not.toContain(cleanupDetail);
    expect(
      `${failedStoreCapture.out.join('\n')}\n${failedStoreCapture.err.join('\n')}`,
    ).not.toContain(uuid(2));
    expect(await readAiUserConfig(failedStoreConfigDir)).toBeNull();

    const configDir = await temporaryDirectory();
    const secret = 'synthetic-config-write-secret';
    const credentialStore = fakeCredentialStore();
    const prompts = scriptedWizard({
      selections: ['openai'],
      prompts: ['gpt-4.1-mini'],
      password: secret,
    });
    const { io, out, err } = capture();
    const writeFailure = new Error(`writer exposed ${secret}`);

    const code = await runSetup(
      ['setup'],
      io,
      prompts.wizard,
      setupDependencies(configDir, credentialStore.store, {
        createId: deterministicIds(20),
        writeConfig: async () => {
          throw writeFailure;
        },
      }),
    );

    expect(code).toBe(1);
    expect(credentialStore.sets).toEqual([{ ref: uuid(21), value: secret }]);
    expect(credentialStore.removes).toEqual([uuid(21)]);
    expect(`${out.join('\n')}\n${err.join('\n')}`).not.toContain(secret);
    expect(err.join('\n')).not.toContain('writer exposed');
    expect(await readAiUserConfig(configDir)).toBeNull();
  });

  it('warns safely when replaced-key cleanup fails after the new profile is saved', async () => {
    const configDir = await temporaryDirectory();
    const oldProfile = profile(uuid(1), 'openai', 'gpt-4.1-mini', uuid(2));
    await writeAiUserConfig(configDir, {
      schemaVersion: 1,
      profiles: [oldProfile],
      defaultProfileId: oldProfile.id,
    });
    const oldSecret = 'synthetic-old-cleanup-key';
    const newSecret = 'synthetic-new-cleanup-key';
    const cleanupDetail = 'synthetic-old-key-removal-detail';
    const credentialStore = fakeCredentialStore(
      { [uuid(2)]: oldSecret },
      undefined,
      new Error(`removal leaked ${cleanupDetail} ${uuid(2)}`),
    );
    const prompts = scriptedWizard({
      selections: ['openai'],
      prompts: ['gpt-4.1-mini'],
      password: newSecret,
    });
    const { io, out, err } = capture();

    const code = await runSetup(
      ['setup'],
      io,
      prompts.wizard,
      setupDependencies(configDir, credentialStore.store, { createId: deterministicIds(10) }),
    );

    expect(code).toBe(0);
    expect((await readAiUserConfig(configDir))?.profiles[0]?.credentialRef).toBe(uuid(10));
    expect(credentialStore.removes).toEqual([uuid(2)]);
    expect(err.join('\n')).toContain('unreferenced key may remain in the OS keyring');
    expect(`${out.join('\n')}\n${err.join('\n')}`).not.toContain(oldSecret);
    expect(`${out.join('\n')}\n${err.join('\n')}`).not.toContain(newSecret);
    expect(`${out.join('\n')}\n${err.join('\n')}`).not.toContain(cleanupDetail);
    expect(`${out.join('\n')}\n${err.join('\n')}`).not.toContain(uuid(2));
  });

  it('warns safely when rollback cleanup fails after config writing fails', async () => {
    const configDir = await temporaryDirectory();
    const secret = 'synthetic-config-rollback-secret';
    const cleanupDetail = 'synthetic-rollback-cleanup-detail';
    const credentialStore = fakeCredentialStore(
      {},
      undefined,
      new Error(`rollback removal leaked ${cleanupDetail} ${uuid(21)}`),
    );
    const prompts = scriptedWizard({
      selections: ['openai'],
      prompts: ['gpt-4.1-mini'],
      password: secret,
    });
    const { io, out, err } = capture();

    const code = await runSetup(
      ['setup'],
      io,
      prompts.wizard,
      setupDependencies(configDir, credentialStore.store, {
        createId: deterministicIds(20),
        writeConfig: async () => {
          throw new Error(`writer exposed ${secret}`);
        },
      }),
    );

    expect(code).toBe(1);
    expect(credentialStore.removes).toEqual([uuid(21)]);
    expect(err.join('\n')).toContain('unreferenced key may remain in the OS keyring');
    expect(`${out.join('\n')}\n${err.join('\n')}`).not.toContain(secret);
    expect(`${out.join('\n')}\n${err.join('\n')}`).not.toContain(cleanupDetail);
    expect(`${out.join('\n')}\n${err.join('\n')}`).not.toContain('writer exposed');
    expect(`${out.join('\n')}\n${err.join('\n')}`).not.toContain(uuid(21));
    expect(await readAiUserConfig(configDir)).toBeNull();
  });

  it('upserts the matching profile, keeps its identity, and preserves unrelated profiles', async () => {
    const configDir = await temporaryDirectory();
    const matchingProfile = profile(uuid(1), 'openai', 'gpt-4.1-mini', uuid(2));
    const unrelatedProfile = profile(uuid(3), 'deepseek', 'deepseek-chat', null);
    await writeAiUserConfig(configDir, {
      schemaVersion: 1,
      profiles: [matchingProfile, unrelatedProfile],
      defaultProfileId: uuid(3),
    });
    const oldSecret = 'synthetic-old-key';
    const newSecret = 'synthetic-new-key';
    const credentialStore = fakeCredentialStore({ [uuid(2)]: oldSecret });
    const prompts = scriptedWizard({
      selections: ['openai'],
      prompts: ['gpt-4.1-mini'],
      password: newSecret,
    });
    const { io, out, err } = capture();

    const code = await runSetup(
      ['setup'],
      io,
      prompts.wizard,
      setupDependencies(configDir, credentialStore.store, { createId: deterministicIds(10) }),
    );

    expect(code).toBe(0);
    expect(credentialStore.sets).toEqual([{ ref: uuid(10), value: newSecret }]);
    expect(credentialStore.removes).toEqual([uuid(2)]);
    expect(await readAiUserConfig(configDir)).toEqual({
      schemaVersion: 1,
      profiles: [profile(uuid(1), 'openai', 'gpt-4.1-mini', uuid(10)), unrelatedProfile],
      defaultProfileId: uuid(1),
    });
    expect(`${out.join('\n')}\n${err.join('\n')}`).not.toContain(oldSecret);
    expect(`${out.join('\n')}\n${err.join('\n')}`).not.toContain(newSecret);
  });

  it('prints setup help without reading or writing AI config', async () => {
    const root = await temporaryDirectory();
    const configDir = join(root, 'config-is-a-file');
    await writeFile(configDir, 'not a config directory');
    const credentialStore = fakeCredentialStore();
    const prompts = scriptedWizard();
    const { io, out, err } = capture();

    const code = await runSetup(
      ['setup', '--help'],
      io,
      prompts.wizard,
      setupDependencies(configDir, credentialStore.store),
    );

    expect(code).toBe(0);
    expect(out.join('\n')).toContain('setup options:');
    expect(err).toEqual([]);
    expect(prompts.selectCalls).toEqual([]);
    expect(prompts.promptCalls).toEqual([]);
    expect(prompts.passwordCalls).toEqual([]);
    expect(credentialStore.gets).toEqual([]);
    expect(credentialStore.sets).toEqual([]);
  });
});
