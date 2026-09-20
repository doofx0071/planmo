import { describe, expect, it } from 'vitest';
import { RegistryItemSchema } from '@planmo/schema';
import { shadcnRegistryAdapter } from './shadcn.js';
import type { RegistryResolveInputWithReview } from './shadcn.js';

const OFFICIAL_BASE = 'https://ui.shadcn.com/r';
const OFFICIAL_PATH = 'styles/new-york/button.json';

describe('shadcnRegistryAdapter.resolve', () => {
  it('builds id/name/url and honors explicit requiresReview=false for official', () => {
    const input: RegistryResolveInputWithReview = {
      baseUrl: OFFICIAL_BASE,
      itemPath: OFFICIAL_PATH,
      trust: 'official',
      requiresReview: false,
    };
    const result = shadcnRegistryAdapter.resolve(input);
    expect(result.requiresReview).toBe(false);
    expect(result.item).toMatchObject({
      id: 'ui.shadcn.com/styles',
      name: 'button',
      url: 'https://ui.shadcn.com/r/styles/new-york/button.json',
      trust: 'official',
      requiresReview: false,
    });
    expect(result.note).toBe('official registry: ui.shadcn.com/styles — review not required');
    expect(RegistryItemSchema.safeParse(result.item).success).toBe(true);
  });

  it('forces requiresReview=true for community/untrusted and schema accepts the item', () => {
    for (const trust of ['community', 'untrusted'] as const) {
      const input: RegistryResolveInputWithReview = {
        baseUrl: 'https://registry.example.com/r',
        itemPath: 'themes/retro/button.json',
        trust,
        requiresReview: false,
      };
      const result = shadcnRegistryAdapter.resolve(input);
      expect(result.requiresReview).toBe(true);
      expect(result.item.requiresReview).toBe(true);
      expect(RegistryItemSchema.safeParse(result.item).success).toBe(true);
      expect(result.note).toBe(
        'community registry: registry.example.com/themes — explicit review required',
      );
    }
  });

  it('defaults requiresReview to true even for official when no flag is given', () => {
    const input: RegistryResolveInputWithReview = {
      baseUrl: OFFICIAL_BASE,
      itemPath: OFFICIAL_PATH,
      trust: 'official',
    };
    const result = shadcnRegistryAdapter.resolve(input);
    expect(result.requiresReview).toBe(true);
    expect(result.item.requiresReview).toBe(true);
    expect(result.note).toBe('official registry: ui.shadcn.com/styles — review required');
  });

  it('rejects file:// and malformed base URLs', () => {
    const fileInput: RegistryResolveInputWithReview = {
      baseUrl: 'file:///c:/registry',
      itemPath: OFFICIAL_PATH,
      trust: 'official',
    };
    expect(() => shadcnRegistryAdapter.resolve(fileInput)).toThrow();
    const noHostInput: RegistryResolveInputWithReview = {
      baseUrl: 'https://',
      itemPath: OFFICIAL_PATH,
      trust: 'official',
    };
    expect(() => shadcnRegistryAdapter.resolve(noHostInput)).toThrow();
  });

  it('rejects file:// item paths', () => {
    const input: RegistryResolveInputWithReview = {
      baseUrl: OFFICIAL_BASE,
      itemPath: 'file:///styles/button.json',
      trust: 'official',
    };
    expect(() => shadcnRegistryAdapter.resolve(input)).toThrow();
  });

  it('rejects malformed item paths (empty, no slash, empty name)', () => {
    const emptyPath: RegistryResolveInputWithReview = {
      baseUrl: OFFICIAL_BASE,
      itemPath: '',
      trust: 'official',
    };
    expect(() => shadcnRegistryAdapter.resolve(emptyPath)).toThrow();
    const noSlashPath: RegistryResolveInputWithReview = {
      baseUrl: OFFICIAL_BASE,
      itemPath: 'button.json',
      trust: 'official',
    };
    expect(() => shadcnRegistryAdapter.resolve(noSlashPath)).toThrow();
    const emptyNamePath: RegistryResolveInputWithReview = {
      baseUrl: OFFICIAL_BASE,
      itemPath: 'styles/new-york/',
      trust: 'official',
    };
    expect(() => shadcnRegistryAdapter.resolve(emptyNamePath)).toThrow();
  });

  it('passes integrity and version through and schema still accepts the item', () => {
    const input: RegistryResolveInputWithReview = {
      baseUrl: OFFICIAL_BASE,
      itemPath: OFFICIAL_PATH,
      trust: 'official',
      version: '2.5.0',
      integrity: 'sha256:AB12CD34EF56',
      requiresReview: false,
    };
    const result = shadcnRegistryAdapter.resolve(input);
    expect(result.item.version).toBe('2.5.0');
    expect(result.item.integrity).toBe('sha256:AB12CD34EF56');
    expect(RegistryItemSchema.safeParse(result.item).success).toBe(true);
  });

  it('is deterministic: same input → identical JSON for the item', () => {
    const input: RegistryResolveInputWithReview = {
      baseUrl: OFFICIAL_BASE,
      itemPath: OFFICIAL_PATH,
      trust: 'official',
      version: '1.0.0',
      integrity: 'sha256:DEADBEEF',
      requiresReview: false,
    };
    const first = shadcnRegistryAdapter.resolve(input);
    const second = shadcnRegistryAdapter.resolve(input);
    expect(JSON.stringify(first.item)).toBe(JSON.stringify(second.item));
    expect(first.note).toBe(second.note);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });
});
