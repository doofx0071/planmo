import { describe, expect, it } from 'vitest';
import { loadPack } from './loader.js';
import { compareSemVer, resolvePacks, resolutionFingerprint } from './resolve.js';
import { makeTempDir, validPackYaml, writePack } from './test-utils.js';

/** A real on-disk pack for catalog building. */
function packFromYaml(dir: string, ref: string, yaml: string) {
  const packDir = writePack(dir, ref, yaml);
  return loadPack(packDir);
}

describe('compareSemVer (deterministic order)', () => {
  it('orders 1.2.0 > 1.1.9 > 1.1.0-beta.1', () => {
    expect(compareSemVer('1.2.0', '1.1.9')).toBeGreaterThan(0);
    expect(compareSemVer('1.1.9', '1.1.0-beta.1')).toBeGreaterThan(0);
    expect(compareSemVer('1.1.0-beta.1', '1.1.0')).toBeLessThan(0);
  });

  it('is reflexive', () => {
    expect(compareSemVer('0.0.0', '0.0.0')).toBe(0);
  });
});

describe('resolvePacks (P04-02 deterministic resolution)', () => {
  it('resolves a single requested pack with no deps', () => {
    const dir = makeTempDir();
    const catalog = [packFromYaml(dir, 'stack/a', validPackYaml('stack/a'))];
    const result = resolvePacks(catalog, ['stack/a']);
    expect(result.ok).toBe(true);
    expect(result.order).toEqual(['stack/a']);
    expect(result.diagnostics).toHaveLength(0);
  });

  it('resolves transitive requires in dependency-first order', () => {
    const dir = makeTempDir();
    const catalog = [
      packFromYaml(dir, 'stack/base', validPackYaml('stack/base')),
      packFromYaml(dir, 'stack/top', validPackYaml('stack/top') + '\nrequires:\n  - stack/base'),
    ];
    // Request the dependent; base must come before top (topological order).
    const result = resolvePacks(catalog, ['stack/top']);
    expect(result.ok).toBe(true);
    expect(result.order).toEqual(['stack/base', 'stack/top']);
  });

  it('is deterministic: identical inputs → identical fingerprint', () => {
    const dir = makeTempDir();
    const catalog = [
      packFromYaml(dir, 'stack/base', validPackYaml('stack/base')),
      packFromYaml(dir, 'stack/top', validPackYaml('stack/top') + '\nrequires:\n  - stack/base'),
    ];
    const a = resolvePacks(catalog, ['stack/top']);
    const b = resolvePacks(catalog, ['stack/top']);
    expect(resolutionFingerprint(a)).toBe(resolutionFingerprint(b));
    // Shape: <ref>@<version>#<64-hex>;<ref>@<version>#<64-hex>
    const parts = resolutionFingerprint(a).split(';');
    expect(parts).toHaveLength(2);
    for (const part of parts) {
      expect(part.match(/^stack\/\w+@1\.0\.0#[0-9a-f]{64}$/)).not.toBeNull();
    }
  });

  it('picks the highest version when a ref appears twice', () => {
    const dirA = makeTempDir();
    const dirB = makeTempDir();
    const catalog = [
      packFromYaml(dirA, 'stack/a', validPackYaml('stack/a', 'stack', '1.0.0')),
      packFromYaml(dirB, 'stack/a', validPackYaml('stack/a', 'stack', '2.0.0')),
    ];
    const result = resolvePacks(catalog, ['stack/a']);
    expect(result.packs).toHaveLength(1);
    expect(result.packs[0]?.document.version).toBe('2.0.0');
  });

  it('flags unknown requested refs', () => {
    const dir = makeTempDir();
    const catalog = [packFromYaml(dir, 'stack/a', validPackYaml('stack/a'))];
    const result = resolvePacks(catalog, ['stack/missing']);
    expect(result.ok).toBe(false);
    expect(result.diagnostics.some((d) => d.code === 'unknown-ref')).toBe(true);
  });

  it('flags missing requires inside the closure', () => {
    const dir = makeTempDir();
    const catalog = [
      packFromYaml(dir, 'stack/top', validPackYaml('stack/top') + '\nrequires:\n  - stack/ghost'),
    ];
    const result = resolvePacks(catalog, ['stack/top']);
    expect(result.diagnostics.some((d) => d.code === 'missing-requires')).toBe(true);
  });

  it('detects capability conflicts between distinct providers (actionable)', () => {
    const dir = makeTempDir();
    const catalog = [
      packFromYaml(
        dir,
        'conflicting/capability-a',
        validPackYaml('conflicting/capability-a', 'stack') + '\nprovides:\n  - stack.web',
      ),
      packFromYaml(
        dir,
        'conflicting/capability-b',
        validPackYaml('conflicting/capability-b', 'stack') + '\nprovides:\n  - stack.web',
      ),
    ];
    const result = resolvePacks(catalog, ['conflicting/capability-a', 'conflicting/capability-b']);
    const conflict = result.diagnostics.find((d) => d.code === 'capability-conflict');
    expect(conflict).toBeDefined();
    expect(conflict?.message).toContain('stack.web');
    expect(result.ok).toBe(false);
  });

  it('does NOT conflict when the same capability comes from identical content', () => {
    const dir = makeTempDir();
    const yaml = validPackYaml('stack/web', 'stack') + '\nprovides:\n  - stack.web';
    const catalog = [
      packFromYaml(dir, 'stack/web-a', yaml.replace('stack/web-a', 'stack/web-a')),
      packFromYaml(dir, 'stack/web-b', yaml.replace('stack/web-b', 'stack/web-b')),
    ];
    const result = resolvePacks(catalog, ['stack/web-a', 'stack/web-b']);
    expect(result.diagnostics.some((d) => d.code === 'capability-conflict')).toBe(false);
  });
});

describe('resolvePacks — cycle detection (fixture)', () => {
  it('reports a dependency cycle with actionable refs', () => {
    const dir = makeTempDir();
    const catalog = [
      packFromYaml(
        dir,
        'conflicting/cycle-a',
        validPackYaml('conflicting/cycle-a', 'workflow') + '\nrequires:\n  - conflicting/cycle-b',
      ),
      packFromYaml(
        dir,
        'conflicting/cycle-b',
        validPackYaml('conflicting/cycle-b', 'workflow') + '\nrequires:\n  - conflicting/cycle-a',
      ),
    ];
    const result = resolvePacks(catalog, ['conflicting/cycle-a']);
    const cycle = result.diagnostics.find((d) => d.code === 'cycle');
    expect(cycle).toBeDefined();
    expect(cycle?.message).toContain('cycle');
    expect(result.ok).toBe(false);
  });
});
