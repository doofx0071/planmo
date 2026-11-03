import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { AiUserConfig } from '@planmo/schema';
import type { CliIO, WizardIO } from '../cli-io.js';
import type { CredentialStore } from '../credential-store.js';
import { run } from '../index.js';
import { readAiUserConfig, writeAiUserConfig } from '../user-config.js';

type AuthTestDependencies = {
  env?: Readonly<Record<string, string | undefined>>;
  configDir?: string;
  store?: CredentialStore;
  interactive?: boolean;
  writeConfig?: (configDir: string, config: AiUserConfig) => Promise<void>;
};

type AuthRoute = (
  argv: string[],
  io: CliIO,
  wizard: WizardIO,
  dependencies?: { auth?: AuthTestDependencies },
) => Promise<number>;

// Exercise auth through the existing CLI route; this keeps RED about behavior,
// rather than an import of the not-yet-created command module.
const runAuth = run as unknown as AuthRoute;

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
async function temporaryConfigDir(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'planmo-auth-'));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  while (temporaryDirectories.length > 0) {
    await rm(temporaryDirectories.pop()!, { recursive: true, force: true });
  }
});

const uuid = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;

function profile(
  id: string,
  providerId = 'openai',
  modelId = 'gpt-4.1-mini',
  credentialRef: string | null = uuid(100),
) {
  return { id, providerId, modelId, baseUrl: null, credentialRef };
}

async function saveConfig(
  configDir: string,
  profiles: AiUserConfig['profiles'],
  defaultProfileId: string | null,
): Promise<void> {
  await writeAiUserConfig(configDir, { schemaVersion: 1, profiles, defaultProfileId });
}

function dependencies(
  configDir: string,
  store: CredentialStore,
  overrides: AuthTestDependencies = {},
): { auth: AuthTestDependencies } {
  return { auth: { env: {}, configDir, store, interactive: true, ...overrides } };
}

function scriptedWizard(
  answer: boolean | undefined = undefined,
  onConfirm?: (question: string) => Promise<void> | void,
) {
  const confirmations: string[] = [];
  const wizard: WizardIO = {
    prompt: async () => '',
    password: async () => undefined,
    select: async <T extends string | boolean | number>() => undefined,
    multiSelect: async <T extends string | boolean | number>() => undefined,
    confirm: async (question) => {
      confirmations.push(question);
      await onConfirm?.(question);
      return answer;
    },
    out: () => {},
  };
  return { wizard, confirmations };
}

type FakeStoreOptions = {
  initial?: Readonly<Record<string, string>>;
  hasResult?: boolean;
  hasFailure?: Error;
  removeFailure?: Error;
  onRemove?: (ref: string) => Promise<void> | void;
};

function fakeStore(options: FakeStoreOptions = {}) {
  const values = new Map(Object.entries(options.initial ?? {}));
  const calls = { gets: [] as string[], has: [] as string[], removes: [] as string[] };
  const store: CredentialStore = {
    async get(ref) {
      calls.gets.push(ref);
      return values.get(ref) ?? null;
    },
    async set(ref, value) {
      values.set(ref, value);
    },
    async remove(ref) {
      calls.removes.push(ref);
      if (options.removeFailure !== undefined) throw options.removeFailure;
      await options.onRemove?.(ref);
      values.delete(ref);
    },
    async has(ref) {
      calls.has.push(ref);
      if (options.hasFailure !== undefined) throw options.hasFailure;
      if (options.hasResult !== undefined) return options.hasResult;
      const value = values.get(ref);
      return value !== undefined && value.trim() !== '';
    },
  };
  return { store, values, calls };
}

