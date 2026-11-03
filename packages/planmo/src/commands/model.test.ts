import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AiUserConfig } from '@planmo/schema';
import type { CliIO, WizardIO } from '../cli-io.js';
import type { CredentialStore } from '../credential-store.js';
import { run } from '../index.js';
import { readAiUserConfig, writeAiUserConfig } from '../user-config.js';
import { runModelCommand } from './model.js';

vi.mock('../keyring-credential-store.js', () => ({
  KeyringCredentialStore: class {
    constructor() {
      throw new Error('real keyring access is disabled in model tests');
    }
  },
}));

type ModelCommandDependencies = {
  env?: Readonly<Record<string, string | undefined>>;
  configDir?: string;
  store?: CredentialStore;
  fetcher?: typeof fetch;
  interactive?: boolean;
  writeConfig?: (configDir: string, config: AiUserConfig) => Promise<void>;
};

type ModelCli = (
  argv: string[],
  io: CliIO,
  wizard: WizardIO,
  dependencies?: { model?: ModelCommandDependencies },
) => Promise<number>;

// Exercise the router while the new command module is absent; this keeps RED
// about command behavior rather than an import/link failure.
const runModel = run as unknown as ModelCli;

function capture() {
  const out: string[] = [];
  const err: string[] = [];
  const io = {
    out: (line: string) => out.push(line),
    err: (line: string) => err.push(line),
  };
  return { io, out, err };
}

const temporaryDirectories: string[] = [];
async function temporaryConfigDir(): Promise<string> {
  const directory = await mkdtemp(join(process.env.TMPDIR ?? tmpdir(), 'planmo-model-'));
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
  id: number,
  overrides: Partial<AiUserConfig['profiles'][number]> = {},
): AiUserConfig['profiles'][number] {
  return {
    id: uuid(id),
    providerId: 'openai',
    modelId: 'old-model',
    baseUrl: null,
    credentialRef: uuid(id + 100),
    ...overrides,
  };
}

async function saveConfig(
  configDir: string,
  profiles: AiUserConfig['profiles'],
  defaultProfileId: string | null = profiles[0]?.id ?? null,
): Promise<void> {
  await writeAiUserConfig(configDir, { schemaVersion: 1, profiles, defaultProfileId });
}

function storeWith(initial: Readonly<Record<string, string>> = {}, failGet?: Error) {
  const values = new Map(Object.entries(initial));
  const gets: string[] = [];
  const store: CredentialStore = {
    async get(ref) {
      gets.push(ref);
      if (failGet !== undefined) throw failGet;
      return values.get(ref) ?? null;
    },
    async set(ref, value) {
      values.set(ref, value);
    },
    async remove(ref) {
      values.delete(ref);
    },
    async has(ref) {
      return values.has(ref);
    },
  };
  return { store, gets, values };
}

function persistence(configDir: string) {
  const writes: AiUserConfig[] = [];
  return {
    writes,
    writeConfig: async (targetDir: string, config: AiUserConfig) => {
      writes.push(structuredClone(config));
      await writeAiUserConfig(targetDir || configDir, config);
    },
  };
}

function scriptedWizard(
  options: {
    selections?: Array<string | number | boolean | undefined>;
    prompts?: string[];
  } = {},
) {
  const selections = [...(options.selections ?? [])];
  const prompts = [...(options.prompts ?? [])];
  const selectCalls: Array<{
    question: string;
    values: Array<string | number | boolean>;
    labels: string[];
  }> = [];
  const promptCalls: string[] = [];
  const wizard: WizardIO = {
    async prompt(question) {
      promptCalls.push(question);
      return prompts.shift() ?? '';
    },
    async password() {
      return undefined;
    },
    async select<T extends string | boolean | number>(
      question: string,
      choices: Array<{ value: T; label: string; hint?: string }>,
    ) {
      selectCalls.push({
        question,
        values: choices.map((choice) => choice.value),
        labels: choices.map((choice) => choice.label),
      });
      const answer = selections.shift();
      return choices.find((choice) => choice.value === answer)?.value;
    },
    async multiSelect() {
      return undefined;
    },
    async confirm() {
      return undefined;
    },
    out() {},
  };
  return { wizard, selectCalls, promptCalls };
}

