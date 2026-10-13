import { randomUUID } from 'node:crypto';
import { lstat, mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { AiUserConfigSchema } from '@planmo/schema';
import type { AiUserConfig } from '@planmo/schema';

export class InvalidAiUserConfigError extends Error {
  constructor() {
    super('AI user config is invalid.');
    this.name = 'InvalidAiUserConfigError';
  }
}

export class SymlinkAiUserConfigError extends Error {
  constructor() {
    super('AI user config must not be a symbolic link.');
    this.name = 'SymlinkAiUserConfigError';
  }
}

function hasErrorCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code;
}

function validateAiUserConfig(value: unknown): AiUserConfig {
  try {
    return AiUserConfigSchema.parse(value);
  } catch {
    throw new InvalidAiUserConfigError();
  }
}

function parseAiUserConfig(contents: string): AiUserConfig {
  let value: unknown;
  try {
    value = JSON.parse(contents) as unknown;
  } catch {
    throw new InvalidAiUserConfigError();
  }
  return validateAiUserConfig(value);
}

async function assertConfigPathIsNotSymlink(configPath: string): Promise<void> {
  try {
    if ((await lstat(configPath)).isSymbolicLink()) {
      throw new SymlinkAiUserConfigError();
    }
  } catch (error) {
    if (hasErrorCode(error, 'ENOENT')) return;
    throw error;
  }
}

export async function readAiUserConfig(configDir: string): Promise<AiUserConfig | null> {
  let contents: string;
  try {
    contents = await readFile(join(configDir, 'config.json'), 'utf8');
  } catch (error) {
    if (hasErrorCode(error, 'ENOENT')) return null;
    throw error;
  }

  return parseAiUserConfig(contents);
}

export async function writeAiUserConfig(configDir: string, config: AiUserConfig): Promise<void> {
  const validatedConfig = validateAiUserConfig(config);
  const configPath = join(configDir, 'config.json');
  await assertConfigPathIsNotSymlink(configPath);
  await readAiUserConfig(configDir);
  await mkdir(configDir, { recursive: true, mode: 0o700 });

  const temporaryPath = join(configDir, `.config.json.${randomUUID()}.tmp`);
  const serialized = `${JSON.stringify(validatedConfig, null, 2)}\n`;
  let temporaryFileCreated = false;

  try {
    const temporaryFile =
      process.platform === 'win32'
        ? await open(temporaryPath, 'wx')
        : await open(temporaryPath, 'wx', 0o600);
    temporaryFileCreated = true;
    try {
      await temporaryFile.writeFile(serialized, { encoding: 'utf8' });
      await temporaryFile.sync();
    } finally {
      await temporaryFile.close();
    }

    await rename(temporaryPath, configPath);
    temporaryFileCreated = false;
  } finally {
    if (temporaryFileCreated) {
      try {
        await unlink(temporaryPath);
      } catch (error) {
        if (!hasErrorCode(error, 'ENOENT')) throw error;
      }
    }
  }
}
