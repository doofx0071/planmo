/**
 * Provider presets — the declared table of gateways and vendors PlanMo can talk
 * to, plus the rules that pick one.
 *
 * This is the `agent-targets.ts` pattern applied to model providers: one row per
 * provider, so adding a vendor is a data change rather than an architecture
 * change. Each row records the official documentation it was read from, and
 * `providers.test.ts` pins the values — a drift shows up as a failing test.
 *
 * A preset carries NO credential value. It records the NAME of the environment
 * variable a credential would come from (`credentialEnv`) and the wire protocol
 * (`wireFormat`); credentials are read by callers from an injected `env` or
 * `process.env`, by name, and are never stored here. A separate, explicit
 * `modelList` capability records the provider's verified discovery contract; it
 * is never derived from the inference `baseUrl`.
 */

/** The two request/response shapes a provider can speak. */
export type WireFormat = 'openai' | 'anthropic';

export type ModelListAuth =
  | Readonly<{ type: 'bearer' }>
  | Readonly<{
      type: 'header';
      credentialHeader: 'x-api-key';
      headers: Readonly<{ 'anthropic-version': '2023-06-01' }>;
    }>;

export type ModelListResponse =
  | Readonly<{
      collection: 'data';
      idField: 'id';
      /** Declared response continuation marker; reported but never followed. */
      continuationLink?: 'links.next';
    }>
  | Readonly<{
      collection: 'models';
      idField: 'id';
      outputModalitiesField: 'output_modalities';
      includesOutputModality: 'text';
    }>;

export type ModelListPagination =
  | Readonly<{ type: 'none' }>
  | Readonly<{ type: 'anthropic-cursor'; limit: number; maxPages: number }>;

/** Verified endpoint contract for listing provider-reported model identifiers. */
export interface ModelListCapability {
  /** Exact official list URL; never inferred from `baseUrl`. */
  readonly endpoint: string;
  readonly method: 'GET';
  readonly auth: ModelListAuth;
  readonly response: ModelListResponse;
  readonly pagination: ModelListPagination;
}

export interface ProviderPreset {
  /** Stable id used on the command line and in `resolveProvider({ preset })`. */
  readonly id: string;
  /** Human-readable name for the picker. */
  readonly label: string;
  /**
   * API root the provider appends its path to (`/chat/completions` for `openai`,
   * `/messages` for `anthropic`). Empty for `custom`, which requires an override.
   */
  readonly baseUrl: string;
  /** Which wire protocol the endpoint speaks. */
  readonly wireFormat: WireFormat;
  /** NAME of the environment variable holding the credential. Never the value. */
  readonly credentialEnv: string;
  /** Official documentation this row was verified against. */
  readonly docs: string;
  /** Explicit list-endpoint contract, or null when manual entry is required. */
  readonly modelList: ModelListCapability | null;
}

/** Freeze trusted provider metadata at runtime, including every nested object. */
function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (typeof value !== 'object' || value === null || seen.has(value)) return value;
  seen.add(value);
  for (const nested of Object.values(value)) deepFreeze(nested, seen);
  Object.freeze(value);
  return value;
}

/**
 * Every supported provider, in deterministic order.
 *
 * Order matters for env-based detection (`resolveProvider` picks the first row
 * whose credential is present), so specific gateways come first and the generic
 * `custom` row is last.
 */
