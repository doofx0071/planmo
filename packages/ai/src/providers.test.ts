import { describe, expect, it } from 'vitest';
import {
  PROVIDER_PRESETS,
  describeProviders,
  providerPreset,
  resolveProvider,
} from './providers.js';

/**
 * The provider table is a declared, tested spec: one row per vendor or gateway,
 * each recording the credential ENV VAR NAME and the wire protocol it speaks.
 * The formats are third-party, so they are pinned here — a drift shows up as a
 * failing test rather than a silently broken request. No credential value ever
 * appears in a row.
 */
const REQUIRED_IDS = [
  'tokenharbor',
  'openai',
  'anthropic',
  'deepseek',
  'moonshot',
  'xai',
  'openrouter',
  'custom',
] as const;

describe('provider presets', () => {
  it('covers every provider PlanMo advertises, with no duplicate ids', () => {
    const ids = PROVIDER_PRESETS.map((preset) => preset.id);
    for (const id of REQUIRED_IDS) expect(ids, id).toContain(id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives every row a label, base URL, credential env name and wire format', () => {
    for (const preset of PROVIDER_PRESETS) {
      expect(preset.label.length, preset.id).toBeGreaterThan(0);
      expect(typeof preset.baseUrl, preset.id).toBe('string');
      expect(preset.credentialEnv, preset.id).toMatch(/^[A-Z][A-Z0-9_]*$/);
      expect(['openai', 'anthropic'], preset.id).toContain(preset.wireFormat);
    }
  });

  it('records the official documentation each row was verified against', () => {
    for (const preset of PROVIDER_PRESETS) {
      expect(preset.docs, preset.id).toMatch(/^https:\/\/.+/);
    }
  });

  it('gives every real provider an https base URL, and keeps custom override-only', () => {
    for (const preset of PROVIDER_PRESETS) {
      if (preset.id === 'custom') {
        // No default endpoint: the caller must supply one.
        expect(preset.baseUrl).toBe('');
        expect(preset.credentialEnv).toBe('PLANMO_AI_API_KEY');
      } else {
        expect(preset.baseUrl, preset.id).toMatch(/^https:\/\/.+/);
      }
    }
  });

  it('spells the documented wire format and endpoint per provider', () => {
    expect(providerPreset('anthropic')).toMatchObject({
      wireFormat: 'anthropic',
      baseUrl: 'https://api.anthropic.com/v1',
      credentialEnv: 'ANTHROPIC_API_KEY',
    });
    expect(providerPreset('tokenharbor')).toMatchObject({
      wireFormat: 'openai',
      baseUrl: 'https://tokenharbor.ai/v1',
      credentialEnv: 'TOKENHARBOR_KEY',
    });
    expect(providerPreset('openai')).toMatchObject({
      baseUrl: 'https://api.openai.com/v1',
      credentialEnv: 'OPENAI_API_KEY',
    });
  });

  it('looks up a preset by id and returns undefined for an unknown id', () => {
    expect(providerPreset('openai')?.id).toBe('openai');
    expect(providerPreset('nope')).toBeUndefined();
  });
});

describe('resolveProvider', () => {
  it('uses an explicit preset and threads the model through', () => {
    const result = resolveProvider({
      preset: 'tokenharbor',
      model: 'deepseek/deepseek-v4-flash',
      env: { TOKENHARBOR_KEY: 'thk_test' },
    });
    expect(result.configured).toBe(true);
    if (!result.configured) return;
    expect(result.preset.id).toBe('tokenharbor');
    expect(result.model).toBe('deepseek/deepseek-v4-flash');
    expect(result.baseUrl).toBe('https://tokenharbor.ai/v1');
    expect(result.wireFormat).toBe('openai');
  });

  it('lets an explicit base URL override the preset default', () => {
    const result = resolveProvider({
      preset: 'custom',
      baseUrl: 'https://gateway.internal/v1',
      env: { PLANMO_AI_API_KEY: 'k' },
    });
    expect(result.configured).toBe(true);
    if (!result.configured) return;
    expect(result.baseUrl).toBe('https://gateway.internal/v1');
    expect(result.preset.id).toBe('custom');
  });

  it('detects the first preset whose credential is present in env', () => {
    const result = resolveProvider({ env: { DEEPSEEK_API_KEY: 'sk-d' } });
    expect(result.configured).toBe(true);
    if (!result.configured) return;
    expect(result.preset.id).toBe('deepseek');
  });

  it('prefers an earlier preset when several credentials are present', () => {
    const result = resolveProvider({ env: { OPENAI_API_KEY: 'a', TOKENHARBOR_KEY: 'b' } });
    expect(result.configured).toBe(true);
    if (!result.configured) return;
    expect(result.preset.id).toBe('tokenharbor');
  });

  it('refuses custom with no base URL instead of returning an unusable provider', () => {
    // `custom` deliberately ships no default endpoint, so a present key with no URL
    // is not a usable provider. Reporting configured:true would hand the caller a
    // blank base URL and an opaque request failure.
    const result = resolveProvider({ preset: 'custom', env: { PLANMO_AI_API_KEY: 'k' } });
    expect(result.configured).toBe(false);
    expect(result.configured === false ? result.reason : undefined).toBe('missing-base-url');

    // Supplying the URL makes it usable — the override is what makes custom work.
    const withUrl = resolveProvider({
      preset: 'custom',
      baseUrl: 'https://gateway.internal/v1',
      env: { PLANMO_AI_API_KEY: 'k' },
    });
    expect(withUrl.configured).toBe(true);
  });

  it('never returns a provider whose credential is missing', () => {
    for (const preset of PROVIDER_PRESETS) {
      const result = resolveProvider({ preset: preset.id, env: {} });
      expect(result.configured, preset.id).toBe(false);
      if (result.configured) continue;
      expect(result.reason, preset.id).toBe('missing-credential');
    }
  });

  it('treats a blank credential as absent', () => {
    const result = resolveProvider({ preset: 'openai', env: { OPENAI_API_KEY: '   ' } });
    expect(result.configured).toBe(false);
    if (result.configured) return;
    expect(result.reason).toBe('missing-credential');
  });

  it('reports none-configured when no credential is present, or the preset is unknown', () => {
    expect(resolveProvider({ env: {} })).toEqual({ configured: false, reason: 'none-configured' });
    expect(resolveProvider({ preset: 'does-not-exist', env: { OPENAI_API_KEY: 'a' } })).toEqual({
      configured: false,
      reason: 'none-configured',
    });
  });

  it('reads only the named credential, never an unrelated key', () => {
    // A value under a different name is ignored; only `credentialEnv` counts.
    const result = resolveProvider({ env: { CODEX_HOME: 'x', OPENAI_API_KEY: 'a' } });
    expect(result.configured).toBe(true);
    if (!result.configured) return;
    expect(result.preset.id).toBe('openai');
  });
});

describe('describeProviders', () => {
  it('reports credential presence and marks the single selected row', () => {
    const rows = describeProviders({ OPENAI_API_KEY: 'a' });
    const byId = new Map(rows.map((row) => [row.id, row]));
    expect(byId.get('openai')).toMatchObject({ credentialPresent: true, selected: true });
    expect(byId.get('anthropic')).toMatchObject({ credentialPresent: false, selected: false });
    expect(rows.filter((row) => row.selected)).toHaveLength(1);
  });

  it('selects nothing when no credential is present', () => {
    const rows = describeProviders({});
    expect(rows.every((row) => !row.credentialPresent)).toBe(true);
    expect(rows.every((row) => !row.selected)).toBe(true);
  });

  it('describes every preset and leaks no credential value', () => {
    const rows = describeProviders({ OPENAI_API_KEY: 'super-secret-value' });
    expect(rows).toHaveLength(PROVIDER_PRESETS.length);
    expect(JSON.stringify(rows)).not.toContain('super-secret-value');
  });
});
