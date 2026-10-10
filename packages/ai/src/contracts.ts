/**
 * AI provider contracts (the first AI layer — additive, no vendor SDK).
 *
 * PlanMo has no AI dependency today; this package is the single, vendor-neutral
 * seam through which the rest of PlanMo may call a language model. Nothing here
 * imports a vendor client library: the HTTP provider talks to an
 * OpenAI-compatible `/chat/completions` endpoint with the platform `fetch`, and
 * a deterministic mock provider keeps tests and goldens offline and byte-stable.
 *
 * Product invariant (docs/06-agent-engine/ai-boundary.md): a direct provider
 * must request structured output and schema-validate it before it can drive
 * artifact generation. `ModelRequest.mode: 'structured'` + `schema` is that
 * contract; `ModelResponse.data` carries the validated payload.
 *
 * exactOptionalPropertyTypes is ON: omit optional fields, never set them to
 * `undefined`.
 */

/** What a provider can do. Callers branch on these instead of probing. */
export interface ModelCapabilities {
  /** Can return a schema-validated structured payload (`ModelRequest.schema`). */
  structuredOutput: boolean;
  /** Can stream partial output (not exercised by the v1 interface). */
  streaming: boolean;
  /** Can call tools/functions (not exercised by the v1 interface). */
  toolCalling: boolean;
}

/** Generation mode. `structured` requires `schema` and yields `data`. */
export type ModelMode = 'text' | 'structured';

/** One generation request. */
export interface ModelRequest {
  /** Optional system instruction (never executable configuration). */
  system?: string;
  /** The user prompt. */
  prompt: string;
  /** `text` returns free text; `structured` returns a schema-validated `data`. */
  mode: ModelMode;
  /** JSON Schema the `data` must satisfy (required when mode is `structured`). */
  schema?: unknown;
  /** Upper bound on generated tokens, when the provider supports it. */
  maxOutputTokens?: number;
  /** Per-request timeout override (ms). */
  timeoutMs?: number;
}

/** Token accounting for one response. Deterministic for the mock provider. */
export interface ModelUsage {
  inputTokens: number;
  outputTokens: number;
}

/** One generation result. */
export interface ModelResponse {
  /** Raw model text (for `structured` mode: the JSON the data was parsed from). */
  text: string;
  /** Validated structured payload; present only for `structured` mode. */
  data?: unknown;
  usage: ModelUsage;
  /** Model id that produced the response. */
  model: string;
  /** Id of the provider that produced the response. */
  providerId: string;
  /** True when no real model was called (the deterministic mock). */
  simulated: boolean;
}

/**
 * The single seam the rest of PlanMo programs against. Implementations are
 * interchangeable: a caller cannot tell the mock from the HTTP provider except
 * through `ModelResponse.simulated` and `capabilities`.
 */
export interface ModelProvider {
  readonly id: string;
  readonly model: string;
  readonly capabilities: ModelCapabilities;
  generate(request: ModelRequest, signal?: AbortSignal): Promise<ModelResponse>;
}

/**
 * Failure taxonomy. Every provider failure is a `ProviderError` carrying a
 * `kind` discriminator, so a caller branches on the failure MODE (retry?
 * prompt for a credential? reject the payload?) without matching a message
 * string.
 *
 * Retryable kinds are `transport` (a network failure or a 5xx) and `rate-limit`.
 * `timeout`, `auth`, `invalid-response` and `aborted` are never retried.
 */
export const PROVIDER_ERROR_KINDS = [
  'timeout',
  'rate-limit',
  'auth',
  'invalid-response',
  'transport',
  'aborted',
] as const;

export type ProviderErrorKind = (typeof PROVIDER_ERROR_KINDS)[number];

export interface ProviderErrorOptions {
  /** HTTP status code, when the failure came from a response. */
  status?: number;
  /** Underlying error, when any (never a secret). */
  cause?: unknown;
}

/** A typed provider failure. `kind` is the machine-readable discriminator. */
export class ProviderError extends Error {
  readonly kind: ProviderErrorKind;
  readonly status: number | undefined;

  constructor(kind: ProviderErrorKind, message: string, options: ProviderErrorOptions = {}) {
    super(message);
    this.name = 'ProviderError';
    this.kind = kind;
    this.status = options.status;
    if (options.cause !== undefined) {
      this.cause = options.cause;
    }
  }

  /** True when a retry could succeed: transport failures and rate limits. */
  get retryable(): boolean {
    return this.kind === 'transport' || this.kind === 'rate-limit';
  }
}

/** Type guard so callers can narrow an unknown throw to a `ProviderError`. */
export function isProviderError(value: unknown): value is ProviderError {
  return value instanceof ProviderError;
}
