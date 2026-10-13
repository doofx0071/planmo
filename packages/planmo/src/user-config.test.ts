import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { AiUserConfig } from '@planmo/schema';
import {
  InvalidAiUserConfigError,
  readAiUserConfig,
  SymlinkAiUserConfigError,
  writeAiUserConfig,
} from './user-config.js';

const lstatInjection = vi.hoisted(() => ({
  enabled: false,
  mock: vi.fn(),
}));

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...actual,
    lstat: (...args: Parameters<typeof actual.lstat>) =>
      lstatInjection.enabled ? lstatInjection.mock(...args) : actual.lstat(...args),
  };
});

function makeConfig(modelId: string): AiUserConfig {
  return {
    schemaVersion: 1,
    profiles: [
      {
        id: '550e8400-e29b-41d4-a716-446655440000',
        providerId: 'openai',
        modelId,
        baseUrl: null,
        credentialRef: null,
      },
    ],
    defaultProfileId: '550e8400-e29b-41d4-a716-446655440000',
  };
}

const validConfig = makeConfig('gpt-4o-mini');
const updatedConfig = makeConfig('gpt-4.1');

async function withTemporaryDirectory(run: (root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), 'planmo-user-config-'));
  try {
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

describe('readAiUserConfig()', () => {
  it('returns null when config.json is absent, even if another JSON file exists', async () => {
    await withTemporaryDirectory(async (root) => {
      await writeFile(join(root, 'profiles.json'), '{not valid json', 'utf8');

      await expect(readAiUserConfig(root)).resolves.toBeNull();
    });
  });

  it('parses config.json through the shared schema and canonicalizes UUIDs', async () => {
    await withTemporaryDirectory(async (root) => {
      const uppercaseId = '550E8400-E29B-41D4-A716-446655440000';
      const uppercaseCredentialRef = '550E8400-E29B-41D4-A716-446655440001';
      const input = {
        schemaVersion: 1,
        profiles: [
          {
            id: uppercaseId,
            providerId: 'openai',
            modelId: 'gpt-4o-mini',
            baseUrl: null,
            credentialRef: uppercaseCredentialRef,
          },
        ],
        defaultProfileId: uppercaseId,
      };
      await writeFile(join(root, 'config.json'), JSON.stringify(input), 'utf8');

      await expect(readAiUserConfig(root)).resolves.toEqual({
        schemaVersion: 1,
        profiles: [
          {
            id: uppercaseId.toLowerCase(),
            providerId: 'openai',
            modelId: 'gpt-4o-mini',
            baseUrl: null,
            credentialRef: uppercaseCredentialRef.toLowerCase(),
          },
        ],
        defaultProfileId: uppercaseId.toLowerCase(),
      });
    });
  });

  it.each([
    ['malformed JSON', '{"apiKey":"sensitive-marker",'],
    [
      'schema-invalid JSON',
      JSON.stringify({
        schemaVersion: 2,
        profiles: [],
        defaultProfileId: null,
        apiKey: 'sensitive-marker',
      }),
    ],
  ])('rejects %s with a safe typed error without rewriting the file', async (_kind, contents) => {
    await withTemporaryDirectory(async (root) => {
      const configPath = join(root, 'config.json');
      await writeFile(configPath, contents, 'utf8');

      const error = await readAiUserConfig(root).catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(Error);
      expect(error).toMatchObject({
        name: 'InvalidAiUserConfigError',
        message: 'AI user config is invalid.',
      });
      expect((error as Error).message).not.toContain('sensitive-marker');
      await expect(readFile(configPath, 'utf8')).resolves.toBe(contents);
    });
  });
});

describe('writeAiUserConfig()', () => {
  it('atomically replaces config.json, reloads it, and leaves no temporary file', async () => {
    await withTemporaryDirectory(async (root) => {
      const configDir = join(root, 'config');
      const configPath = join(configDir, 'config.json');

      await writeAiUserConfig(configDir, validConfig);
      await writeAiUserConfig(configDir, updatedConfig);

      await expect(readAiUserConfig(configDir)).resolves.toEqual(updatedConfig);
      const serialized = await readFile(configPath, 'utf8');
      expect(serialized.endsWith('\n')).toBe(true);
      expect(JSON.parse(serialized)).toEqual(updatedConfig);
      expect(serialized).not.toMatch(/apiKey|token/i);
      await expect(readdir(configDir)).resolves.toEqual(['config.json']);

      if (process.platform !== 'win32') {
        const directoryMode = (await stat(configDir)).mode & 0o777;
        const fileMode = (await stat(configPath)).mode & 0o777;
        expect(directoryMode).toBe(0o700);
        expect(fileMode).toBe(0o600);
      }
    });
  });

  it('rejects a secret-bearing config instead of persisting apiKey', async () => {
    await withTemporaryDirectory(async (root) => {
      const secretBearingConfig = {
        ...validConfig,
        apiKey: 'sensitive-marker',
      } as unknown as AiUserConfig;

      await expect(writeAiUserConfig(root, secretBearingConfig)).rejects.toBeInstanceOf(
        InvalidAiUserConfigError,
      );
      await expect(readdir(root)).resolves.toEqual([]);
    });
  });

  it('refuses to overwrite malformed config.json and preserves its bytes', async () => {
    await withTemporaryDirectory(async (root) => {
      const configDir = join(root, 'config');
      const configPath = join(configDir, 'config.json');
      const malformedContents = '{"schemaVersion":1,"profiles":[{"apiKey":"keep-this"}';
      await mkdir(configDir, { recursive: true });
      await writeFile(configPath, malformedContents, 'utf8');

      await expect(writeAiUserConfig(configDir, updatedConfig)).rejects.toBeInstanceOf(
        InvalidAiUserConfigError,
      );
      await expect(readFile(configPath, 'utf8')).resolves.toBe(malformedContents);
      await expect(readdir(configDir)).resolves.toEqual(['config.json']);
    });
  });

  it('refuses to replace a config.json symlink and preserves its target', async ({ skip }) => {
    await withTemporaryDirectory(async (root) => {
      const configDir = join(root, 'config');
      const configPath = join(configDir, 'config.json');
      const targetPath = join(root, 'external-config.json');
      const targetContents = Buffer.from(JSON.stringify(validConfig));
      await mkdir(configDir, { recursive: true });
      await writeFile(targetPath, targetContents);

      try {
        await symlink(targetPath, configPath, 'file');
      } catch (error) {
        const code =
          typeof error === 'object' &&
          error !== null &&
          'code' in error &&
          typeof error.code === 'string'
            ? error.code
            : null;
        if (
          code === null ||
          !['EACCES', 'ENOSYS', 'ENOTSUP', 'EOPNOTSUPP', 'EPERM'].includes(code)
        ) {
          throw error;
        }
        skip(`Symlink creation is unavailable on ${process.platform} (${code}).`);
        return;
      }

      const writeError = await writeAiUserConfig(configDir, updatedConfig).catch(
        (error: unknown) => error,
      );

      expect(writeError).toBeInstanceOf(SymlinkAiUserConfigError);
      expect(writeError).toMatchObject({
        name: 'SymlinkAiUserConfigError',
        message: 'AI user config must not be a symbolic link.',
      });
      expect((writeError as Error).message).not.toContain(targetPath);
      expect((writeError as Error).message).not.toContain(targetContents.toString('utf8'));
      expect((await lstat(configPath)).isSymbolicLink()).toBe(true);
      await expect(readFile(targetPath)).resolves.toEqual(targetContents);
    });
  });

  it('rejects config.json when lstat identifies it as a symlink', async () => {
    await withTemporaryDirectory(async (root) => {
      const configDir = join(root, 'config');
      const configPath = join(configDir, 'config.json');
      await mkdir(configDir, { recursive: true });
      lstatInjection.enabled = true;
      lstatInjection.mock.mockResolvedValue({
        isSymbolicLink: () => true,
      } as Awaited<ReturnType<typeof lstat>>);

      try {
        const writeError = await writeAiUserConfig(configDir, updatedConfig).catch(
          (error: unknown) => error,
        );

        expect(writeError).toBeInstanceOf(SymlinkAiUserConfigError);
        expect(writeError).toMatchObject({
          name: 'SymlinkAiUserConfigError',
          message: 'AI user config must not be a symbolic link.',
        });
        expect(lstatInjection.mock).toHaveBeenCalledWith(configPath);
        await expect(readdir(configDir)).resolves.toEqual([]);
      } finally {
        lstatInjection.enabled = false;
        lstatInjection.mock.mockReset();
      }
    });
  });
});
