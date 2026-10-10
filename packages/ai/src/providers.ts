/**
 * Provider presets — the declared table of gateways and vendors PlanMo can talk
 * to, plus the rules that pick one.
 *
 * This is the `agent-targets.ts` pattern applied to model providers: one row per
 * provider, so adding a vendor is a data change rather than an architecture
 * change. Each row records the official documentation it was read from, and
 * `providers.test.ts` pins the values — a drift shows up as a failing test.
 *
 * A preset carries NO credential value and NO model list. It records the NAME of
 * the environment variable a credential would come from (`credentialEnv`) and the
 * wire protocol (`wireFormat`); the credential itself is read by the caller from
 * an injected `env` or `process.env`, by name, and is never stored here. A
 * gateway like Token Harbor exposes one key across many vendors and addresses
 * models as `provider/model` slugs (e.g. `deepseek/deepseek-v4-flash`), so the
 * model is a request-time argument, not a preset field.
 */

/** The two request/response shapes a provider can speak. */
export type WireFormat = 'openai' | 'anthropic';

export interface ProviderPreset {
  /** Stable id used on the command line and in `resolveProvider({ preset })`. */
  id: string;
  /** Human-readable name for the picker. */
  label: string;
  /**
   * API root the provider appends its path to (`/chat/completions` for `openai`,
   * `/messages` for `anthropic`). Empty for `custom`, which requires an override.
   */
  baseUrl: string;
  /** Which wire protocol the endpoint speaks. */
  wireFormat: WireFormat;
  /** NAME of the environment variable holding the credential. Never the value. */
  credentialEnv: string;
  /** Official documentation this row was verified against. */
  docs: string;
}

/**
 * Every supported provider, in deterministic order.
 *
 * Order matters for env-based detection (`resolveProvider` picks the first row
 * whose credential is present), so specific gateways come first and the generic
 * `custom` row is last.
 */
export const PROVIDER_PRESETS: readonly ProviderPreset[] = [
  {
    id: 'tokenharbor',
    label: 'Token Harbor',
    baseUrl: 'https://tokenharbor.ai/v1',
    wireFormat: 'openai',
    credentialEnv: 'TOKENHARBOR_KEY',
    docs: 'https://tokenharbor.ai/docs',
  },
  {
    id: 'openai',
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    wireFormat: 'openai',
    credentialEnv: 'OPENAI_API_KEY',
    docs: 'https://platform.openai.com/docs/api-reference/chat',
  },
  {
    id: 'anthropic',
    label: 'Anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    wireFormat: 'anthropic',
    credentialEnv: 'ANTHROPIC_API_KEY',
    docs: 'https://docs.anthropic.com/en/api/messages',
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    wireFormat: 'openai',
    credentialEnv: 'DEEPSEEK_API_KEY',
    docs: 'https://api-docs.deepseek.com/',
  },
  {
    id: 'moonshot',
    label: 'Moonshot (Kimi)',
    baseUrl: 'https://api.moonshot.ai/v1',
    wireFormat: 'openai',
    credentialEnv: 'MOONSHOT_API_KEY',
    docs: 'https://platform.moonshot.ai/docs',
  },
  {
    id: 'xai',
    label: 'xAI (Grok)',
    baseUrl: 'https://api.x.ai/v1',
    wireFormat: 'openai',
    credentialEnv: 'XAI_API_KEY',
    docs: 'https://docs.x.ai/docs/overview',
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    wireFormat: 'openai',
    credentialEnv: 'OPENROUTER_API_KEY',
    docs: 'https://openrouter.ai/docs',
  },
  {
    // Any OpenAI-compatible endpoint (self-hosted, a private gateway, or a vendor
    // not listed above). It has NO default base URL — supply one with
    // `resolveProvider({ preset: 'custom', baseUrl })`. Its credential name is
    // PlanMo's own, distinct from any vendor's, so it can never be confused with
    // a vendor key.
    id: 'custom',
    label: 'Custom (OpenAI-compatible)',
    baseUrl: '',
    wireFormat: 'openai',
    credentialEnv: 'PLANMO_AI_API_KEY',
    docs: 'https://platform.openai.com/docs/api-reference/chat',
  },
];

/** Look up a preset by id; undefined when the id is unknown. */
export function providerPreset(id: string): ProviderPreset | undefined {
  return PROVIDER_PRESETS.find((preset) => preset.id === id);
}

/** The credential environment `resolveProvider` reads from when none is injected. */
export type ProviderEnv = Record<string, string | undefined>;

