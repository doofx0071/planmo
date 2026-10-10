/**
 * HTTP provider for two wire formats — OpenAI-compatible
 * (`POST {baseUrl}/chat/completions`) and Anthropic Messages
 * (`POST {baseUrl}/messages`). The default is OpenAI; select Anthropic with
 * `wireFormat: 'anthropic'`.
 *
 * Uses the platform `fetch` — no vendor SDK — so nothing in PlanMo depends on a
 * model vendor's client library. The API key is REQUIRED config; it is never
 * read from an environment variable implicitly, never logged, and never echoed
 * in an error message (response bodies are redacted before they reach a message).
 *
 * Reliability contract:
 * - `timeoutMs` bounds each attempt (default 30s); a caller `AbortSignal` also
 *   aborts the request and the retry backoff.
 * - Only retryable failures are retried — transport failures, rate limits (429)
 *   and 5xx server errors — with bounded exponential backoff. Auth (401/403),
 *   timeouts, aborts and invalid responses are never retried.
 * - Every non-2xx response is mapped to a typed `ProviderError.kind`.
 */

import { ProviderError } from './contracts.js';
import type {
  ModelCapabilities,
  ModelProvider,
  ModelRequest,
  ModelResponse,
  ModelUsage,
} from './contracts.js';
import type { WireFormat } from './providers.js';
import { validateAgainstSchema } from './structured.js';
import { isPlainObject } from './util.js';

export interface HttpProviderConfig {
  /** API root, e.g. `https://api.openai.com/v1` (the provider appends `/chat/completions`). */
  baseUrl: string;
  /** Bearer credential. Required; never read from the environment implicitly. */
  apiKey: string;
  /** Model id sent in the request body. */
  model: string;
  /**
   * Wire protocol. Default `'openai'` (`POST {baseUrl}/chat/completions`).
   * `'anthropic'` speaks the Messages API (`POST {baseUrl}/messages`).
   */
  wireFormat?: WireFormat;
  /** Anthropic API version header. Default `'2023-06-01'`. Ignored by `openai`. */
  anthropicVersion?: string;
  /** Per-attempt timeout in ms. Default 30000. */
  timeoutMs?: number;
  /** Max retries after the first attempt. Default 2 (clamped to 0..5). */
  maxRetries?: number;
}

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RETRIES = 2;
const MAX_RETRIES_CEILING = 5;
const RETRY_BASE_DELAY_MS = 100;
const RETRY_MAX_DELAY_MS = 2_000;
const DEFAULT_ANTHROPIC_VERSION = '2023-06-01';
const DEFAULT_ANTHROPIC_MAX_TOKENS = 4_096;
/** Anthropic has no `response_format`; structured mode is requested in the system prompt. */
const ANTHROPIC_JSON_INSTRUCTION =
  'Respond with only a single valid JSON object and nothing else — no prose and no markdown fences.';

const CAPABILITIES: ModelCapabilities = {
  structuredOutput: true,
  streaming: false,
  toolCalling: false,
};

function clampRetries(value: number | undefined): number {
  if (value === undefined) return DEFAULT_MAX_RETRIES;
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.min(Math.floor(value), MAX_RETRIES_CEILING);
}

/** Derive a stable provider id from the API host (falls back to `'http'`). */
function providerIdFrom(baseUrl: string): string {
  try {
    return new URL(baseUrl).host || 'http';
  } catch {
    return 'http';
  }
}

function chatCompletionsUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/chat/completions`;
}

function messagesUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/messages`;
}

function requestUrl(baseUrl: string, wireFormat: WireFormat): string {
  return wireFormat === 'anthropic' ? messagesUrl(baseUrl) : chatCompletionsUrl(baseUrl);
}

/** Remove a secret from text before it can reach an error message. */
function redact(text: string, secret: string): string {
  return secret.length === 0 ? text : text.split(secret).join('[redacted]');
}

function statusToError(status: number, body: string, apiKey: string): ProviderError {
  // Auth errors never include the response body, so no credential can leak.
  if (status === 401 || status === 403) {
    return new ProviderError('auth', `provider rejected the credentials (HTTP ${status})`, {
      status,
    });
  }
  if (status === 429) {
    return new ProviderError('rate-limit', 'provider rate limit reached (HTTP 429)', { status });
  }
  const snippet = redact(body.trim(), apiKey).slice(0, 200);
  const suffix = snippet.length > 0 ? `: ${snippet}` : '';
  if (status >= 500) {
    return new ProviderError('transport', `provider server error (HTTP ${status})${suffix}`, {
      status,
    });
  }
  return new ProviderError(
    'invalid-response',
    `provider returned an unexpected status (HTTP ${status})${suffix}`,
    { status },
  );
}

interface ChatMessage {
  role: 'system' | 'user';
  content: string;
}

