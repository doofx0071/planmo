import { z } from 'zod';
import { NonEmptyString, SCHEMA_VERSION } from './common.js';

const canonicalUuidIdentity = (value: string): string => value.toLowerCase();
const Uuid = z.string().uuid().transform(canonicalUuidIdentity);
const ProviderId = z.string().regex(/^[a-z][a-z0-9-]*$/);
const ModelId = z
  .string()
  .refine((value) => !/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u.test(value), {
    message: 'model id must not contain control, format, or line separator characters',
  })
  .pipe(NonEmptyString)
  .refine((value) => !value.startsWith('--'), {
    message: 'model id must not begin with an option prefix',
  });

export const AiEndpointUrlSchema = z.string().superRefine((value, context) => {
  if (value.includes(String.fromCharCode(92))) {
    context.addIssue({
      code: 'custom',
      message: 'endpoint URL must not contain raw backslashes',
    });
    return;
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    context.addIssue({
      code: 'custom',
      message: 'endpoint URL must be a valid URL',
    });
    return;
  }

  const loopback = ['localhost', '127.0.0.1', '::1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) {
    context.addIssue({
      code: 'custom',
      message: 'endpoint URL must use HTTPS (HTTP is allowed only for loopback hosts)',
    });
  }
  const authority = value.trim().match(/^[a-z][a-z0-9+.-]*:\/\/([^/?#]*)/i)?.[1];
  const hasUserinfoDelimiter = authority?.includes('@') ?? false;
  const hasQueryOrFragmentDelimiter = /[?#]/.test(value);
  if (
    url.username !== '' ||
    url.password !== '' ||
    hasUserinfoDelimiter ||
    hasQueryOrFragmentDelimiter ||
    url.search !== '' ||
    url.hash !== ''
  ) {
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
  modelId: ModelId,
  /** Null for named presets; required for the generic custom endpoint. */
  baseUrl: AiEndpointUrlSchema.nullable(),
  /** Opaque keyring account reference; null means environment-only auth. */
  credentialRef: Uuid.nullable(),
});
export type AiProfile = z.infer<typeof AiProfileSchema>;

/** Strict user-scoped config. No open extension map can hide a plaintext key. */
export const AiUserConfigSchema = z
  .strictObject({
    schemaVersion: z.literal(SCHEMA_VERSION),
    profiles: z.array(AiProfileSchema),
    defaultProfileId: Uuid.nullable(),
  })
  .superRefine((config, context) => {
    const profileIds = new Set<string>();
    const credentialRefs = new Set<string>();
    for (const [index, profile] of config.profiles.entries()) {
      const profileId = canonicalUuidIdentity(profile.id);
      if (profileIds.has(profileId)) {
        context.addIssue({
          code: 'custom',
          path: ['profiles', index, 'id'],
          message: 'profile ids must be unique',
        });
      }
      profileIds.add(profileId);

      if (profile.credentialRef !== null) {
        const credentialRef = canonicalUuidIdentity(profile.credentialRef);
        if (credentialRefs.has(credentialRef)) {
          context.addIssue({
            code: 'custom',
            path: ['profiles', index, 'credentialRef'],
            message: 'credential references must be unique',
          });
        }
        credentialRefs.add(credentialRef);
      }

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

    if (
      config.defaultProfileId !== null &&
      !profileIds.has(canonicalUuidIdentity(config.defaultProfileId))
    ) {
      context.addIssue({
        code: 'custom',
        path: ['defaultProfileId'],
        message: 'defaultProfileId must reference an existing profile',
      });
    }
  });
export type AiUserConfig = z.infer<typeof AiUserConfigSchema>;