export const PROVIDER_PRESETS: readonly ProviderPreset[] = deepFreeze([
  {
    id: 'tokenharbor',
    label: 'Token Harbor',
    baseUrl: 'https://tokenharbor.ai/v1',
    wireFormat: 'openai',
    credentialEnv: 'TOKENHARBOR_KEY',
    docs: 'https://tokenharbor.ai/docs',
    modelList: {
      endpoint: 'https://tokenharbor.ai/v1/models',
      method: 'GET',
      auth: { type: 'bearer' },
      response: { collection: 'data', idField: 'id' },
      pagination: { type: 'none' },
    },
  },
  {
    id: 'openai',
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    wireFormat: 'openai',
    credentialEnv: 'OPENAI_API_KEY',
    docs: 'https://platform.openai.com/docs/api-reference/chat',
    modelList: {
      endpoint: 'https://api.openai.com/v1/models',
      method: 'GET',
      auth: { type: 'bearer' },
      response: { collection: 'data', idField: 'id' },
      pagination: { type: 'none' },
    },
  },
  {
    id: 'anthropic',
    label: 'Anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    wireFormat: 'anthropic',
    credentialEnv: 'ANTHROPIC_API_KEY',
    docs: 'https://docs.anthropic.com/en/api/messages',
    modelList: {
      endpoint: 'https://api.anthropic.com/v1/models',
      method: 'GET',
      auth: {
        type: 'header',
        credentialHeader: 'x-api-key',
        headers: { 'anthropic-version': '2023-06-01' },
      },
      response: { collection: 'data', idField: 'id' },
      pagination: { type: 'anthropic-cursor', limit: 100, maxPages: 5 },
    },
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    wireFormat: 'openai',
    credentialEnv: 'DEEPSEEK_API_KEY',
    docs: 'https://api-docs.deepseek.com/',
    modelList: {
      endpoint: 'https://api.deepseek.com/models',
      method: 'GET',
      auth: { type: 'bearer' },
      response: { collection: 'data', idField: 'id' },
      pagination: { type: 'none' },
    },
  },
  {
    id: 'moonshot',
    label: 'Moonshot (Kimi)',
    baseUrl: 'https://api.moonshot.ai/v1',
    wireFormat: 'openai',
    credentialEnv: 'MOONSHOT_API_KEY',
    docs: 'https://platform.moonshot.ai/docs',
    modelList: {
      endpoint: 'https://api.moonshot.ai/v1/models',
      method: 'GET',
      auth: { type: 'bearer' },
      response: { collection: 'data', idField: 'id' },
      pagination: { type: 'none' },
    },
  },
  {
    id: 'xai',
    label: 'xAI (Grok)',
    baseUrl: 'https://api.x.ai/v1',
    wireFormat: 'openai',
    credentialEnv: 'XAI_API_KEY',
    docs: 'https://docs.x.ai/docs/overview',
    modelList: {
      endpoint: 'https://api.x.ai/v1/language-models',
      method: 'GET',
      auth: { type: 'bearer' },
      response: {
        collection: 'models',
        idField: 'id',
        outputModalitiesField: 'output_modalities',
        includesOutputModality: 'text',
      },
      pagination: { type: 'none' },
    },
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    wireFormat: 'openai',
    credentialEnv: 'OPENROUTER_API_KEY',
    docs: 'https://openrouter.ai/docs',
    modelList: {
      endpoint: 'https://openrouter.ai/api/v1/models?limit=500',
      method: 'GET',
      auth: { type: 'bearer' },
      response: { collection: 'data', idField: 'id', continuationLink: 'links.next' },
      pagination: { type: 'none' },
    },
  },
  {
    // OpenCode Console (pay-as-you-go). It is a multi-protocol gateway: its docs
    // route each model to `/chat/completions`, `/responses` or `/messages`. This
    // preset declares the OpenAI Chat Completions route only, so it reaches the
    // models OpenCode publishes as OpenAI-compatible and not the `/responses` or
    // Anthropic-Messages ones. The list endpoint was verified live: 200 with
    // `{"object":"list","data":[{"id":…}]}`, and 401 under an invalid bearer key.
    id: 'opencode',
    label: 'OpenCode Console',
    baseUrl: 'https://opencode.ai/inference/v1',
    wireFormat: 'openai',
    credentialEnv: 'OPENCODE_API_KEY',
    docs: 'https://opencode.ai/v2/docs/console/models/',
    modelList: {
      endpoint: 'https://opencode.ai/inference/v1/models',
      method: 'GET',
      auth: { type: 'bearer' },
      response: { collection: 'data', idField: 'id' },
      pagination: { type: 'none' },
    },
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
    modelList: null,
  },
]);

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
