import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockProvider } from '@planmo/ai';
import type { HttpProviderConfig, ModelProvider } from '@planmo/ai';
import { PLAN_PATH, type AiUserConfig } from '@planmo/schema';
import type { CliIO, WizardIO } from '../cli-io.js';
import type { CredentialStore } from '../credential-store.js';
import { run } from '../index.js';
import { mockPlanResponse } from '../plan-build.js';
import { readPlanDocument } from '../plan.js';
import type { PlanCommandDependencies } from './plan.js';
import { readAiUserConfig, writeAiUserConfig } from '../user-config.js';

vi.mock('../keyring-credential-store.js', () => ({
  KeyringCredentialStore: class {
    async get() {
      throw new Error('real keyring access is disabled in plan tests');
    }
    async set() {
      throw new Error('real keyring access is disabled in plan tests');
    }
    async remove() {
      throw new Error('real keyring access is disabled in plan tests');
    }
    async has() {
      throw new Error('real keyring access is disabled in plan tests');
    }
  },
}));

type PlanTestDependencies = PlanCommandDependencies;

type PlanCli = (
  argv: string[],
  io: CliIO,
  wizard?: WizardIO,
  dependencies?: { plan?: PlanTestDependencies },
) => Promise<number>;

// The fourth argument exercises plan dependency wiring without mutating process.env.
const runPlanCli = run as unknown as PlanCli;

const temporaryDirectories: string[] = [];
async function temporaryDirectory(prefix: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
}