function buildBody(model: string, request: ModelRequest): string {
  const messages: ChatMessage[] = [];
  if (request.system !== undefined) messages.push({ role: 'system', content: request.system });
  messages.push({ role: 'user', content: request.prompt });

  const body: Record<string, unknown> = { model, messages };
  if (request.maxOutputTokens !== undefined) body.max_tokens = request.maxOutputTokens;
  if (request.mode === 'structured') body.response_format = { type: 'json_object' };
  return JSON.stringify(body);
}

/**
 * Anthropic Messages body: `{ model, max_tokens, system?, messages }`. Anthropic
 * requires `max_tokens`, so a default is used when the request sets no bound.
 * Structured mode is requested through the system prompt (the Messages API has no
 * `response_format` field in the base wire format).
 */
function buildAnthropicBody(model: string, request: ModelRequest): string {
  const system: string[] = [];
  if (request.system !== undefined) system.push(request.system);
  if (request.mode === 'structured') system.push(ANTHROPIC_JSON_INSTRUCTION);

  const body: Record<string, unknown> = {
    model,
    max_tokens: request.maxOutputTokens ?? DEFAULT_ANTHROPIC_MAX_TOKENS,
    messages: [{ role: 'user', content: request.prompt }],
  };
  if (system.length > 0) body.system = system.join('\n\n');
  return JSON.stringify(body);
}

