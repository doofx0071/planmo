import { z } from 'zod';
import { NonEmptyString, SCHEMA_VERSION } from './common.js';

const Uuid = z.string().uuid();
const ProviderId = z.string().regex(/^[a-z][a-z0-9-]*$/);

const SafeBaseUrl = z
  .string()
  .url()
  .superRefine((value, context) => {
    const url = new URL(value);
    const loopback = ['localhost', '127.0.0.1', '::1', '[::1]'].includes(url.hostname);
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) {
      context.addIssue({
        code: 'custom',
        message: 'endpoint URL must use HTTPS (HTTP is allowed only for loopback hosts)',
      });
    }
    if (url.username !== '' || url.password !== '' || url.search !== '' || url.hash !== '') {
      context.addIssue({
        code: 'custom',
        message: 'endpoint URL must not contain userinfo, query parameters, or a fragment',
      });
    }
  });

/** Non-secret provider preferences; credentials live only in the OS keyring. */
export const AiProfileSchema = z.strictObject({
  /** Random opaque profile id; not a provider id or a credential. */
  id: Uuid,
  /** Runtime preset id; checked against @planmo/ai at use time. */
  providerId: ProviderId,
  modelId: NonEmptyString,
  /** Null for named presets; required for the generic custom endpoint. */
  baseUrl: SafeBaseUrl.nullable(),
  /** Opaque keyring account reference; null means environment-only auth. */
  credentialRef: Uuid.nullable(),
});
export type AiProfile = z.infer<typeof AiProfileSchema>;

/** Strict user-scoped config. No open extension map can hide a plaintext key. */
export const AiUserConfigSchema = z
  .strictObject({
    schemaVersion: z.literal(SCHEMA_VERSION),
    profiles: z.array(AiProfileSchema).max(32),
    defaultProfileId: Uuid.nullable(),
  })
  .superRefine((config, context) => {
    const profileIds = new Set<string>();
    for (const [index, profile] of config.profiles.entries()) {
      if (profileIds.has(profile.id)) {
        context.addIssue({
          code: 'custom',
          path: ['profiles', index, 'id'],
          message: 'profile ids must be unique',
        });
      }
      profileIds.add(profile.id);

      if (profile.providerId === 'custom' && profile.baseUrl === null) {
        context.addIssue({
          code: 'custom',
          path: ['profiles', index, 'baseUrl'],
          message: 'custom profiles require a base URL',
        });
      }
      if (profile.providerId !== 'custom' && profile.baseUrl !== null) {
        context.addIssue({
          code: 'custom',
          path: ['profiles', index, 'baseUrl'],
          message: 'named provider profiles must not override their preset base URL',
        });
      }
    }

    if (config.defaultProfileId !== null && !profileIds.has(config.defaultProfileId)) {
      context.addIssue({
        code: 'custom',
        path: ['defaultProfileId'],
        message: 'defaultProfileId must reference an existing profile',
      });
    }
  });
export type AiUserConfig = z.infer<typeof AiUserConfigSchema>;