describe('planmo auth status', () => {
  it('reports a nonblank provider environment credential without touching the keyring', async () => {
    const configDir = await temporaryConfigDir();
    const credentialRef = uuid(2);
    const secret = 'synthetic-auth-environment-secret';
    const keyringSecret = 'synthetic-auth-keyring-secret';
    const saved = profile(uuid(1), 'openai', 'gpt-4.1-mini', credentialRef);
    await saveConfig(configDir, [saved], saved.id);
    const keyring = fakeStore({
      initial: { [credentialRef]: keyringSecret },
      hasFailure: new Error('must not query keyring'),
    });
    const { io, out, err } = capture();

    const code = await runAuth(
      ['auth', 'status'],
      io,
      scriptedWizard().wizard,
      dependencies(configDir, keyring.store, {
        env: { OPENAI_API_KEY: secret },
        interactive: false,
      }),
    );

    const output = `${out.join('\n')}\n${err.join('\n')}`;
    expect(code).toBe(0);
    expect(output).toContain(saved.id);
    expect(output).toContain('openai');
    expect(output).toContain('gpt-4.1-mini');
    expect(output).toContain('default');
    expect(output.toLowerCase()).toContain('available');
    expect(output).not.toContain(secret);
    expect(output).not.toContain(keyringSecret);
    expect(output).not.toContain(credentialRef);
    expect(keyring.calls.has).toEqual([]);
    expect(keyring.calls.gets).toEqual([]);
  });

  it('checks a keyring-backed profile with has() and never retrieves its credential', async () => {
    const configDir = await temporaryConfigDir();
    const credentialRef = uuid(3);
    const secret = 'synthetic-auth-keyring-only-secret';
    const saved = profile(uuid(4), 'openai', 'gpt-keyring-model', credentialRef);
    await saveConfig(configDir, [saved], saved.id);
    const keyring = fakeStore({ initial: { [credentialRef]: secret } });
    const { io, out, err } = capture();

    const code = await runAuth(
      ['auth', 'status'],
      io,
      scriptedWizard().wizard,
      dependencies(configDir, keyring.store, { env: { OPENAI_API_KEY: '  ' }, interactive: false }),
    );

    const output = `${out.join('\n')}\n${err.join('\n')}`;
    expect(code).toBe(0);
    expect(output.toLowerCase()).toContain('available');
    expect(output).not.toContain(secret);
    expect(output).not.toContain(credentialRef);
    expect(keyring.calls.has).toEqual([credentialRef]);
    expect(keyring.calls.gets).toEqual([]);
  });

  it('reports a missing keyring credential as unavailable', async () => {
    const configDir = await temporaryConfigDir();
    const credentialRef = uuid(5);
    const saved = profile(uuid(6), 'openai', 'gpt-missing-model', credentialRef);
    await saveConfig(configDir, [saved], saved.id);
    const keyring = fakeStore();
    const { io, out } = capture();

    const code = await runAuth(
      ['auth', 'status'],
      io,
      scriptedWizard().wizard,
      dependencies(configDir, keyring.store, { env: {}, interactive: false }),
    );

    expect(code).toBe(0);
    expect(out.join('\n').toLowerCase()).toContain('missing');
    expect(out.join('\n')).not.toContain(credentialRef);
    expect(keyring.calls.has).toEqual([credentialRef]);
    expect(keyring.calls.gets).toEqual([]);
  });

  it('redacts keyring status failures and returns a safe error', async () => {
    const configDir = await temporaryConfigDir();
    const credentialRef = uuid(7);
    const secret = 'synthetic-status-keyring-secret';
    const detail = 'synthetic-status-keyring-private-detail';
    const saved = profile(uuid(8), 'openai', 'gpt-error-model', credentialRef);
    await saveConfig(configDir, [saved], saved.id);
    const keyring = fakeStore({ hasFailure: new Error(`${detail} ${secret} ${credentialRef}`) });
    const { io, out, err } = capture();

    const code = await runAuth(
      ['auth', 'status'],
      io,
      scriptedWizard().wizard,
      dependencies(configDir, keyring.store, { env: {}, interactive: false }),
    );

    const output = `${out.join('\n')}\n${err.join('\n')}`;
    expect(code).toBe(1);
    expect(err.join('\n').toLowerCase()).toContain('credential storage');
    expect(output).not.toContain(detail);
    expect(output).not.toContain(secret);
    expect(output).not.toContain(credentialRef);
    expect(keyring.calls.gets).toEqual([]);
  });

  it('suggests setup when no saved profiles exist without touching the keyring', async () => {
    const configDir = await temporaryConfigDir();
    const keyring = fakeStore({ hasFailure: new Error('must not query keyring') });
    const { io, out } = capture();

    const code = await runAuth(
      ['auth', 'status'],
      io,
      scriptedWizard().wizard,
      dependencies(configDir, keyring.store, { env: {}, interactive: false }),
    );

    expect(code).toBe(0);
    expect(out.join('\n')).toContain('No saved AI profiles');
    expect(out.join('\n')).toContain('planmo setup');
    expect(await readdir(configDir)).toEqual([]);
    expect(keyring.calls.has).toEqual([]);
    expect(keyring.calls.gets).toEqual([]);
  });

  it('reports unknown providers as missing without guessing an environment variable', async () => {
    const configDir = await temporaryConfigDir();
    const credentialRef = uuid(9);
    const secret = 'synthetic-unknown-provider-secret';
    const saved = profile(uuid(10), 'future-vendor', 'future-model', credentialRef);
    await saveConfig(configDir, [saved], saved.id);
    const keyring = fakeStore({ initial: { [credentialRef]: secret } });
    const { io, out, err } = capture();

    const code = await runAuth(
      ['auth', 'status'],
      io,
      scriptedWizard().wizard,
      dependencies(configDir, keyring.store, {
        env: { FUTURE_VENDOR_API_KEY: secret },
        interactive: false,
      }),
    );

    const output = `${out.join('\n')}\n${err.join('\n')}`;
    expect(code).toBe(0);
    expect(output).toContain('future-vendor');
    expect(output.toLowerCase()).toContain('credential missing');
    expect(output.toLowerCase()).not.toContain('unsupported');
    expect(output).not.toContain(secret);
    expect(output).not.toContain(credentialRef);
    expect(keyring.calls.has).toEqual([]);
    expect(keyring.calls.gets).toEqual([]);
  });
});