/**
 * True when `name` holds a non-empty, non-blank value in `env`. A whitespace-only
 * value counts as absent, matching the HTTP provider, which rejects a blank key.
 */
function credentialPresent(env: ProviderEnv, name: string): boolean {
  const value = env[name];
  return typeof value === 'string' && value.trim() !== '';
}

export interface ResolveProviderInput {
  /** Preset id to force (e.g. `tokenharbor`). Overrides env detection. */
  preset?: string;
  /** Model slug to send, e.g. `deepseek/deepseek-v4-flash`. */
  model?: string;
  /** Base URL override; wins over the preset default. */
  baseUrl?: string;
  /** Credential environment; defaults to `process.env`. */
  env?: ProviderEnv;
}

/**
 * The outcome of `resolveProvider`.
 *
 * `configured: true` is returned ONLY when the chosen preset's credential is
 * present in the environment. A missing credential yields `configured: false`
 * with `reason: 'missing-credential'`; nothing resolvable yields
 * `reason: 'none-configured'`. `resolveProvider` never throws and never invents
 * a default credential.
 */
export type ProviderResolution =
  | {
      configured: true;
      preset: ProviderPreset;
      /** Effective base URL: explicit override, else the preset default. */
      baseUrl: string;
      wireFormat: WireFormat;
      /** Model slug, or undefined when the caller supplied none. */
      model: string | undefined;
    }
  | {
      configured: false;
      /** Why nothing was resolved. */
      reason: 'missing-credential' | 'none-configured' | 'missing-base-url';
      /** The preset that was chosen when only its credential was missing. */
      preset?: ProviderPreset;
    };

/**
 * Pick a provider using this precedence:
 *   1. an explicit `preset` (its credential must still be present);
 *   2. else the first preset whose `credentialEnv` is present in `env`;
 *   3. else nothing — `{ configured: false, reason: 'none-configured' }`.
 *
 * An explicit `baseUrl` overrides the preset default; an explicit `model` is
 * threaded through. Never throws, and never returns a preset whose credential is
 * missing.
 */
export function resolveProvider(input: ResolveProviderInput = {}): ProviderResolution {
  const env: ProviderEnv = input.env ?? process.env;

  let preset: ProviderPreset | undefined;
  if (input.preset !== undefined) {
    preset = providerPreset(input.preset);
    if (preset === undefined) {
      return { configured: false, reason: 'none-configured' };
    }
    if (!credentialPresent(env, preset.credentialEnv)) {
      return { configured: false, reason: 'missing-credential', preset };
    }
  } else {
    preset = PROVIDER_PRESETS.find((candidate) => credentialPresent(env, candidate.credentialEnv));
    if (preset === undefined) {
      return { configured: false, reason: 'none-configured' };
    }
  }

  const baseUrl = input.baseUrl ?? preset.baseUrl;
  // `custom` deliberately ships no default endpoint, so it is only usable with an
  // explicit `baseUrl`. Reporting `configured: true` with a blank URL would send
  // the caller into a malformed request and an opaque failure; name the real
  // problem instead.
  if (baseUrl.trim() === '') {
    return { configured: false, reason: 'missing-base-url', preset };
  }

  return {
    configured: true,
    preset,
    baseUrl,
    wireFormat: preset.wireFormat,
    model: input.model,
  };
}

/** One row for rendering the provider picker. */
export interface ProviderDescription {
  id: string;
  label: string;
  wireFormat: WireFormat;
  credentialEnv: string;
  /** True when `credentialEnv` holds a value in `env`. */
  credentialPresent: boolean;
  /** True for the row `resolveProvider` would select from `env`. */
  selected: boolean;
}

/**
 * Describe every preset for rendering. Pure: it reads only `env` and returns no
 * credential value. `selected` marks the single row env detection would choose
 * (none when nothing is configured). It writes nothing — the caller owns the
 * presentation.
 */
export function describeProviders(env: ProviderEnv = process.env): ProviderDescription[] {
  const resolution = resolveProvider({ env });
  const selectedId = resolution.configured ? resolution.preset.id : undefined;
  return PROVIDER_PRESETS.map((preset) => ({
    id: preset.id,
    label: preset.label,
    wireFormat: preset.wireFormat,
    credentialEnv: preset.credentialEnv,
    credentialPresent: credentialPresent(env, preset.credentialEnv),
    selected: preset.id === selectedId,
  }));
}