/** Request headers per wire format. The key is sent in a header, never the body. */
function requestHeaders(
  apiKey: string,
  wireFormat: WireFormat,
  anthropicVersion: string,
): Record<string, string> {
  if (wireFormat === 'anthropic') {
    return {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': anthropicVersion,
    };
  }
  return { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` };
}

function asUsage(payload: Record<string, unknown>): ModelUsage {
  const usage = isPlainObject(payload.usage) ? payload.usage : {};
  const input = usage.prompt_tokens;
  const output = usage.completion_tokens;
  return {
    inputTokens: typeof input === 'number' && Number.isFinite(input) ? input : 0,
    outputTokens: typeof output === 'number' && Number.isFinite(output) ? output : 0,
  };
}

function extractContent(payload: unknown): string {
  if (!isPlainObject(payload)) {
    throw new ProviderError('invalid-response', 'provider response was not a JSON object');
  }
  const choices = payload.choices;
  const first = Array.isArray(choices) ? choices[0] : undefined;
  const message = isPlainObject(first) && isPlainObject(first.message) ? first.message : undefined;
  const content = message?.content;
  if (typeof content !== 'string') {
    throw new ProviderError(
      'invalid-response',
      'provider response missing choices[0].message.content',
    );
  }
  return content;
}

function parseResponse(
  payload: unknown,
  request: ModelRequest,
  providerId: string,
  fallbackModel: string,
): ModelResponse {
  const content = extractContent(payload);
  const record = isPlainObject(payload) ? payload : {};
  const usage = asUsage(record);
  const model = typeof record.model === 'string' ? record.model : fallbackModel;

  if (request.mode === 'structured') {
    let data: unknown;
    try {
      data = JSON.parse(content);
    } catch (cause) {
      throw new ProviderError(
        'invalid-response',
        'provider structured response was not valid JSON',
        {
          cause,
        },
      );
    }
    if (request.schema !== undefined) {
      const result = validateAgainstSchema(data, request.schema);
      if (!result.valid) {
        throw new ProviderError(
          'invalid-response',
          `provider structured response failed schema validation: ${result.errors.join('; ')}`,
        );
      }
    }
    return { text: content, data, usage, model, providerId, simulated: false };
  }

  return { text: content, usage, model, providerId, simulated: false };
}

function anthropicUsage(payload: Record<string, unknown>): ModelUsage {
  const usage = isPlainObject(payload.usage) ? payload.usage : {};
  const input = usage.input_tokens;
  const output = usage.output_tokens;
  return {
    inputTokens: typeof input === 'number' && Number.isFinite(input) ? input : 0,
    outputTokens: typeof output === 'number' && Number.isFinite(output) ? output : 0,
  };
}

/** Join the `text` content blocks of an Anthropic message; fail when there are none. */
function extractAnthropicContent(payload: unknown): string {
  if (!isPlainObject(payload)) {
    throw new ProviderError('invalid-response', 'provider response was not a JSON object');
  }
  const content = payload.content;
  if (!Array.isArray(content)) {
    throw new ProviderError('invalid-response', 'provider response missing content blocks');
  }
  const blocks = content.filter(
    (block): block is { type: 'text'; text: string } =>
      isPlainObject(block) && block.type === 'text' && typeof block.text === 'string',
  );
  if (blocks.length === 0) {
    throw new ProviderError('invalid-response', 'provider response contained no text content');
  }
  return blocks.map((block) => block.text).join('');
}

function parseAnthropicResponse(
  payload: unknown,
  request: ModelRequest,
  providerId: string,
  fallbackModel: string,
): ModelResponse {
  const content = extractAnthropicContent(payload);
  const record = isPlainObject(payload) ? payload : {};
  const usage = anthropicUsage(record);
  const model = typeof record.model === 'string' ? record.model : fallbackModel;

  if (request.mode === 'structured') {
    let data: unknown;
    try {
      data = JSON.parse(content);
    } catch (cause) {
      throw new ProviderError(
        'invalid-response',
        'provider structured response was not valid JSON',
        {
          cause,
        },
      );
    }
    if (request.schema !== undefined) {
      const result = validateAgainstSchema(data, request.schema);
      if (!result.valid) {
        throw new ProviderError(
          'invalid-response',
          `provider structured response failed schema validation: ${result.errors.join('; ')}`,
        );
      }
    }
    return { text: content, data, usage, model, providerId, simulated: false };
  }

  return { text: content, usage, model, providerId, simulated: false };
}

/** Create a `ModelProvider` backed by the platform `fetch` (OpenAI or Anthropic). */
export function createHttpProvider(config: HttpProviderConfig): ModelProvider {
  if (typeof config.apiKey !== 'string' || config.apiKey.trim() === '') {
    throw new ProviderError(
      'auth',
      'createHttpProvider: apiKey is required (pass it in config; it is never read from the environment implicitly)',
    );
  }
  if (typeof config.baseUrl !== 'string' || config.baseUrl.trim() === '') {
    throw new ProviderError('invalid-response', 'createHttpProvider: baseUrl is required');
  }
  if (typeof config.model !== 'string' || config.model.trim() === '') {
    throw new ProviderError('invalid-response', 'createHttpProvider: model is required');
  }

  const wireFormat: WireFormat = config.wireFormat ?? 'openai';
  if (wireFormat !== 'openai' && wireFormat !== 'anthropic') {
    throw new ProviderError(
      'invalid-response',
      `createHttpProvider: unknown wireFormat "${String(config.wireFormat)}"`,
    );
  }
  const anthropicVersion = config.anthropicVersion ?? DEFAULT_ANTHROPIC_VERSION;
  const id = providerIdFrom(config.baseUrl);
  const url = requestUrl(config.baseUrl, wireFormat);
  const maxRetries = clampRetries(config.maxRetries);

  async function requestOnce(
    request: ModelRequest,
    signal: AbortSignal | undefined,
  ): Promise<ModelResponse> {
    if (signal?.aborted === true) {
      throw new ProviderError('aborted', 'provider request aborted before it was sent');
    }

    const timeoutMs = request.timeoutMs ?? config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const controller = new AbortController();
    let timedOut = false;
    let abortedByCaller = false;
    const onAbort = (): void => {
      abortedByCaller = true;
      controller.abort();
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: requestHeaders(config.apiKey, wireFormat, anthropicVersion),
        body:
          wireFormat === 'anthropic'
            ? buildAnthropicBody(config.model, request)
            : buildBody(config.model, request),
        signal: controller.signal,
      });
    } catch (cause) {
      if (timedOut) {
        throw new ProviderError('timeout', `provider request timed out after ${timeoutMs}ms`, {
          cause,
        });
      }
      if (abortedByCaller) {
        throw new ProviderError('aborted', 'provider request aborted', { cause });
      }
      throw new ProviderError('transport', 'provider request failed (network)', { cause });
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    }

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw statusToError(response.status, body, config.apiKey);
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch (cause) {
      throw new ProviderError('invalid-response', 'provider response was not valid JSON', {
        cause,
      });
    }
    return wireFormat === 'anthropic'
      ? parseAnthropicResponse(payload, request, id, config.model)
      : parseResponse(payload, request, id, config.model);
  }

  function backoff(attempt: number, signal: AbortSignal | undefined): Promise<void> {
    const delay = Math.min(RETRY_BASE_DELAY_MS * 2 ** attempt, RETRY_MAX_DELAY_MS);
    return new Promise<void>((resolve, reject) => {
      const abort = (): void => {
        clearTimeout(timer);
        reject(new ProviderError('aborted', 'provider request aborted during retry backoff'));
      };
      const timer = setTimeout(() => {
        signal?.removeEventListener('abort', abort);
        resolve();
      }, delay);
      if (signal?.aborted === true) {
        clearTimeout(timer);
        reject(new ProviderError('aborted', 'provider request aborted during retry backoff'));
        return;
      }
      signal?.addEventListener('abort', abort, { once: true });
    });
  }

  return {
    id,
    model: config.model,
    capabilities: CAPABILITIES,
    async generate(request, signal) {
      for (let attempt = 0; ; attempt += 1) {
        try {
          return await requestOnce(request, signal);
        } catch (error) {
          const retryable = error instanceof ProviderError && error.retryable;
          if (!retryable || attempt >= maxRetries) throw error;
          await backoff(attempt, signal);
        }
      }
    },
  };
}
