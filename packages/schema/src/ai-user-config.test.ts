import { describe, expect, it, vi } from 'vitest';
import * as schemaModule from './index.js';

type ParseResult = { success: boolean; data?: unknown; error?: unknown };
type ParseSchema = { safeParse(value: unknown): ParseResult };

function userConfigSchema(): ParseSchema {
  const schema = Reflect.get(schemaModule, 'AiUserConfigSchema') as ParseSchema | undefined;
  expect(schema, 'AiUserConfigSchema must be exported from @planmo/schema').toBeDefined();
  if (schema === undefined) throw new Error('AiUserConfigSchema is not exported');
  return schema;
}

function endpointUrlSchema(): ParseSchema {
  const schema = Reflect.get(schemaModule, 'AiEndpointUrlSchema') as ParseSchema | undefined;
  expect(schema, 'AiEndpointUrlSchema must be exported from @planmo/schema').toBeDefined();
  if (schema === undefined) throw new Error('AiEndpointUrlSchema is not exported');
  return schema;
}

const PROFILE_ID = '4c87c4cb-6127-4a13-8ec9-0c8d138a2701';
const CREDENTIAL_REF = '2c26598f-60b9-49fb-83d0-632587691258';

function validConfig() {
  return {
    schemaVersion: 1,
    profiles: [
      {
        id: PROFILE_ID,
        providerId: 'openai',
        modelId: 'gpt-4.1',
        baseUrl: null,
        credentialRef: CREDENTIAL_REF,
      },
    ],
    defaultProfileId: PROFILE_ID,
  };
}

function customEndpointConfig(baseUrl: string) {
  return {
    ...validConfig(),
    profiles: [
      {
        ...validConfig().profiles[0],
        providerId: 'custom',
        baseUrl,
        credentialRef: null,
      },
    ],
  };
}

describe('AiEndpointUrlSchema', () => {
  it('exports the same strict URL rules used by saved profiles', () => {
    const schema = endpointUrlSchema();

    expect(schema.safeParse('https://api.example.test/v1').success).toBe(true);
    expect(schema.safeParse('http://localhost:4317/v1').success).toBe(true);
    expect(schema.safeParse('http://127.0.0.1:11434/v1').success).toBe(true);
    expect(schema.safeParse('http://[::1]:4317/v1').success).toBe(true);
    expect(schema.safeParse('http://api.example.test/v1').success).toBe(false);
    expect(schema.safeParse('https://user:secret@api.example.test/v1').success).toBe(false);
    expect(schema.safeParse('https://api.example.test/v1?token=synthetic').success).toBe(false);
    expect(schema.safeParse('https://api.example.test/v1#fragment').success).toBe(false);

    const backslash = String.fromCharCode(92);
    expect(schema.safeParse(`https:${backslash}/api.example.test/v1`).success).toBe(false);
  });
});

