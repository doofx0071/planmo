/**
 * Deterministic, fully offline mock provider.
 *
 * It is the provider the default test suite and goldens use: it never touches
 * the network, never needs a credential, and returns byte-identical output for
 * byte-identical input. Every response carries `simulated: true` so a caller
 * can never mistake it for a real model.
 *
 * Structured mode validates `data` against the request `schema` with the
 * dependency-free validator in `./structured.js` and fails with `ProviderError`
 * kind `invalid-response` when it does not match. When no canned `data` is
 * supplied, a schema-shaped value is synthesized deterministically from the
 * schema so the default mock is usable out of the box.
 */

import { ProviderError } from './contracts.js';
import type { ModelCapabilities, ModelProvider, ModelRequest, ModelUsage } from './contracts.js';
import { validateAgainstSchema } from './structured.js';
import { isPlainObject } from './util.js';

export interface MockProviderOptions {
  /** Provider id reported on responses. Default `'mock'`. */
  id?: string;
  /** Model id reported on responses. Default `'mock-1'`. */
  model?: string;
  /** Capability overrides (defaults: structuredOutput true, streaming/toolCalling false). */
  capabilities?: Partial<ModelCapabilities>;
  /** Canned text output. When omitted, derived deterministically from the request. */
  text?: string;
  /** Canned structured payload. When omitted, synthesized deterministically from the schema. */
  data?: unknown;
}

const DEFAULT_CAPABILITIES: ModelCapabilities = {
  structuredOutput: true,
  streaming: false,
  toolCalling: false,
};

/** Deterministic, character-based token estimate (mock only; not a real tokenizer). */
function estimateTokens(text: string): number {
  return text.length === 0 ? 0 : Math.ceil(text.length / 4);
}

/** The prompt the mock echoes: system (when present) followed by the user prompt. */
function sourceText(request: ModelRequest): string {
  return request.system === undefined ? request.prompt : `${request.system}\n${request.prompt}`;
}

/** Deterministically synthesize a value that satisfies the supported schema subset. */
function synthesize(schema: unknown): unknown {
  if (schema === true) return null;
  if (schema === false) return null; // Nothing is valid; validation will fail loudly.
  if (!isPlainObject(schema)) return null;

  if ('const' in schema) return schema.const;
  if (Array.isArray(schema.enum) && schema.enum.length > 0) return schema.enum[0];
  if ('default' in schema) return schema.default;

  const declared = Array.isArray(schema.type)
    ? schema.type
    : schema.type === undefined
      ? []
      : [schema.type];
  const type = declared.find((candidate): candidate is string => typeof candidate === 'string');

  if (type === 'object' || isPlainObject(schema.properties)) return synthesizeObject(schema);
  if (type === 'array') return synthesizeArray(schema);
  if (type === 'string') {
    return typeof schema.minLength === 'number' && schema.minLength > 0
      ? 'a'.repeat(schema.minLength)
      : '';
  }
  if (type === 'integer' || type === 'number') {
    return typeof schema.minimum === 'number' ? schema.minimum : 0;
  }
  if (type === 'boolean') return false;
  return null;
}

function synthesizeObject(schema: Record<string, unknown>): Record<string, unknown> {
  const properties = isPlainObject(schema.properties) ? schema.properties : {};
  const result: Record<string, unknown> = {};
  for (const [key, sub] of Object.entries(properties)) result[key] = synthesize(sub);
  return result;
}

function synthesizeArray(schema: Record<string, unknown>): unknown[] {
  const count = typeof schema.minItems === 'number' && schema.minItems > 0 ? schema.minItems : 0;
  const result: unknown[] = [];
  for (let index = 0; index < count; index += 1) result.push(synthesize(schema.items));
  return result;
}

/** Create a deterministic, offline `ModelProvider`. */
export function createMockProvider(options: MockProviderOptions = {}): ModelProvider {
  const id = options.id ?? 'mock';
  const model = options.model ?? 'mock-1';
  const capabilities: ModelCapabilities = { ...DEFAULT_CAPABILITIES, ...options.capabilities };

  function usageFor(request: ModelRequest, outputText: string): ModelUsage {
    return {
      inputTokens: estimateTokens(sourceText(request)),
      outputTokens: estimateTokens(outputText),
    };
  }

  return {
    id,
    model,
    capabilities,
    async generate(request, signal) {
      if (signal?.aborted === true) {
        throw new ProviderError('aborted', 'mock provider request aborted before generation');
      }

      if (request.mode === 'structured') {
        if (request.schema === undefined) {
          throw new ProviderError(
            'invalid-response',
            'mock provider: structured mode requires a schema',
          );
        }
        const data = options.data === undefined ? synthesize(request.schema) : options.data;
        const result = validateAgainstSchema(data, request.schema);
        if (!result.valid) {
          throw new ProviderError(
            'invalid-response',
            `mock provider: structured output failed schema validation: ${result.errors.join('; ')}`,
          );
        }
        const text = options.text ?? JSON.stringify(data);
        return {
          text,
          data,
          usage: usageFor(request, text),
          model,
          providerId: id,
          simulated: true,
        };
      }

      const text = options.text ?? sourceText(request);
      return { text, usage: usageFor(request, text), model, providerId: id, simulated: true };
    },
  };
}
