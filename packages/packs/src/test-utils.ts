import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Test helpers for @planmo/packs.
 * Rich fixures live as REAL files under `src/fixtures/` (P04-05: malicious
 * and conflicting pack fixtures are on-disk, not inline objects).
 */

export function makeTempDir(prefix = 'planmo-packs-'): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

/** Write a pack.yml inside `dir/<ref>` and return the pack directory path. */
export function writePack(dir: string, ref: string, packYaml: string): string {
  const packDir = join(dir, ref);
  mkdirSync(packDir, { recursive: true });
  writeFileSync(join(packDir, 'pack.yml'), packYaml, 'utf8');
  return packDir;
}

export function validPackYaml(
  ref: string,
  category = 'stack',
  version = '1.0.0',
  extra = '',
): string {
  return [
    `schemaVersion: 1`,
    `ref: ${ref}`,
    `name: Test pack ${ref}`,
    `version: ${version}`,
    `category: ${category}`,
    `description: Fixture pack for ${ref}.`,
    extra,
  ]
    .filter((l) => l.length > 0)
    .join('\n');
}