function pendingSelectionWizard() {
  const prompts = scriptedWizard();
  let announcePending!: () => void;
  const selectionPending = new Promise<void>((resolve) => {
    announcePending = resolve;
  });
  let resolveSelection!: (answer: number | undefined) => void;
  const selection = new Promise<number | undefined>((resolve) => {
    resolveSelection = resolve;
  });
  const wizard: WizardIO = {
    ...prompts.wizard,
    async select<T extends string | boolean | number>(
      question: string,
      choices: Array<{ value: T; label: string; hint?: string }>,
    ) {
      prompts.selectCalls.push({
        question,
        values: choices.map((choice) => choice.value),
        labels: choices.map((choice) => choice.label),
      });
      announcePending();
      const answer = await selection;
      return choices.find((choice) => choice.value === answer)?.value;
    },
  };
  return { wizard, selectionPending, resolveSelection, selectCalls: prompts.selectCalls };
}

function pendingPromptWizard() {
  const prompts = scriptedWizard();
  let announcePending!: () => void;
  const promptPending = new Promise<void>((resolve) => {
    announcePending = resolve;
  });
  let resolvePrompt!: (answer: string) => void;
  const answer = new Promise<string>((resolve) => {
    resolvePrompt = resolve;
  });
  const wizard: WizardIO = {
    ...prompts.wizard,
    async prompt(question) {
      prompts.promptCalls.push(question);
      announcePending();
      return await answer;
    },
  };
  return { wizard, promptPending, resolvePrompt, promptCalls: prompts.promptCalls };
}

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function fakeFetcher(responses: Response[]) {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    const response = responses.shift();
    if (response === undefined) throw new Error('unexpected extra model-list request');
    return response;
  }) as typeof fetch;
  return { fetcher, calls };
}

const setupError = 'planmo setup';
const secret = 'synthetic-model-command-key';