describe('AiUserConfigSchema', () => {
  it('accepts a versioned user profile with only an opaque credential reference', () => {
    const result = userConfigSchema().safeParse(validConfig());

    expect(result.success).toBe(true);
    expect(result.data).toEqual(validConfig());
  });

  it('rejects a named provider profile with a non-null base URL', () => {
    const config = {
      ...validConfig(),
      profiles: [{ ...validConfig().profiles[0], baseUrl: 'https://api.example.test/v1' }],
    };

    expect(userConfigSchema().safeParse(config).success).toBe(false);
  });

  it('rejects unknown keys and plaintext API-key fields', () => {
    const schema = userConfigSchema();
    const rootKey = { ...validConfig(), apiKey: 'synthetic-not-a-real-key' };
    const profileKey = {
      ...validConfig(),
      profiles: [{ ...validConfig().profiles[0], apiKey: 'synthetic-not-a-real-key' }],
    };

    expect(schema.safeParse(rootKey).success).toBe(false);
    expect(schema.safeParse(profileKey).success).toBe(false);
  });

  it('rejects a default profile id that does not exist', () => {
    const config = { ...validConfig(), defaultProfileId: 'd69cb393-b276-4c14-a077-8b5a34f5706d' };

    expect(userConfigSchema().safeParse(config).success).toBe(false);
  });

  it('resolves a case-varied default profile id to the same UUID identity', () => {
    const config = { ...validConfig(), defaultProfileId: PROFILE_ID.toUpperCase() };
    const result = userConfigSchema().safeParse(config);

    expect(result.success).toBe(true);
    expect(result.data).toEqual(validConfig());
  });

  it('canonicalizes uppercase UUIDs in parsed profile identity fields', () => {
    const config = {
      ...validConfig(),
      profiles: [
        {
          ...validConfig().profiles[0],
          id: PROFILE_ID.toUpperCase(),
          credentialRef: CREDENTIAL_REF.toUpperCase(),
        },
      ],
      defaultProfileId: PROFILE_ID.toUpperCase(),
    };
    const result = userConfigSchema().safeParse(config);

    expect(result.success).toBe(true);
    expect(result.data).toEqual(validConfig());
  });

  it('rejects duplicate profile UUIDs that differ only by case', () => {
    const profile = validConfig().profiles[0];
    const config = {
      ...validConfig(),
      profiles: [profile, { ...profile, id: PROFILE_ID.toUpperCase(), credentialRef: null }],
    };

    expect(userConfigSchema().safeParse(config).success).toBe(false);
  });

  it('rejects a credential reference shared by multiple profiles', () => {
    const profile = validConfig().profiles[0];
    const config = {
      ...validConfig(),
      profiles: [profile, { ...profile, id: 'd69cb393-b276-4c14-a077-8b5a34f5706d' }],
    };

    expect(userConfigSchema().safeParse(config).success).toBe(false);
  });

  it('allows multiple profiles without a credential reference', () => {
    const profile = { ...validConfig().profiles[0], credentialRef: null };
    const config = {
      ...validConfig(),
      profiles: [profile, { ...profile, id: 'd69cb393-b276-4c14-a077-8b5a34f5706d' }],
    };

    expect(userConfigSchema().safeParse(config).success).toBe(true);
  });

  it('accepts more than 32 distinct profiles', () => {
    const profiles = Array.from({ length: 33 }, (_, index) => ({
      ...validConfig().profiles[0],
      id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      credentialRef: null,
    }));
    const config = { ...validConfig(), profiles, defaultProfileId: null };

    expect(userConfigSchema().safeParse(config).success).toBe(true);
  });

  it('rejects custom endpoint query parameters', () => {
    const config = customEndpointConfig('https://api.example.test/v1?model=latest');

    expect(userConfigSchema().safeParse(config).success).toBe(false);
  });

  it('rejects an empty endpoint query delimiter', () => {
    const config = customEndpointConfig('https://api.example.test/v1?');

    expect(userConfigSchema().safeParse(config).success).toBe(false);
  });

  it('rejects custom endpoint fragments', () => {
    const config = customEndpointConfig('https://api.example.test/v1#models');

    expect(userConfigSchema().safeParse(config).success).toBe(false);
  });

  it('rejects an empty endpoint fragment delimiter', () => {
    const config = customEndpointConfig('https://api.example.test/v1#');

    expect(userConfigSchema().safeParse(config).success).toBe(false);
  });

  it('returns success false without throwing for a malformed custom URL', () => {
    const schema = userConfigSchema();
    let result: ParseResult | undefined;

    expect(() => {
      result = schema.safeParse(customEndpointConfig('https://%'));
    }).not.toThrow();
    expect(result?.success).toBe(false);
  });

  it('rejects non-loopback HTTP custom endpoints', () => {
    const config = customEndpointConfig('http://api.example.test/v1');

    expect(userConfigSchema().safeParse(config).success).toBe(false);
  });

  it('accepts loopback HTTP custom endpoints', () => {
    const config = customEndpointConfig('http://localhost:4317/v1');

    expect(userConfigSchema().safeParse(config).success).toBe(true);
  });

  it('rejects an empty userinfo delimiter in an endpoint authority', () => {
    const config = {
      ...validConfig(),
      profiles: [
        {
          ...validConfig().profiles[0],
          providerId: 'custom',
          baseUrl: 'https://@example.test/v1',
        },
      ],
    };

    expect(userConfigSchema().safeParse(config).success).toBe(false);
  });

  it('omits rejected endpoint userinfo secrets from error diagnostics', () => {
    const syntheticSecret = 'synthetic-url-secret-do-not-leak';
    const config = customEndpointConfig(
      `https://synthetic-user:${syntheticSecret}@example.test/v1`,
    );
    const result = userConfigSchema().safeParse(config);

    expect(result.success).toBe(false);
    const error = result.error as Error & { issues?: unknown };

    expect(error.message).not.toContain(syntheticSecret);
    expect(JSON.stringify(error.issues)).not.toContain(syntheticSecret);
  });

  it('rejects a single raw backslash before endpoint URL normalization', () => {
    const backslash = String.fromCharCode(92);
    const malformed = 'https:' + backslash + '@example.test/v1';
    const backslashCount = [...malformed].filter((character) => character === backslash).length;

    expect(backslashCount).toBe(1);
    expect(userConfigSchema().safeParse(customEndpointConfig(malformed)).success).toBe(false);
  });

  it('rejects a raw backslash before invoking URL parsers', () => {
    const backslash = String.fromCharCode(92);
    const malformed = 'https:' + backslash + '@example.test/v1';
    const backslashCount = [...malformed].filter((character) => character === backslash).length;
    const parserCalls = { construction: 0, canParse: 0 };
    const nativeURL = globalThis.URL;
    const instrumentedURL = new Proxy(nativeURL, {
      construct(target, argumentsList, newTarget) {
        parserCalls.construction += 1;
        return Reflect.construct(target, argumentsList, newTarget);
      },
      get(target, property, receiver) {
        if (property === 'canParse') {
          return (...args: Parameters<typeof URL.canParse>) => {
            parserCalls.canParse += 1;
            return Reflect.apply(target.canParse, target, args);
          };
        }
        return Reflect.get(target, property, receiver);
      },
    });

    vi.stubGlobal('URL', instrumentedURL);
    try {
      expect(backslashCount).toBe(1);
      expect(userConfigSchema().safeParse(customEndpointConfig(malformed)).success).toBe(false);
      expect(parserCalls).toEqual({ construction: 0, canParse: 0 });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('requires a URL only for custom endpoints and rejects endpoint userinfo', () => {
    const schema = userConfigSchema();
    const custom = {
      ...validConfig(),
      profiles: [
        {
          ...validConfig().profiles[0],
          providerId: 'custom',
          credentialRef: null,
        },
      ],
    };
    const withCredentialInUrl = {
      ...custom,
      profiles: [{ ...custom.profiles[0], baseUrl: 'https://user:secret@example.test/v1' }],
    };
    const safeCustom = {
      ...custom,
      profiles: [{ ...custom.profiles[0], baseUrl: 'https://api.example.test/v1' }],
    };

    expect(schema.safeParse(custom).success).toBe(false);
    expect(schema.safeParse(withCredentialInUrl).success).toBe(false);
    expect(schema.safeParse(safeCustom).success).toBe(true);
  });
});
