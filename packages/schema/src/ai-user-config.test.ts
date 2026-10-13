import { describe, expect, it } from 'vitest';
import * as schemaModule from './index.js';

type ParseResult = { success: boolean; data?: unknown; error?: unknown };
type ParseSchema = { safeParse(value: unknown): ParseResult };

function userConfigSchema(): ParseSchema {
  const schema = Reflect.get(schemaModule, 'AiUserConfigSchema') as ParseSchema | undefined;
  expect(schema, 'AiUserConfigSchema must be exported from @planmo/schema').toBeDefined();
  if (schema === undefined) throw new Error('AiUserConfigSchema is not exported');
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

describe('AiUserConfigSchema', () => {
  it('accepts a versioned user profile with only an opaque credential reference', () => {
    const result = userConfigSchema().safeParse(validConfig());

    expect(result.success).toBe(true);
    expect(result.data).toEqual(validConfig());
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