describe('planmo model', () => {
  it('updates only the saved default profile directly, without prompts, credentials, or network', async () => {
    const configDir = await temporaryConfigDir();
    const defaultProfile = profile(1);
    const otherProfile = profile(2, {
      providerId: 'anthropic',
      modelId: 'other-profile-model',
      credentialRef: uuid(202),
    });
    const original: AiUserConfig = {
      schemaVersion: 1,
      profiles: [defaultProfile, otherProfile],
      defaultProfileId: defaultProfile.id,
    };
    await writeAiUserConfig(configDir, original);
    const keyring = storeWith({ [defaultProfile.credentialRef!]: 'keyring-secret' });
    const writes = persistence(configDir);
    const fetcher = vi.fn(async () => jsonResponse({ data: [{ id: 'must-not-be-listed' }] }));
    const prompts = scriptedWizard();
    const { io, out, err } = capture();

    const code = await runModel(['model', 'provider-reported-model-v2'], io, prompts.wizard, {
      model: {
        env: { OPENAI_API_KEY: secret },
        configDir,
        store: keyring.store,
        fetcher,
        interactive: false,
        writeConfig: writes.writeConfig,
      },
    });

    expect(code).toBe(0);
    expect(await readAiUserConfig(configDir)).toEqual({
      ...original,
      profiles: [{ ...defaultProfile, modelId: 'provider-reported-model-v2' }, otherProfile],
    });
    expect(writes.writes).toHaveLength(1);
    expect(fetcher).not.toHaveBeenCalled();
    expect(keyring.gets).toEqual([]);
    expect(prompts.promptCalls).toEqual([]);
    expect(prompts.selectCalls).toEqual([]);
    expect(`${out.join('\n')}\n${err.join('\n')}`).not.toContain(secret);
    expect(`${out.join('\n')}\n${err.join('\n')}`).not.toContain('keyring-secret');
  });

  it.each([
    { args: ['model', '   '], detail: 'blank' },
    { args: ['model', 'one', 'two'], detail: 'exactly one' },
  ])('rejects invalid positional operands ($detail) without writing', async ({ args, detail }) => {
    const configDir = await temporaryConfigDir();
    const defaultProfile = profile(3);
    await saveConfig(configDir, [defaultProfile]);
    const writes = persistence(configDir);
    const fetcher = vi.fn(async () => jsonResponse({ data: [] }));
    const prompts = scriptedWizard();
    const { io, err } = capture();

    const code = await runModel(args, io, prompts.wizard, {
      model: {
        configDir,
        env: {},
        store: storeWith().store,
        fetcher,
        interactive: true,
        writeConfig: writes.writeConfig,
      },
    });

    expect(code).toBe(1);
    expect(err.join('\n')).toContain(detail);
    expect(writes.writes).toHaveLength(0);
    expect(fetcher).not.toHaveBeenCalled();
    expect(prompts.promptCalls).toEqual([]);
  });

  it('rejects a flag-shaped explicit model id before reading or writing config', async () => {
    const configDir = await temporaryConfigDir();
    await writeFile(join(configDir, 'config.json'), '{not-json', 'utf8');
    const writes = persistence(configDir);
    const prompts = scriptedWizard();
    const flagShapedId = ['--SYNTHETIC', 'SECRET'].join('-');
    const { io, out, err } = capture();

    const code = await runModelCommand([flagShapedId], io, prompts.wizard, {
      configDir,
      env: {},
      interactive: false,
      writeConfig: writes.writeConfig,
    });

    const output = `${out.join('\n')}\n${err.join('\n')}`;
    expect(code).toBe(1);
    expect(err).toEqual(['planmo model: option-like model ids are not accepted.']);
    expect(output).not.toContain(flagShapedId);
    expect(output).not.toContain('saved AI config');
    expect(writes.writes).toHaveLength(0);
    expect(prompts.promptCalls).toEqual([]);
  });

  it.each([{ entry: 'an explicit positional id' }, { entry: 'interactive manual input' }] as const)(
    'rejects an option-like canonical model id from $entry without writing or echoing it',
    async ({ entry }) => {
      const configDir = await temporaryConfigDir();
      const saved = profile(22, {
        providerId: 'custom',
        baseUrl: 'https://gateway.example/v1',
        credentialRef: null,
      });
      const original: AiUserConfig = {
        schemaVersion: 1,
        profiles: [saved],
        defaultProfileId: saved.id,
      };
      await writeAiUserConfig(configDir, original);
      const optionLikeSuffix = ['--api-key', 'synthetic'].join('=');
      const unsafeModelId = ` ${optionLikeSuffix}`;
      const explicit = entry === 'an explicit positional id';
      const writes = persistence(configDir);
      const prompts = scriptedWizard({ prompts: explicit ? [] : [unsafeModelId] });
      const { fetcher, calls } = fakeFetcher([]);
      const { io, out, err } = capture();

      const code = await runModel(
        explicit ? ['model', unsafeModelId] : ['model'],
        io,
        prompts.wizard,
        {
          model: {
            configDir,
            env: {},
            store: storeWith().store,
            fetcher,
            interactive: !explicit,
            writeConfig: writes.writeConfig,
          },
        },
      );

      const output = `${out.join('\\n')}\\n${err.join('\\n')}`;
      expect(code).toBe(1);
      expect(writes.writes).toHaveLength(0);
      expect(await readAiUserConfig(configDir)).toEqual(original);
      expect(output).not.toContain(optionLikeSuffix);
      expect(prompts.promptCalls).toEqual(explicit ? [] : ['Model id']);
      expect(calls).toEqual([]);
    },
  );

  it('requires a terminal without an explicit id', async () => {
    const configDir = await temporaryConfigDir();
    const saved = profile(4);
    await saveConfig(configDir, [saved]);
    const writes = persistence(configDir);
    const prompts = scriptedWizard();
    const { io, err } = capture();

    const code = await runModel(['model'], io, prompts.wizard, {
      model: {
        configDir,
        env: {},
        store: storeWith().store,
        interactive: false,
        writeConfig: writes.writeConfig,
      },
    });

    expect(code).toBe(1);
    expect(err.join('\\n')).toContain('terminal');
    expect(writes.writes).toHaveLength(0);
    expect(prompts.promptCalls).toEqual([]);
  });

  it('checks the terminal requirement before reading a missing default profile', async () => {
    const configDir = await temporaryConfigDir();
    const prompts = scriptedWizard();
    const { io, err } = capture();

    const code = await runModel(['model'], io, prompts.wizard, {
      model: {
        configDir,
        env: {},
        store: storeWith().store,
        interactive: false,
      },
    });

    expect(code).toBe(1);
    expect(err.join('\\n')).toContain('terminal');
    expect(err.join('\\n')).not.toContain('no saved default AI profile');
    expect(prompts.promptCalls).toEqual([]);
  });

  it('fails safely and suggests setup when there is no default profile', async () => {
    const configDir = await temporaryConfigDir();
    await saveConfig(configDir, [], null);
    const writes = persistence(configDir);
    const fetcher = vi.fn(async () => jsonResponse({ data: [] }));
    const prompts = scriptedWizard();
    const { io, err } = capture();

    const code = await runModel(['model'], io, prompts.wizard, {
      model: {
        configDir,
        env: {},
        store: storeWith().store,
        fetcher,
        interactive: true,
        writeConfig: writes.writeConfig,
      },
    });

    expect(code).toBe(1);
    expect(err.join('\n')).toContain(setupError);
    expect(writes.writes).toHaveLength(0);
    expect(fetcher).not.toHaveBeenCalled();
    expect(prompts.promptCalls).toEqual([]);
  });

  it('fails safely and suggests setup when the saved config is malformed', async () => {
    const configDir = await temporaryConfigDir();
    await writeFile(join(configDir, 'config.json'), '{not-json', 'utf8');
    const writes = persistence(configDir);
    const fetcher = vi.fn(async () => jsonResponse({ data: [] }));
    const prompts = scriptedWizard();
    const { io, err } = capture();

    const code = await runModel(['model'], io, prompts.wizard, {
      model: {
        configDir,
        env: {},
        store: storeWith().store,
        fetcher,
        interactive: true,
        writeConfig: writes.writeConfig,
      },
    });

    expect(code).toBe(1);
    expect(err.join('\n')).toContain(setupError);
    expect(writes.writes).toHaveLength(0);
    expect(fetcher).not.toHaveBeenCalled();
    expect(prompts.promptCalls).toEqual([]);
  });

  it('uses a provider-reported choice menu with numeric values and environment-first credentials', async () => {
    const configDir = await temporaryConfigDir();
    const saved = profile(5, { credentialRef: uuid(105) });
    await saveConfig(configDir, [saved]);
    const writes = persistence(configDir);
    const keyring = storeWith({}, new Error('must not read keyring when env is nonblank'));
    const { fetcher, calls } = fakeFetcher([
      jsonResponse({
        data: [
          { id: 'vendor/model-a', description: 'untrusted provider prose' },
          { id: 'manual-entry', name: 'not a command' },
        ],
      }),
    ]);
    const prompts = scriptedWizard({ selections: [1] });
    const { io, out, err } = capture();

    const code = await runModel(['model'], io, prompts.wizard, {
      model: {
        configDir,
        env: { OPENAI_API_KEY: secret },
        store: keyring.store,
        fetcher,
        interactive: true,
        writeConfig: writes.writeConfig,
      },
    });

    expect(code).toBe(0);
    expect((await readAiUserConfig(configDir))?.profiles[0]?.modelId).toBe('manual-entry');
    expect(prompts.selectCalls).toHaveLength(1);
    expect(prompts.selectCalls[0]?.values).toEqual([0, 1, 2]);
    expect(prompts.selectCalls[0]?.labels).toContain('Enter a model id manually');
    expect(prompts.promptCalls).toEqual([]);
    expect(keyring.gets).toEqual([]);
    expect(calls[0]?.url).toBe('https://api.openai.com/v1/models');
    expect(new Headers(calls[0]?.init?.headers).get('authorization')).toBe(`Bearer ${secret}`);
    expect(`${out.join('\n')}\n${err.join('\n')}`).toContain('provider-reported');
    expect(`${out.join('\n')}\n${err.join('\n')}`).toContain('compatibility is not guaranteed');
    expect(`${out.join('\n')}\n${err.join('\n')}`).not.toContain(secret);
    expect(`${out.join('\n')}\n${err.join('\n')}`).not.toContain('untrusted provider prose');
  });

  it('uses the saved keyring credential only in the declared request header', async () => {
    const configDir = await temporaryConfigDir();
    const saved = profile(6, { credentialRef: uuid(106) });
    await saveConfig(configDir, [saved]);
    const keyringSecret = 'synthetic-keyring-model-secret';
    const keyring = storeWith({ [saved.credentialRef!]: keyringSecret });
    const { fetcher, calls } = fakeFetcher([jsonResponse({ data: [{ id: 'keyring-model' }] })]);
    const prompts = scriptedWizard({ selections: [0] });
    const { io, out, err } = capture();

    const code = await runModel(['model'], io, prompts.wizard, {
      model: {
        configDir,
        env: { OPENAI_API_KEY: '  ' },
        store: keyring.store,
        fetcher,
        interactive: true,
      },
    });

    expect(code).toBe(0);
    expect(keyring.gets).toEqual([saved.credentialRef]);
    expect(new Headers(calls[0]?.init?.headers).get('authorization')).toBe(
      `Bearer ${keyringSecret}`,
    );
    expect((await readAiUserConfig(configDir))?.profiles[0]?.credentialRef).toBe(
      saved.credentialRef,
    );
    expect(`${out.join('\n')}\n${err.join('\n')}`).not.toContain(keyringSecret);
  });

  it('uses ordinary manual entry when the provider has no declared list endpoint', async () => {
    const configDir = await temporaryConfigDir();
    const saved = profile(7, {
      providerId: 'custom',
      baseUrl: 'https://gateway.example/v1',
      credentialRef: null,
    });
    await saveConfig(configDir, [saved]);
    const { fetcher, calls } = fakeFetcher([]);
    const prompts = scriptedWizard({ prompts: ['manual-custom-model'] });
    const writes = persistence(configDir);
    const { io, out } = capture();

    const code = await runModel(['model'], io, prompts.wizard, {
      model: {
        configDir,
        env: { PLANMO_AI_API_KEY: secret },
        store: storeWith().store,
        fetcher,
        interactive: true,
        writeConfig: writes.writeConfig,
      },
    });

    expect(code).toBe(0);
    expect((await readAiUserConfig(configDir))?.profiles[0]?.modelId).toBe('manual-custom-model');
    expect(calls).toEqual([]);
    expect(prompts.selectCalls).toEqual([]);
    expect(prompts.promptCalls).toEqual(['Model id']);
    expect(out.join('\n')).toContain('manual model id');
    expect(out.join('\n')).not.toContain(secret);
  });

  it('uses ordinary manual entry for an unsupported provider without deriving its base URL', async () => {
    const configDir = await temporaryConfigDir();
    const saved = profile(13, {
      providerId: 'future-provider',
      baseUrl: null,
      credentialRef: null,
    });
    await saveConfig(configDir, [saved]);
    const { fetcher, calls } = fakeFetcher([]);
    const prompts = scriptedWizard({ prompts: ['manual-unsupported-model'] });
    const { io } = capture();

    const code = await runModel(['model'], io, prompts.wizard, {
      model: {
        configDir,
        env: {},
        store: storeWith().store,
        fetcher,
        interactive: true,
      },
    });

    expect(code).toBe(0);
    expect((await readAiUserConfig(configDir))?.profiles[0]?.modelId).toBe(
      'manual-unsupported-model',
    );
    expect(calls).toEqual([]);
    expect(prompts.selectCalls).toEqual([]);
  });

  it('falls back to manual entry on provider failures without exposing details', async () => {
    const configDir = await temporaryConfigDir();
    const saved = profile(8, { credentialRef: null });
    await saveConfig(configDir, [saved]);
    const body = `provider-private-response ${secret}`;
    const { fetcher, calls } = fakeFetcher([new Response(body, { status: 503 })]);
    const prompts = scriptedWizard({ prompts: ['manual-after-failure'] });
    const writes = persistence(configDir);
    const { io, out, err } = capture();

    const code = await runModel(['model'], io, prompts.wizard, {
      model: {
        configDir,
        env: { OPENAI_API_KEY: secret },
        store: storeWith().store,
        fetcher,
        interactive: true,
        writeConfig: writes.writeConfig,
      },
    });

    const output = `${out.join('\n')}\n${err.join('\n')}`;
    expect(code).toBe(0);
    expect((await readAiUserConfig(configDir))?.profiles[0]?.modelId).toBe('manual-after-failure');
    expect(calls).toHaveLength(1);
    expect(prompts.selectCalls).toEqual([]);
    expect(prompts.promptCalls).toEqual(['Model id']);
    expect(output).toContain('manual model id');
    expect(output).not.toContain(body);
    expect(output).not.toContain(secret);
    expect(output).not.toContain('https://api.openai.com');
  });

  it('treats a blank interactive manual answer as cancellation with no write', async () => {
    const configDir = await temporaryConfigDir();
    const saved = profile(9, { credentialRef: null });
    await saveConfig(configDir, [saved]);
    const writes = persistence(configDir);
    const prompts = scriptedWizard({ prompts: ['   '] });
    const { fetcher, calls } = fakeFetcher([]);
    const { io, out } = capture();

    const code = await runModel(['model'], io, prompts.wizard, {
      model: {
        configDir,
        env: {},
        store: storeWith().store,
        fetcher,
        interactive: true,
        writeConfig: writes.writeConfig,
      },
    });

    expect(code).toBe(0);
    expect(writes.writes).toHaveLength(0);
    expect(await readAiUserConfig(configDir)).toMatchObject({ profiles: [saved] });
    expect(calls).toEqual([]);
    expect(prompts.promptCalls).toEqual(['Model id']);
    expect(out.join('\\n')).toContain('No provider credential');
    expect(out.join('\\n')).toContain('cancelled');
  });

  it('does not write config when model selection is cancelled', async () => {
    const configDir = await temporaryConfigDir();
    const saved = profile(10, { credentialRef: null });
    await saveConfig(configDir, [saved]);
    const writes = persistence(configDir);
    const { fetcher } = fakeFetcher([jsonResponse({ data: [{ id: 'listed-model' }] })]);
    const prompts = scriptedWizard({ selections: [undefined] });
    const { io, out } = capture();

    const code = await runModel(['model'], io, prompts.wizard, {
      model: {
        configDir,
        env: { OPENAI_API_KEY: secret },
        store: storeWith().store,
        fetcher,
        interactive: true,
        writeConfig: writes.writeConfig,
      },
    });

    expect(code).toBe(0);
    expect(writes.writes).toHaveLength(0);
    expect((await readAiUserConfig(configDir))?.profiles[0]).toEqual(saved);
    expect(out.join('\n')).toContain('cancelled');
  });

  it('lets the numeric manual option work even when a provider id resembles a sentinel', async () => {
    const configDir = await temporaryConfigDir();
    const saved = profile(11, { credentialRef: null });
    await saveConfig(configDir, [saved]);
    const { fetcher } = fakeFetcher([jsonResponse({ data: [{ id: '__manual__' }] })]);
    const prompts = scriptedWizard({ selections: [1], prompts: ['typed-after-menu'] });
    const { io } = capture();

    const code = await runModel(['model'], io, prompts.wizard, {
      model: {
        configDir,
        env: { OPENAI_API_KEY: secret },
        store: storeWith().store,
        fetcher,
        interactive: true,
      },
    });

    expect(code).toBe(0);
    expect((await readAiUserConfig(configDir))?.profiles[0]?.modelId).toBe('typed-after-menu');
    expect(prompts.selectCalls[0]?.values).toEqual([0, 1]);
    expect(prompts.promptCalls).toEqual(['Model id']);
  });

  it('preserves unrelated profiles added while the interactive model picker is pending', async () => {
    const configDir = await temporaryConfigDir();
    const defaultProfile = profile(14, { credentialRef: null });
    const addedProfile = profile(15, {
      providerId: 'anthropic',
      modelId: 'unrelated-model',
      credentialRef: uuid(115),
    });
    const original: AiUserConfig = {
      schemaVersion: 1,
      profiles: [defaultProfile],
      defaultProfileId: defaultProfile.id,
    };
    await writeAiUserConfig(configDir, original);
    const writes = persistence(configDir);
    const { fetcher, calls } = fakeFetcher([
      jsonResponse({ data: [{ id: 'provider-picked-model' }] }),
    ]);
    const picker = pendingSelectionWizard();
    const { io } = capture();

    const pendingCommand = runModel(['model'], io, picker.wizard, {
      model: {
        configDir,
        env: { OPENAI_API_KEY: secret },
        store: storeWith().store,
        fetcher,
        interactive: true,
        writeConfig: writes.writeConfig,
      },
    });
    await picker.selectionPending;
    const concurrentConfig = { ...original, profiles: [defaultProfile, addedProfile] };
    await writeAiUserConfig(configDir, concurrentConfig);
    picker.resolveSelection(0);
    const code = await pendingCommand;

    const expected = {
      ...concurrentConfig,
      profiles: [{ ...defaultProfile, modelId: 'provider-picked-model' }, addedProfile],
    };
    expect(code).toBe(0);
    expect(writes.writes).toEqual([expected]);
    expect(await readAiUserConfig(configDir)).toEqual(expected);
    expect(calls).toHaveLength(1);
    expect(picker.selectCalls).toHaveLength(1);
  });

  it.each([
    { change: 'default profile' },
    { change: 'provider id' },
    { change: 'model id' },
    { change: 'base URL' },
    { change: 'credential reference' },
  ] as const)(
    'rejects a stale manual save when the $change changes while the prompt is pending',
    async ({ change }) => {
      const configDir = await temporaryConfigDir();
      const defaultProfile = profile(16, {
        providerId: change === 'base URL' ? 'custom' : 'future-provider',
        baseUrl: change === 'base URL' ? 'https://gateway.example/v1' : null,
      });
      const otherProfile = profile(17, { providerId: 'other-provider', baseUrl: null });
      const original: AiUserConfig = {
        schemaVersion: 1,
        profiles: [defaultProfile, otherProfile],
        defaultProfileId: defaultProfile.id,
      };
      await writeAiUserConfig(configDir, original);
      const writes = persistence(configDir);
      const { fetcher, calls } = fakeFetcher([]);
      const pending = pendingPromptWizard();
      const { io, err } = capture();

      const pendingCommand = runModel(['model'], io, pending.wizard, {
        model: {
          configDir,
          env: {},
          store: storeWith().store,
          fetcher,
          interactive: true,
          writeConfig: writes.writeConfig,
        },
      });
      await pending.promptPending;

      let concurrentConfig: AiUserConfig;
      switch (change) {
        case 'default profile':
          concurrentConfig = { ...original, defaultProfileId: otherProfile.id };
          break;
        case 'provider id':
          concurrentConfig = {
            ...original,
            profiles: [{ ...defaultProfile, providerId: 'other-provider' }, otherProfile],
          };
          break;
        case 'model id':
          concurrentConfig = {
            ...original,
            profiles: [{ ...defaultProfile, modelId: 'concurrently-updated-model' }, otherProfile],
          };
          break;
        case 'base URL':
          concurrentConfig = {
            ...original,
            profiles: [
              { ...defaultProfile, baseUrl: 'https://gateway-two.example/v1' },
              otherProfile,
            ],
          };
          break;
        case 'credential reference':
          concurrentConfig = {
            ...original,
            profiles: [{ ...defaultProfile, credentialRef: uuid(301) }, otherProfile],
          };
          break;
        default:
          throw new Error(`unhandled concurrent profile change: ${change}`);
      }
      await writeAiUserConfig(configDir, concurrentConfig);
      pending.resolvePrompt('selected-model-after-concurrent-change');
      const code = await pendingCommand;

      expect(code).toBe(1);
      expect(err).toEqual([
        'planmo model: saved default AI profile changed while choosing a model; no changes were saved. Retry the command.',
      ]);
      expect(writes.writes).toHaveLength(0);
      expect(await readAiUserConfig(configDir)).toEqual(concurrentConfig);
      expect(calls).toEqual([]);
      expect(pending.promptCalls).toEqual(['Model id']);
    },
  );

  it.each([{ entry: 'an explicit operand' }, { entry: 'the interactive manual prompt' }] as const)(
    'rejects spoofing model ids entered through $entry without changing config',
    async ({ entry }) => {
      const configDir = await temporaryConfigDir();
      const saved = profile(18, {
        providerId: 'custom',
        baseUrl: 'https://gateway.example/v1',
        credentialRef: null,
      });
      const original: AiUserConfig = {
        schemaVersion: 1,
        profiles: [saved],
        defaultProfileId: saved.id,
      };
      await writeAiUserConfig(configDir, original);
      const unsafeModelId = `model${String.fromCharCode(0x202e)}-spoofed`;
      const explicit = entry === 'an explicit operand';
      const writes = persistence(configDir);
      const { fetcher, calls } = fakeFetcher([]);
      const prompts = scriptedWizard({ prompts: explicit ? [] : [unsafeModelId] });
      const { io, err } = capture();

      const code = await runModel(
        explicit ? ['model', unsafeModelId] : ['model'],
        io,
        prompts.wizard,
        {
          model: {
            configDir,
            env: {},
            store: storeWith().store,
            fetcher,
            interactive: !explicit,
            writeConfig: writes.writeConfig,
          },
        },
      );

      expect(code).toBe(1);
      expect(err.join('\\n')).toContain('could not validate the selected model id');
      expect(writes.writes).toHaveLength(0);
      expect(await readAiUserConfig(configDir)).toEqual(original);
      expect(calls).toEqual([]);
      expect(prompts.promptCalls).toEqual(explicit ? [] : ['Model id']);
    },
  );

  it.each([
    { entry: 'an explicit operand', characterName: 'line feed', character: 0x000a },
    { entry: 'an explicit operand', characterName: 'line separator', character: 0x2028 },
    { entry: 'an explicit operand', characterName: 'paragraph separator', character: 0x2029 },
    { entry: 'an explicit operand', characterName: 'format character', character: 0xfeff },
    {
      entry: 'the interactive manual prompt',
      characterName: 'line feed',
      character: 0x000a,
    },
    {
      entry: 'the interactive manual prompt',
      characterName: 'line separator',
      character: 0x2028,
    },
    {
      entry: 'the interactive manual prompt',
      characterName: 'paragraph separator',
      character: 0x2029,
    },
    {
      entry: 'the interactive manual prompt',
      characterName: 'format character',
      character: 0xfeff,
    },
  ] as const)(
    'rejects a trailing $characterName from $entry without writing or echoing it',
    async ({ entry, character }) => {
      const configDir = await temporaryConfigDir();
      const saved = profile(21, {
        providerId: 'custom',
        baseUrl: 'https://gateway.example/v1',
        credentialRef: null,
      });
      const original: AiUserConfig = {
        schemaVersion: 1,
        profiles: [saved],
        defaultProfileId: saved.id,
      };
      await writeAiUserConfig(configDir, original);
      const unsafeModelId = `manual-model${String.fromCharCode(character)}`;
      const explicit = entry === 'an explicit operand';
      const writes = persistence(configDir);
      const { fetcher, calls } = fakeFetcher([]);
      const prompts = scriptedWizard({ prompts: explicit ? [] : [unsafeModelId] });
      const { io, out, err } = capture();

      const code = await runModel(
        explicit ? ['model', unsafeModelId] : ['model'],
        io,
        prompts.wizard,
        {
          model: {
            configDir,
            env: {},
            store: storeWith().store,
            fetcher,
            interactive: !explicit,
            writeConfig: writes.writeConfig,
          },
        },
      );

      expect(code).toBe(1);
      expect(err.join('\n')).toContain('could not validate the selected model id');
      expect(writes.writes).toHaveLength(0);
      expect(await readAiUserConfig(configDir)).toEqual(original);
      expect(calls).toEqual([]);
      expect(prompts.promptCalls).toEqual(explicit ? [] : ['Model id']);
      expect([...out, ...err].every((line) => !line.includes(String.fromCharCode(character)))).toBe(
        true,
      );
    },
  );

  it('reports OpenRouter continuation data as an incomplete model list', async () => {
    const configDir = await temporaryConfigDir();
    const saved = profile(19, { providerId: 'openrouter', credentialRef: null });
    await saveConfig(configDir, [saved]);
    const { fetcher, calls } = fakeFetcher([
      jsonResponse({
        data: [{ id: 'openrouter/text' }],
        links: { next: 'https://untrusted.invalid/next-page' },
      }),
    ]);
    const prompts = scriptedWizard({ selections: [0] });
    const { io, out } = capture();

    const code = await runModel(['model'], io, prompts.wizard, {
      model: {
        configDir,
        env: { OPENROUTER_API_KEY: secret },
        store: storeWith().store,
        fetcher,
        interactive: true,
      },
    });

    const output = out.join('\\n');
    expect(code).toBe(0);
    expect(calls).toHaveLength(1);
    expect(output.toLowerCase()).toContain('model list is incomplete');
    expect(output).toContain('enter a model id manually if it is missing');
    expect(output).not.toContain('configured limit');
    expect((await readAiUserConfig(configDir))?.profiles[0]?.modelId).toBe('openrouter/text');
  });

  it('reports an empty OpenRouter page with continuation as incomplete before manual entry', async () => {
    const configDir = await temporaryConfigDir();
    const saved = profile(20, { providerId: 'openrouter', credentialRef: null });
    await saveConfig(configDir, [saved]);
    const { fetcher, calls } = fakeFetcher([
      jsonResponse({ data: [], links: { next: 'https://untrusted.invalid/next-page' } }),
    ]);
    const prompts = scriptedWizard({ prompts: ['manual-openrouter-model'] });
    const writes = persistence(configDir);
    const { io, out, err } = capture();

    const code = await runModel(['model'], io, prompts.wizard, {
      model: {
        configDir,
        env: { OPENROUTER_API_KEY: secret },
        store: storeWith().store,
        fetcher,
        interactive: true,
        writeConfig: writes.writeConfig,
      },
    });

    const output = `${out.join('\n')}\n${err.join('\n')}`;
    expect(code).toBe(0);
    expect(calls).toHaveLength(1);
    expect(prompts.selectCalls).toEqual([]);
    expect(prompts.promptCalls).toEqual(['Model id']);
    expect(output.toLowerCase()).toContain('provider-reported model list is incomplete');
    expect(output).toContain('manual model id');
    expect(output.toLowerCase()).not.toContain('limit');
    expect(writes.writes).toHaveLength(1);
    expect((await readAiUserConfig(configDir))?.profiles[0]?.modelId).toBe(
      'manual-openrouter-model',
    );
  });

  it('reports truncated Anthropic catalogs before prompting', async () => {
    const configDir = await temporaryConfigDir();
    const saved = profile(12, { providerId: 'anthropic', credentialRef: null });
    await saveConfig(configDir, [saved]);
    const responses = Array.from({ length: 5 }, (_, page) =>
      jsonResponse({
        data: Array.from({ length: 100 }, (_unused, item) => ({
          id: `page-${page}-model-${item}`,
        })),
        has_more: true,
        last_id: `cursor-${page}`,
      }),
    );
    const { fetcher, calls } = fakeFetcher(responses);
    const prompts = scriptedWizard({ selections: [0] });
    const { io, out } = capture();

    const code = await runModel(['model'], io, prompts.wizard, {
      model: {
        configDir,
        env: { ANTHROPIC_API_KEY: secret },
        store: storeWith().store,
        fetcher,
        interactive: true,
      },
    });

    expect(code).toBe(0);
    expect(calls).toHaveLength(5);
    expect(out.join('\\n').toLowerCase()).toContain('incomplete');
    expect(out.join('\n')).toContain('provider-reported');
    expect((await readAiUserConfig(configDir))?.profiles[0]?.modelId).toBe('page-0-model-0');
  });
});