beforeEach(() => {
  // A broken dependency route must fail without accidentally using real credentials or network.
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

const uuid = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;

function userConfig(
  options: {
    providerId?: string;
    modelId?: string;
    baseUrl?: string | null;
    credentialRef?: string | null;
  } = {},
): AiUserConfig {
  const profileId = uuid(1);
  return {
    schemaVersion: 1,
    profiles: [
      {
        id: profileId,
        providerId: options.providerId ?? 'openai',
        modelId: options.modelId ?? 'gpt-4.1-mini',
        baseUrl: options.baseUrl === undefined ? null : options.baseUrl,
        credentialRef: options.credentialRef === undefined ? uuid(2) : options.credentialRef,
      },
    ],
    defaultProfileId: profileId,
  };
}

function fakeCredentialStore(initial: Readonly<Record<string, string>> = {}, getFailure?: Error) {
  const values = new Map(Object.entries(initial));
  const gets: string[] = [];
  const store: CredentialStore = {
    async get(ref) {
      gets.push(ref);
      if (getFailure !== undefined) throw getFailure;
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
  return { store, values, gets };
}

function mockHttpFactory(idea: string, calls: HttpProviderConfig[]) {
  return (config: HttpProviderConfig): ModelProvider => {
    calls.push(config);
    return createMockProvider({ text: mockPlanResponse(idea) });
  };
}

async function initializedWorkspace(): Promise<string> {
  const root = await temporaryDirectory('planmo-plan-command-workspace-');
  const code = await runPlanCli(['init', root, '--yes'], capture().io);
  expect(code).toBe(0);
  return root;
}

function planDependencies(
  configDir: string,
  env: Readonly<Record<string, string | undefined>>,
  store: CredentialStore,
  providerFactory: (config: HttpProviderConfig) => ModelProvider,
) {
  return { plan: { configDir, env, store, providerFactory } };
}

describe('planmo plan — saved AI defaults', () => {
  it('uses the saved default profile, custom endpoint, model, and keyring credential', async () => {
    const root = await initializedWorkspace();
    const configDir = await temporaryDirectory('planmo-plan-command-config-');
    const credentialRef = uuid(2);
    const secret = 'synthetic-keyring-plan-secret';
    const baseUrl = 'http://127.0.0.1:11434/v1';
    const idea = 'Build a local planning assistant';
    await writeAiUserConfig(
      configDir,
      userConfig({
        providerId: 'custom',
        modelId: 'qwen3:8b',
        baseUrl,
        credentialRef,
      }),
    );
    const credentialStore = fakeCredentialStore({ [credentialRef]: secret });
    const factoryCalls: HttpProviderConfig[] = [];
    const { io, out, err } = capture();

    const code = await runPlanCli(
      ['plan', idea, '--dir', root],
      io,
      undefined,
      planDependencies(configDir, {}, credentialStore.store, mockHttpFactory(idea, factoryCalls)),
    );

    expect(code).toBe(0);
    expect(credentialStore.gets).toEqual([credentialRef]);
    expect(factoryCalls).toEqual([
      { baseUrl, apiKey: secret, model: 'qwen3:8b', wireFormat: 'openai' },
    ]);
    expect(await readPlanDocument(root)).toMatchObject({
      idea,
      provider: { id: 'custom', model: 'qwen3:8b' },
    });
    const planText = await readFile(join(root, PLAN_PATH), 'utf8');
    const configText = await readFile(join(configDir, 'config.json'), 'utf8');
    expect(`${out.join('\n')}\n${err.join('\n')}\n${planText}\n${configText}`).not.toContain(
      secret,
    );
  });

  it('uses a nonblank environment credential instead of reading the saved keyring entry', async () => {
    const root = await initializedWorkspace();
    const configDir = await temporaryDirectory('planmo-plan-command-config-');
    const credentialRef = uuid(2);
    const keyringSecret = 'synthetic-keyring-secret';
    const environmentSecret = 'synthetic-environment-secret';
    const idea = 'Build a planning assistant';
    await writeAiUserConfig(
      configDir,
      userConfig({ providerId: 'openai', modelId: 'gpt-4.1-mini', credentialRef }),
    );
    const credentialStore = fakeCredentialStore({ [credentialRef]: keyringSecret });
    const factoryCalls: HttpProviderConfig[] = [];
    const { io, out, err } = capture();

    const code = await runPlanCli(
      ['plan', idea, '--dir', root],
      io,
      undefined,
      planDependencies(
        configDir,
        { OPENAI_API_KEY: environmentSecret },
        credentialStore.store,
        mockHttpFactory(idea, factoryCalls),
      ),
    );

    expect(code).toBe(0);
    expect(factoryCalls[0]?.apiKey).toBe(environmentSecret);
    expect(credentialStore.gets).toEqual([]);
    expect(`${out.join('\n')}\n${err.join('\n')}`).not.toContain(keyringSecret);
    expect(`${out.join('\n')}\n${err.join('\n')}`).not.toContain(environmentSecret);
  });

  it('lets explicit provider, model, and base URL flags override the saved profile', async () => {
    const root = await initializedWorkspace();
    const configDir = await temporaryDirectory('planmo-plan-command-config-');
    const credentialRef = uuid(2);
    const keyringSecret = 'synthetic-explicit-profile-key';
    const explicitBaseUrl = 'http://127.0.0.1:12345/v1';
    const idea = 'Build an explicitly configured planner';
    await writeAiUserConfig(
      configDir,
      userConfig({
        providerId: 'custom',
        modelId: 'saved-model',
        baseUrl: 'http://127.0.0.1:11434/v1',
        credentialRef,
      }),
    );
    const credentialStore = fakeCredentialStore({ [credentialRef]: keyringSecret });
    const factoryCalls: HttpProviderConfig[] = [];
    const { io } = capture();

    const code = await runPlanCli(
      [
        'plan',
        idea,
        '--dir',
        root,
        '--provider',
        'custom',
        '--model',
        'explicit-model',
        '--base-url',
        explicitBaseUrl,
      ],
      io,
      undefined,
      planDependencies(configDir, {}, credentialStore.store, mockHttpFactory(idea, factoryCalls)),
    );

    expect(code).toBe(0);
    expect(factoryCalls).toEqual([
      {
        baseUrl: explicitBaseUrl,
        apiKey: keyringSecret,
        model: 'explicit-model',
        wireFormat: 'openai',
      },
    ]);
    expect(credentialStore.gets).toEqual([credentialRef]);
    expect(await readPlanDocument(root)).toMatchObject({
      provider: { id: 'custom', model: 'explicit-model' },
    });
  });

  it('rejects an unsafe explicit base URL before reading credentials or creating a provider', async () => {
    const root = await initializedWorkspace();
    const configDir = await temporaryDirectory('planmo-plan-command-config-');
    const credentialRef = uuid(2);
    const queryToken = 'synthetic-explicit-url-query-token';
    const explicitBaseUrl = `http://attacker.example/v1?token=${queryToken}`;
    await writeAiUserConfig(
      configDir,
      userConfig({ providerId: 'openai', modelId: 'gpt-4.1-mini', credentialRef }),
    );
    const credentialStore = fakeCredentialStore({
      [credentialRef]: 'synthetic-explicit-url-keyring-secret',
    });
    const factoryCalls: HttpProviderConfig[] = [];
    const { io, out, err } = capture();

    const code = await runPlanCli(
      ['plan', 'Build something', '--dir', root, '--base-url', explicitBaseUrl],
      io,
      undefined,
      planDependencies(
        configDir,
        {},
        credentialStore.store,
        mockHttpFactory('Build something', factoryCalls),
      ),
    );

    expect(code).toBe(1);
    expect(credentialStore.gets).toEqual([]);
    expect(factoryCalls).toEqual([]);
    const output = `${out.join('\n')}\n${err.join('\n')}`;
    expect(output).not.toContain(explicitBaseUrl);
    expect(output).not.toContain('http://attacker.example');
    expect(output).not.toContain('?token=');
    expect(output).not.toContain(queryToken);
  });

  it('does not borrow model, endpoint, or keyring reference for an explicit different provider', async () => {
    const root = await initializedWorkspace();
    const configDir = await temporaryDirectory('planmo-plan-command-config-');
    const credentialRef = uuid(2);
    const idea = 'Build a provider-overridden planner';
    await writeAiUserConfig(
      configDir,
      userConfig({
        providerId: 'custom',
        modelId: 'saved-custom-model',
        baseUrl: 'http://127.0.0.1:11434/v1',
        credentialRef,
      }),
    );
    const credentialStore = fakeCredentialStore({ [credentialRef]: 'must-not-be-used' });
    const factoryCalls: HttpProviderConfig[] = [];
    const { io } = capture();

    const code = await runPlanCli(
      ['plan', idea, '--dir', root, '--provider', 'openai', '--model', 'gpt-route-model'],
      io,
      undefined,
      planDependencies(
        configDir,
        { OPENAI_API_KEY: 'synthetic-openai-route-key' },
        credentialStore.store,
        mockHttpFactory(idea, factoryCalls),
      ),
    );

    expect(code).toBe(0);
    expect(factoryCalls).toEqual([
      {
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'synthetic-openai-route-key',
        model: 'gpt-route-model',
        wireFormat: 'openai',
      },
    ]);
    expect(credentialStore.gets).toEqual([]);
    expect(await readPlanDocument(root)).toMatchObject({
      provider: { id: 'openai', model: 'gpt-route-model' },
    });
  });

  it('requires a new model when an explicit different provider overrides the saved one', async () => {
    const root = await initializedWorkspace();
    const configDir = await temporaryDirectory('planmo-plan-command-config-');
    const credentialRef = uuid(2);
    await writeAiUserConfig(
      configDir,
      userConfig({
        providerId: 'custom',
        modelId: 'must-not-be-reused',
        baseUrl: 'http://127.0.0.1:11434/v1',
        credentialRef,
      }),
    );
    const credentialStore = fakeCredentialStore({ [credentialRef]: 'must-not-be-used' });
    const factoryCalls: HttpProviderConfig[] = [];
    const { io, err } = capture();

    const code = await runPlanCli(
      ['plan', 'Build something', '--dir', root, '--provider', 'openai'],
      io,
      undefined,
      planDependencies(
        configDir,
        { OPENAI_API_KEY: 'synthetic-openai-route-key' },
        credentialStore.store,
        mockHttpFactory('Build something', factoryCalls),
      ),
    );

    expect(code).toBe(1);
    expect(err.join('\n')).toContain('a model is required');
    expect(factoryCalls).toEqual([]);
    expect(credentialStore.gets).toEqual([]);
  });

  it('keeps environment-based provider auto-detection when there is no default profile', async () => {
    const root = await initializedWorkspace();
    const configDir = await temporaryDirectory('planmo-plan-command-config-');
    const idea = 'Build an environment-configured planner';
    const environmentSecret = 'synthetic-deepseek-environment-key';
    const credentialStore = fakeCredentialStore();
    const factoryCalls: HttpProviderConfig[] = [];
    const { io } = capture();

    const code = await runPlanCli(
      ['plan', idea, '--dir', root, '--model', 'deepseek-chat'],
      io,
      undefined,
      planDependencies(
        configDir,
        { DEEPSEEK_API_KEY: environmentSecret },
        credentialStore.store,
        mockHttpFactory(idea, factoryCalls),
      ),
    );

    expect(code).toBe(0);
    expect(factoryCalls).toEqual([
      {
        baseUrl: 'https://api.deepseek.com/v1',
        apiKey: environmentSecret,
        model: 'deepseek-chat',
        wireFormat: 'openai',
      },
    ]);
    expect(credentialStore.gets).toEqual([]);
    expect(await readPlanDocument(root)).toMatchObject({
      provider: { id: 'deepseek', model: 'deepseek-chat' },
    });
  });

  it('fails closed on a malformed profile and redacts its contents before provider creation', async () => {
    const root = await initializedWorkspace();
    const configDir = await temporaryDirectory('planmo-plan-command-config-');
    const secret = 'synthetic-invalid-profile-secret';
    await writeFile(
      join(configDir, 'config.json'),
      JSON.stringify({ schemaVersion: 1, profiles: [], defaultProfileId: null, apiKey: secret }),
      'utf8',
    );
    const credentialStore = fakeCredentialStore();
    const factoryCalls: HttpProviderConfig[] = [];
    const { io, out, err } = capture();

    const code = await runPlanCli(
      ['plan', 'Build something', '--dir', root],
      io,
      undefined,
      planDependencies(
        configDir,
        { OPENAI_API_KEY: 'synthetic-env-key' },
        credentialStore.store,
        mockHttpFactory('Build something', factoryCalls),
      ),
    );

    expect(code).toBe(1);
    expect(factoryCalls).toEqual([]);
    expect(credentialStore.gets).toEqual([]);
    expect(`${out.join('\n')}\n${err.join('\n')}`).not.toContain(secret);
    expect(err.join('\n')).not.toContain('Unexpected token');
  });

  it('fails closed and redacts a keyring error before provider creation', async () => {
    const root = await initializedWorkspace();
    const configDir = await temporaryDirectory('planmo-plan-command-config-');
    const credentialRef = uuid(2);
    const secret = 'synthetic-keyring-error-secret';
    await writeAiUserConfig(
      configDir,
      userConfig({ providerId: 'openai', modelId: 'gpt-4.1-mini', credentialRef }),
    );
    const credentialStore = fakeCredentialStore({}, new Error(`keyring rejected ${secret}`));
    const factoryCalls: HttpProviderConfig[] = [];
    const { io, out, err } = capture();

    const code = await runPlanCli(
      ['plan', 'Build something', '--dir', root],
      io,
      undefined,
      planDependencies(
        configDir,
        {},
        credentialStore.store,
        mockHttpFactory('Build something', factoryCalls),
      ),
    );

    expect(code).toBe(1);
    expect(factoryCalls).toEqual([]);
    expect(credentialStore.gets).toEqual([credentialRef]);
    expect(`${out.join('\n')}\n${err.join('\n')}`).not.toContain(secret);
    expect(`${out.join('\n')}\n${err.join('\n')}`).not.toContain('keyring rejected');
    expect(`${out.join('\n')}\n${err.join('\n')}`).not.toContain(credentialRef);
  });

  it('keeps --provider mock offline and bypasses malformed config and the keyring', async () => {
    const root = await initializedWorkspace();
    const configDir = await temporaryDirectory('planmo-plan-command-config-');
    const invalidConfigSecret = 'synthetic-mock-bypass-secret';
    await writeFile(join(configDir, 'config.json'), `not-json ${invalidConfigSecret}`, 'utf8');
    const credentialStore = fakeCredentialStore({}, new Error('keyring must not be read'));
    const factoryCalls: HttpProviderConfig[] = [];
    const { io, out, err } = capture();
    const idea = 'Build a mock planner';

    const code = await runPlanCli(
      ['plan', idea, '--dir', root, '--provider', 'mock'],
      io,
      undefined,
      planDependencies(configDir, {}, credentialStore.store, mockHttpFactory(idea, factoryCalls)),
    );

    expect(code).toBe(0);
    expect(factoryCalls).toEqual([]);
    expect(credentialStore.gets).toEqual([]);
    expect(err.join('\n')).toContain('mock provider');
    expect(await readPlanDocument(root)).toMatchObject({
      provider: { id: 'mock', model: 'mock' },
    });
  });

  it('checks the workspace before reading user config or resolving credentials', async () => {
    const root = await temporaryDirectory('planmo-plan-command-empty-');
    const configDir = await temporaryDirectory('planmo-plan-command-config-');
    await writeFile(join(configDir, 'config.json'), '{malformed profile', 'utf8');
    const credentialStore = fakeCredentialStore();
    const factoryCalls: HttpProviderConfig[] = [];
    const { io, err } = capture();

    const code = await runPlanCli(
      ['plan', 'Build something', '--dir', root],
      io,
      undefined,
      planDependencies(
        configDir,
        {},
        credentialStore.store,
        mockHttpFactory('Build something', factoryCalls),
      ),
    );

    expect(code).toBe(3);
    expect(err.join('\n')).toContain('no PlanMo project found');
    expect(err.join('\n')).not.toContain('AI profile configuration');
    expect(factoryCalls).toEqual([]);
    expect(credentialStore.gets).toEqual([]);
  });

  it('keeps generate model-free and independent of user AI config', async () => {
    const root = await initializedWorkspace();
    const configDir = await temporaryDirectory('planmo-plan-command-config-');
    await writeFile(join(configDir, 'config.json'), '{malformed profile', 'utf8');
    const credentialStore = fakeCredentialStore({}, new Error('generate must not read keyring'));
    const factoryCalls: HttpProviderConfig[] = [];
    const { io } = capture();

    const code = await runPlanCli(
      ['generate', '--dir', root],
      io,
      undefined,
      planDependencies(
        configDir,
        {},
        credentialStore.store,
        mockHttpFactory('not used for generate', factoryCalls),
      ),
    );

    expect(code).toBe(0);
    expect(factoryCalls).toEqual([]);
    expect(credentialStore.gets).toEqual([]);
    await expect(readAiUserConfig(configDir)).rejects.toThrow(/invalid/i);
  });
});