describe('planmo auth remove', () => {
  it.each([
    { label: 'missing profile id', argv: ['auth', 'remove', '--yes'], expected: 'exactly one' },
    {
      label: 'invalid profile id',
      argv: ['auth', 'remove', 'not-a-uuid', '--yes'],
      expected: 'UUID',
    },
  ])('rejects a $label without writing config or keyring state', async ({ argv, expected }) => {
    const configDir = await temporaryConfigDir();
    const keyring = fakeStore({ initial: { [uuid(11)]: 'synthetic-unchanged-key' } });
    const { io, err } = capture();

    const code = await runAuth(
      argv,
      io,
      scriptedWizard(true).wizard,
      dependencies(configDir, keyring.store, { env: {}, interactive: false }),
    );

    expect(code).toBe(1);
    expect(err.join('\n')).toContain(expected);
    expect(await readdir(configDir)).toEqual([]);
    expect(keyring.calls.removes).toEqual([]);
  });

  it('rejects a valid but unknown profile id without creating config', async () => {
    const configDir = await temporaryConfigDir();
    const keyring = fakeStore();
    const { io, err } = capture();

    const code = await runAuth(
      ['auth', 'remove', uuid(12), '--yes'],
      io,
      scriptedWizard().wizard,
      dependencies(configDir, keyring.store, { env: {}, interactive: false }),
    );

    expect(code).toBe(1);
    expect(err.join('\n').toLowerCase()).toContain('profile');
    expect(await readdir(configDir)).toEqual([]);
    expect(keyring.calls.removes).toEqual([]);
  });

  it('matches uppercase UUID profile ids case-insensitively', async () => {
    const configDir = await temporaryConfigDir();
    const credentialRef = uuid(31);
    const saved = profile(
      'abcdefab-cdef-4abc-8def-abcdefabcdef',
      'openai',
      'gpt-case-model',
      credentialRef,
    );
    await saveConfig(configDir, [saved], saved.id);
    const keyring = fakeStore({ initial: { [credentialRef]: 'synthetic-case-insensitive-key' } });
    const { io } = capture();

    const code = await runAuth(
      ['auth', 'remove', saved.id.toUpperCase(), '--yes'],
      io,
      scriptedWizard().wizard,
      dependencies(configDir, keyring.store, { env: {}, interactive: false }),
    );

    expect(code).toBe(0);
    expect(keyring.calls.removes).toEqual([credentialRef]);
    expect(await readAiUserConfig(configDir)).toEqual({
      schemaVersion: 1,
      profiles: [],
      defaultProfileId: null,
    });
  });

  it('cancels an interactive removal without changing config or keyring state', async () => {
    const configDir = await temporaryConfigDir();
    const credentialRef = uuid(14);
    const saved = profile(uuid(13), 'openai', 'gpt-cancel-model', credentialRef);
    await saveConfig(configDir, [saved], saved.id);
    const configPath = join(configDir, 'config.json');
    const before = await readFile(configPath, 'utf8');
    const keyring = fakeStore({ initial: { [credentialRef]: 'synthetic-cancel-key' } });
    const { wizard, confirmations } = scriptedWizard();
    const { io, out } = capture();

    const code = await runAuth(
      ['auth', 'remove', saved.id],
      io,
      wizard,
      dependencies(configDir, keyring.store, { env: {}, interactive: true }),
    );

    expect(code).toBe(0);
    expect(confirmations).toHaveLength(1);
    expect(confirmations[0]).toContain(saved.id);
    expect(confirmations[0]).not.toContain(credentialRef);
    expect(await readFile(configPath, 'utf8')).toBe(before);
    expect(await readAiUserConfig(configDir)).toEqual({
      schemaVersion: 1,
      profiles: [saved],
      defaultProfileId: saved.id,
    });
    expect(keyring.calls.removes).toEqual([]);
    expect(out.join('\n').toLowerCase()).toContain('cancel');
  });

  it('discloses keyring deletion and unchanged environment variables before removal', async () => {
    const configDir = await temporaryConfigDir();
    const credentialRef = uuid(30);
    const secret = ['synthetic', 'confirmation', 'key'].join('-');
    const saved = profile(uuid(32), 'openai', 'gpt-removal-disclosure', credentialRef);
    await saveConfig(configDir, [saved], saved.id);
    const keyring = fakeStore({ initial: { [credentialRef]: secret } });
    const { wizard, confirmations } = scriptedWizard(true);
    const { io } = capture();

    const code = await runAuth(
      ['auth', 'remove', saved.id],
      io,
      wizard,
      dependencies(configDir, keyring.store, { env: {}, interactive: true }),
    );

    expect(code).toBe(0);
    expect(confirmations).toEqual([
      `Remove AI profile ${saved.id} (openai / gpt-removal-disclosure)? The saved OS keyring credential will be removed; provider environment variables will not be changed.`,
    ]);
    expect(confirmations[0]).not.toContain(credentialRef);
    expect(confirmations[0]).not.toContain(secret);
    expect(keyring.calls.removes).toEqual([credentialRef]);
  });

  it('discloses environment variables remain untouched for an environment-only profile', async () => {
    const configDir = await temporaryConfigDir();
    const secret = ['synthetic', 'environment', 'confirmation', 'secret'].join('-');
    const saved = profile(uuid(33), 'openai', 'gpt-env-removal-disclosure', null);
    await saveConfig(configDir, [saved], saved.id);
    const env = { OPENAI_API_KEY: secret };
    const keyring = fakeStore({ hasFailure: new Error('must not query keyring') });
    const { wizard, confirmations } = scriptedWizard(true);
    const { io } = capture();

    const code = await runAuth(
      ['auth', 'remove', saved.id],
      io,
      wizard,
      dependencies(configDir, keyring.store, { env, interactive: true }),
    );

    expect(code).toBe(0);
    expect(confirmations).toEqual([
      `Remove AI profile ${saved.id} (openai / gpt-env-removal-disclosure)? The saved profile will be removed; no OS keyring credential is attached or will be removed; provider environment variables will remain unchanged.`,
    ]);
    expect(confirmations[0]).not.toContain(secret);
    expect(env).toEqual({ OPENAI_API_KEY: secret });
    expect(keyring.calls.has).toEqual([]);
    expect(keyring.calls.gets).toEqual([]);
    expect(keyring.calls.removes).toEqual([]);
  });

  it('confirms interactively, persists removal before deleting its key, and clears the default', async () => {
    const configDir = await temporaryConfigDir();
    const credentialRef = uuid(16);
    const removed = profile(uuid(15), 'openai', 'gpt-remove-default', credentialRef);
    const retained = profile(uuid(17), 'deepseek', 'deepseek-retained-model', null);
    await saveConfig(configDir, [removed, retained], removed.id);
    const secret = 'synthetic-confirmed-removal-key';
    let configAtDelete: AiUserConfig | null = null;
    const keyring = fakeStore({
      initial: { [credentialRef]: secret },
      onRemove: async () => {
        configAtDelete = await readAiUserConfig(configDir);
      },
    });
    const { wizard, confirmations } = scriptedWizard(true);
    const { io, out, err } = capture();

    const code = await runAuth(
      ['auth', 'remove', removed.id],
      io,
      wizard,
      dependencies(configDir, keyring.store, { env: {}, interactive: true }),
    );

    expect(code).toBe(0);
    expect(confirmations).toHaveLength(1);
    expect(confirmations[0]).toContain(removed.id);
    expect(confirmations[0]).not.toContain(credentialRef);
    expect(keyring.calls.removes).toEqual([credentialRef]);
    expect(keyring.calls.gets).toEqual([]);
    expect(configAtDelete).toEqual({
      schemaVersion: 1,
      profiles: [retained],
      defaultProfileId: null,
    });
    expect(await readAiUserConfig(configDir)).toEqual({
      schemaVersion: 1,
      profiles: [retained],
      defaultProfileId: null,
    });
    const output = `${out.join('\n')}\n${err.join('\n')}`;
    expect(output).not.toContain(secret);
    expect(output).not.toContain(credentialRef);
  });

  it('requires --yes without a terminal and makes no writes when it is absent', async () => {
    const configDir = await temporaryConfigDir();
    const credentialRef = uuid(19);
    const saved = profile(uuid(18), 'openai', 'gpt-nontty-model', credentialRef);
    await saveConfig(configDir, [saved], saved.id);
    const configPath = join(configDir, 'config.json');
    const before = await readFile(configPath, 'utf8');
    const keyring = fakeStore({ initial: { [credentialRef]: 'synthetic-nontty-key' } });
    const { wizard, confirmations } = scriptedWizard(true);
    const { io, err } = capture();

    const code = await runAuth(
      ['auth', 'remove', saved.id],
      io,
      wizard,
      dependencies(configDir, keyring.store, { env: {}, interactive: false }),
    );

    expect(code).toBe(1);
    expect(err.join('\n')).toContain('--yes');
    expect(confirmations).toEqual([]);
    expect(await readFile(configPath, 'utf8')).toBe(before);
    expect(keyring.calls.removes).toEqual([]);
  });

  it('--yes removes a non-default profile without prompting and preserves the default', async () => {
    const configDir = await temporaryConfigDir();
    const credentialRef = uuid(21);
    const removed = profile(uuid(20), 'openai', 'gpt-remove-nondefault', credentialRef);
    const retained = profile(uuid(22), 'deepseek', 'deepseek-default-model', null);
    await saveConfig(configDir, [removed, retained], retained.id);
    const keyring = fakeStore({ initial: { [credentialRef]: 'synthetic-yes-removal-key' } });
    const { wizard, confirmations } = scriptedWizard(true);
    const { io, out, err } = capture();

    const code = await runAuth(
      ['auth', 'remove', '--yes', removed.id],
      io,
      wizard,
      dependencies(configDir, keyring.store, { env: {}, interactive: false }),
    );

    expect(code).toBe(0);
    expect(confirmations).toEqual([]);
    expect(keyring.calls.removes).toEqual([credentialRef]);
    expect(await readAiUserConfig(configDir)).toEqual({
      schemaVersion: 1,
      profiles: [retained],
      defaultProfileId: retained.id,
    });
    expect(`${out.join('\n')}\n${err.join('\n')}`).not.toContain(credentialRef);
  });

  it('removes an environment-only profile without reading, deleting, or changing environment credentials', async () => {
    const configDir = await temporaryConfigDir();
    const secret = 'synthetic-env-only-removal-secret';
    const saved = profile(uuid(23), 'openai', 'gpt-env-only-model', null);
    await saveConfig(configDir, [saved], saved.id);
    const env = { OPENAI_API_KEY: secret };
    const beforeEnv = { ...env };
    const keyring = fakeStore({ initial: { [uuid(24)]: 'unrelated-keyring-key' } });
    const { io, out, err } = capture();

    const code = await runAuth(
      ['auth', 'remove', saved.id, '--yes'],
      io,
      scriptedWizard().wizard,
      dependencies(configDir, keyring.store, { env, interactive: false }),
    );

    expect(code).toBe(0);
    expect(env).toEqual(beforeEnv);
    expect(keyring.calls.has).toEqual([]);
    expect(keyring.calls.gets).toEqual([]);
    expect(keyring.calls.removes).toEqual([]);
    expect(await readAiUserConfig(configDir)).toEqual({
      schemaVersion: 1,
      profiles: [],
      defaultProfileId: null,
    });
    expect(`${out.join('\n')}\n${err.join('\n')}`).not.toContain(secret);
  });

  it('does not delete a keyring credential when config persistence fails', async () => {
    const configDir = await temporaryConfigDir();
    const credentialRef = uuid(26);
    const secret = 'synthetic-config-write-key';
    const detail = 'synthetic-private-write-error';
    const saved = profile(uuid(25), 'openai', 'gpt-write-failure-model', credentialRef);
    await saveConfig(configDir, [saved], saved.id);
    const configPath = join(configDir, 'config.json');
    const before = await readFile(configPath, 'utf8');
    const keyring = fakeStore({ initial: { [credentialRef]: secret } });
    const { io, out, err } = capture();

    const code = await runAuth(
      ['auth', 'remove', saved.id, '--yes'],
      io,
      scriptedWizard().wizard,
      dependencies(configDir, keyring.store, {
        env: {},
        interactive: false,
        writeConfig: async () => {
          throw new Error(`${detail} ${secret} ${credentialRef}`);
        },
      }),
    );

    const output = `${out.join('\n')}\n${err.join('\n')}`;
    expect(code).toBe(1);
    expect(err.join('\n').toLowerCase()).toContain('could not save');
    expect(output).not.toContain(detail);
    expect(output).not.toContain(secret);
    expect(output).not.toContain(credentialRef);
    expect(keyring.calls.removes).toEqual([]);
    expect(keyring.calls.gets).toEqual([]);
    expect(await readFile(configPath, 'utf8')).toBe(before);
    expect(await readAiUserConfig(configDir)).toEqual({
      schemaVersion: 1,
      profiles: [saved],
      defaultProfileId: saved.id,
    });
  });

  it('warns generically if keyring cleanup fails after config removal', async () => {
    const configDir = await temporaryConfigDir();
    const credentialRef = uuid(28);
    const secret = 'synthetic-delete-failure-secret';
    const detail = 'synthetic-private-keyring-delete-error';
    const saved = profile(uuid(27), 'openai', 'gpt-delete-failure-model', credentialRef);
    await saveConfig(configDir, [saved], saved.id);
    const keyring = fakeStore({
      initial: { [credentialRef]: secret },
      removeFailure: new Error(`${detail} ${secret} ${credentialRef}`),
    });
    const { io, out, err } = capture();

    const code = await runAuth(
      ['auth', 'remove', saved.id, '--yes'],
      io,
      scriptedWizard().wizard,
      dependencies(configDir, keyring.store, { env: {}, interactive: false }),
    );

    const output = `${out.join('\n')}\n${err.join('\n')}`;
    expect(code).toBe(0);
    expect(err.join('\n').toLowerCase()).toContain('warning');
    expect(err.join('\n').toLowerCase()).toContain('unused key');
    expect(output).not.toContain(detail);
    expect(output).not.toContain(secret);
    expect(output).not.toContain(credentialRef);
    expect(keyring.calls.removes).toEqual([credentialRef]);
    expect(await readAiUserConfig(configDir)).toEqual({
      schemaVersion: 1,
      profiles: [],
      defaultProfileId: null,
    });
  });

  it('rejects extra arguments and limits --yes to remove', async () => {
    const configDir = await temporaryConfigDir();
    const keyring = fakeStore();
    const { io: extraIo, err: extraErr } = capture();
    const extraCode = await runAuth(
      ['auth', 'remove', uuid(29), 'unexpected', '--yes'],
      extraIo,
      scriptedWizard().wizard,
      dependencies(configDir, keyring.store, { env: {}, interactive: false }),
    );

    expect(extraCode).toBe(1);
    expect(extraErr.join('\n')).toContain('exactly one');
    expect(keyring.calls.removes).toEqual([]);

    const { io: statusIo, err: statusErr } = capture();
    const statusCode = await runAuth(
      ['auth', 'status', '--yes'],
      statusIo,
      scriptedWizard().wizard,
      dependencies(configDir, keyring.store, { env: {}, interactive: false }),
    );

    expect(statusCode).toBe(1);
    expect(statusErr.join('\n')).toContain('--yes');
    expect(keyring.calls.removes).toEqual([]);
  });
});
