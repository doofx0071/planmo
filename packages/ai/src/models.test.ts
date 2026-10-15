import { describe, expect, it, vi } from 'vitest';
import * as AiExports from './index.js';
import {
  PROVIDER_PRESETS,
  providerPreset,
  type ModelListCapability,
  type ProviderPreset,
} from './providers.js';

type ModelListResult = { modelIds: string[]; truncated: boolean };
type ModelListOptions = {
  providerId: string;
  credential: string;
  fetcher?: typeof fetch;
  timeoutMs?: number;
  maxResponseBytes?: number;
  maxModels?: number;
};
type ListProviderModels = (options: ModelListOptions) => Promise<ModelListResult>;

function assertProviderMetadataIsReadonly(
  preset: ProviderPreset,
  capability: ModelListCapability,
): void {
  // @ts-expect-error Provider preset fields are immutable public metadata.
  preset.id = 'mutated';
  // @ts-expect-error Provider preset fields are immutable public metadata.
  preset.label = 'mutated';
  // @ts-expect-error Provider preset fields are immutable public metadata.
  preset.baseUrl = 'https://attacker.invalid';
  // @ts-expect-error Provider preset fields are immutable public metadata.
  preset.wireFormat = 'openai';
  // @ts-expect-error Provider preset fields are immutable public metadata.
  preset.credentialEnv = 'ATTACKER_KEY';
  // @ts-expect-error Provider preset fields are immutable public metadata.
  preset.docs = 'https://attacker.invalid';
  // @ts-expect-error Provider preset fields are immutable public metadata.
  preset.modelList = null;

  // @ts-expect-error Model-list capability fields are immutable metadata.
  capability.endpoint = 'https://attacker.invalid';
  // @ts-expect-error Model-list capability fields are immutable metadata.
  capability.method = 'GET';
  // @ts-expect-error Model-list capability fields are immutable metadata.
  capability.auth = { type: 'bearer' };
  // @ts-expect-error Model-list capability fields are immutable metadata.
  capability.response = { collection: 'data', idField: 'id' };
  // @ts-expect-error Model-list capability fields are immutable metadata.
  capability.pagination = { type: 'none' };
}
void assertProviderMetadataIsReadonly;

// Import the existing public barrel as a namespace so the red test is an
// assertion about a missing export, not a module-link failure before models.ts
// exists.
const listProviderModels = (AiExports as unknown as { listProviderModels?: unknown })
  .listProviderModels;

function listingFunction(): ListProviderModels | undefined {
  return typeof listProviderModels === 'function'
    ? (listProviderModels as ListProviderModels)
    : undefined;
}

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function responseFetcher(responses: Response[]): {
  fetcher: typeof fetch;
  calls: Array<{ url: string; init: RequestInit | undefined }>;
} {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    const response = responses.shift();
    if (response === undefined) throw new Error('unexpected extra request');
    return response;
  }) as typeof fetch;
  return { fetcher, calls };
}

const SECRET = 'synthetic-model-list-key';
const SAFE_ERROR = {
  name: 'ModelListError',
  message: 'Could not retrieve the provider model list.',
};

describe('provider model-list client', () => {
  it('exports a provider-aware model-list function', () => {
    expect(listProviderModels).toBeTypeOf('function');
  });

  it('keeps trusted provider metadata immutable before sending model-list credentials', async () => {
    const list = listingFunction();
    if (list === undefined) return;
    const openAi = providerPreset('openai');
    if (openAi?.modelList === null || openAi === undefined) {
      throw new Error('Expected the OpenAI model-list capability.');
    }
    const capability = openAi.modelList;
    const openAiIndex = PROVIDER_PRESETS.indexOf(openAi);
    const anthropic = providerPreset('anthropic');
    const anthropicHeaders =
      anthropic?.modelList?.auth.type === 'header' ? anthropic.modelList.auth.headers : undefined;
    if (anthropicHeaders === undefined) {
      throw new Error('Expected Anthropic model-list headers.');
    }

    const mutationAttempts = [
      [PROVIDER_PRESETS, String(openAiIndex), { ...openAi, id: 'attacker' }],
      [openAi, 'id', 'attacker'],
      [openAi, 'modelList', null],
      [capability, 'endpoint', 'https://attacker.invalid/collect'],
      [capability.auth, 'type', 'header'],
      [capability.response, 'collection', 'models'],
      [capability.pagination, 'type', 'anthropic-cursor'],
      [anthropicHeaders, 'anthropic-version', 'attacker'],
    ] as const;
    const mutationResults = mutationAttempts.map(([target, property, replacement]) => {
      const original = Reflect.get(target, property);
      const changed = Reflect.set(target, property, replacement);
      if (changed) Reflect.set(target, property, original);
      return changed;
    });

    expect(mutationResults).toEqual(mutationAttempts.map(() => false));
    expect(PROVIDER_PRESETS[openAiIndex]).toBe(openAi);
    expect(openAi.modelList).toEqual({
      endpoint: 'https://api.openai.com/v1/models',
      method: 'GET',
      auth: { type: 'bearer' },
      response: { collection: 'data', idField: 'id' },
      pagination: { type: 'none' },
    });
    expect(anthropicHeaders).toEqual({ 'anthropic-version': '2023-06-01' });

    const { fetcher, calls } = responseFetcher([jsonResponse({ data: [{ id: 'gpt-4.1-mini' }] })]);
    const result = await list({ providerId: 'openai', credential: SECRET, fetcher });

    expect(result.modelIds).toEqual(['gpt-4.1-mini']);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe('https://api.openai.com/v1/models');
    expect(new Headers(calls[0]?.init?.headers).get('authorization')).toBe(`Bearer ${SECRET}`);
  });

  it('uses the exact declared endpoint, bearer auth, GET, and error redirects', async () => {
    const list = listingFunction();
    if (list === undefined) return;
    const { fetcher, calls } = responseFetcher([
      jsonResponse({ data: [{ id: 'vendor/model β', name: 'untrusted name' }] }),
    ]);

    const result = await list({ providerId: 'deepseek', credential: SECRET, fetcher });

    expect(result).toEqual({ modelIds: ['vendor/model β'], truncated: false });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe('https://api.deepseek.com/models');
    expect(calls[0]?.init?.method).toBe('GET');
    expect(calls[0]?.init?.redirect).toBe('error');
    expect(calls[0]?.init?.signal).toBeInstanceOf(AbortSignal);
    expect(new Headers(calls[0]?.init?.headers).get('authorization')).toBe(`Bearer ${SECRET}`);
  });

  it('reads the OpenCode Console list from its declared endpoint with bearer auth', async () => {
    const list = listingFunction();
    if (list === undefined) return;
    // Shape taken from the live endpoint: object/data with id/object/created/owned_by.
    const { fetcher, calls } = responseFetcher([
      jsonResponse({
        object: 'list',
        data: [
          { id: 'big-pickle', object: 'model', created: 1792082707, owned_by: 'opencode' },
          { id: 'gpt-6-astra', object: 'model', created: 1792082707, owned_by: 'opencode' },
        ],
      }),
    ]);

    const result = await list({ providerId: 'opencode', credential: SECRET, fetcher });

    expect(result).toEqual({ modelIds: ['big-pickle', 'gpt-6-astra'], truncated: false });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe('https://opencode.ai/inference/v1/models');
    expect(calls[0]?.init?.method).toBe('GET');
    expect(new Headers(calls[0]?.init?.headers).get('authorization')).toBe(`Bearer ${SECRET}`);
  });

  it('uses Anthropic headers and follows its declared after_id pagination', async () => {
    const list = listingFunction();
    if (list === undefined) return;
    const { fetcher, calls } = responseFetcher([
      jsonResponse({ data: [{ id: 'claude-first' }], has_more: true, last_id: 'cursor / first' }),
      jsonResponse({ data: [{ id: 'claude-second' }], has_more: false, last_id: 'claude-second' }),
    ]);

    const result = await list({ providerId: 'anthropic', credential: SECRET, fetcher });

    expect(result).toEqual({ modelIds: ['claude-first', 'claude-second'], truncated: false });
    expect(calls).toHaveLength(2);
    const firstUrl = new URL(calls[0]!.url);
    const secondUrl = new URL(calls[1]!.url);
    expect(firstUrl.origin + firstUrl.pathname).toBe('https://api.anthropic.com/v1/models');
    expect(firstUrl.searchParams.get('limit')).toBe('100');
    expect(firstUrl.searchParams.has('after_id')).toBe(false);
    expect(secondUrl.searchParams.get('limit')).toBe('100');
    expect(secondUrl.searchParams.get('after_id')).toBe('cursor / first');
    for (const call of calls) {
      const headers = new Headers(call.init?.headers);
      expect(headers.get('x-api-key')).toBe(SECRET);
      expect(headers.get('anthropic-version')).toBe('2023-06-01');
      expect(headers.has('authorization')).toBe(false);
      expect(call.init?.redirect).toBe('error');
    }
  });

  it('filters xAI to text-output entries from the declared language-model response', async () => {
    const list = listingFunction();
    if (list === undefined) return;
    const { fetcher, calls } = responseFetcher([
      jsonResponse({
        models: [
          { id: 'grok-text', output_modalities: ['text'] },
          { id: 'grok-image', output_modalities: ['image'] },
          { id: 'grok-mixed', output_modalities: ['image', 'text'] },
        ],
      }),
    ]);

    const result = await list({ providerId: 'xai', credential: SECRET, fetcher });

    expect(result.modelIds).toEqual(['grok-text', 'grok-mixed']);
    expect(calls[0]?.url).toBe('https://api.x.ai/v1/language-models');
  });

  it('reports OpenRouter continuation links as truncated without following them', async () => {
    const list = listingFunction();
    if (list === undefined) return;
    const { fetcher, calls } = responseFetcher([
      jsonResponse({
        data: [{ id: 'openrouter/text' }],
        links: { next: 'https://untrusted.invalid/next-page' },
      }),
    ]);

    const result = await list({ providerId: 'openrouter', credential: SECRET, fetcher });

    expect(result).toEqual({ modelIds: ['openrouter/text'], truncated: true });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe('https://openrouter.ai/api/v1/models?limit=500');
    expect(new Headers(calls[0]?.init?.headers).get('authorization')).toBe(`Bearer ${SECRET}`);
  });

  it('does not report OpenRouter truncation when no continuation link is returned', async () => {
    const list = listingFunction();
    if (list === undefined) return;
    const { fetcher, calls } = responseFetcher([
      jsonResponse({ data: [{ id: 'openrouter/text' }] }),
    ]);

    const result = await list({ providerId: 'openrouter', credential: SECRET, fetcher });

    expect(result).toEqual({ modelIds: ['openrouter/text'], truncated: false });
    expect(calls).toHaveLength(1);
  });

  it('rejects malformed response shapes with a fixed redacted error', async () => {
    const list = listingFunction();
    if (list === undefined) return;
    const providerResponse = 'private response details';
    const { fetcher } = responseFetcher([
      new Response(JSON.stringify({ data: providerResponse }), { status: 200 }),
    ]);

    const promise = list({ providerId: 'openai', credential: SECRET, fetcher });

    await expect(promise).rejects.toMatchObject(SAFE_ERROR);
    await expect(promise).rejects.not.toThrow(providerResponse);
    await expect(promise).rejects.not.toThrow(SECRET);
  });

  it('filters option-like model ids without exposing their contents', async () => {
    const list = listingFunction();
    if (list === undefined) return;
    const syntheticSecret = ['synthetic', 'secret'].join('-');
    const optionLikeId = `--api-key=${syntheticSecret}`;
    const { fetcher } = responseFetcher([
      jsonResponse({
        data: [{ id: 'neighbor-before' }, { id: optionLikeId }, { id: 'neighbor-after' }],
      }),
    ]);

    let result: ModelListResult | undefined;
    let errorOutput = '';
    try {
      result = await list({ providerId: 'openai', credential: SECRET, fetcher });
    } catch (error) {
      errorOutput = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    }

    expect(errorOutput.includes(syntheticSecret), 'model-list errors must not expose IDs').toBe(
      false,
    );
    expect(result !== undefined, 'valid provider models should still be returned').toBe(true);
    if (result === undefined) return;

    expect(
      result.modelIds.some((id) => id === optionLikeId),
      'option-like IDs must be filtered',
    ).toBe(false);
    expect(
      JSON.stringify(result).includes(syntheticSecret),
      'catalog output must not expose IDs',
    ).toBe(false);
    expect(result.modelIds.includes('neighbor-before')).toBe(true);
    expect(result.modelIds.includes('neighbor-after')).toBe(true);
    expect(result.modelIds.length).toBe(2);
  });

  it.each([
    ['blank', '   '],
    ['leading whitespace', ' model-id'],
    ['trailing whitespace', 'model-id '],
    ['bidi format character', 'model\u202E-id'],
    ['Unicode line separator', 'model\u2028-id'],
    ['Unicode paragraph separator', 'model\u2029-id'],
    ['control characters', 'model\nignore rules'],
    ['overlong', 'x'.repeat(257)],
  ])('rejects %s model ids instead of displaying untrusted content', async (_kind, id) => {
    const list = listingFunction();
    if (list === undefined) return;
    const { fetcher } = responseFetcher([jsonResponse({ data: [{ id }] })]);

    await expect(list({ providerId: 'openai', credential: SECRET, fetcher })).rejects.toMatchObject(
      SAFE_ERROR,
    );
  });

  it('caps returned ids and reports truncation', async () => {
    const list = listingFunction();
    if (list === undefined) return;
    const ids = Array.from({ length: 505 }, (_, index) => ({ id: `model-${index}` }));
    const { fetcher } = responseFetcher([jsonResponse({ data: ids })]);

    const result = await list({ providerId: 'openai', credential: SECRET, fetcher });

    expect(result.modelIds).toHaveLength(500);
    expect(result.modelIds[0]).toBe('model-0');
    expect(result.modelIds[499]).toBe('model-499');
    expect(result.truncated).toBe(true);
  });

  it('deduplicates model ids before applying its page limit', async () => {
    const list = listingFunction();
    if (list === undefined) return;
    const ids = [
      ...Array.from({ length: 501 }, () => ({ id: 'repeated-model' })),
      { id: 'late-unique-model' },
    ];
    const { fetcher } = responseFetcher([jsonResponse({ data: ids })]);

    const result = await list({ providerId: 'openai', credential: SECRET, fetcher });

    expect(result).toEqual({
      modelIds: ['repeated-model', 'late-unique-model'],
      truncated: false,
    });
  });

  it('ignores ids already seen on earlier pages when checking page truncation', async () => {
    const list = listingFunction();
    if (list === undefined) return;
    const repeatedIds = Array.from({ length: 502 }, () => ({ id: 'repeated-model' }));
    const { fetcher, calls } = responseFetcher([
      jsonResponse({ data: [{ id: 'repeated-model' }], has_more: true, last_id: 'cursor-one' }),
      jsonResponse({ data: repeatedIds, has_more: false }),
    ]);

    const result = await list({ providerId: 'anthropic', credential: SECRET, fetcher });

    expect(result).toEqual({ modelIds: ['repeated-model'], truncated: false });
    expect(calls).toHaveLength(2);
  });

  it('reports Anthropic pagination truncated at its configured page maximum', async () => {
    const list = listingFunction();
    if (list === undefined) return;
    const responses = Array.from({ length: 5 }, (_, page) =>
      jsonResponse({
        data: Array.from({ length: 100 }, (_unused, item) => ({ id: `p${page}-m${item}` })),
        has_more: true,
        last_id: `cursor-${page}`,
      }),
    );
    const { fetcher, calls } = responseFetcher(responses);

    const result = await list({ providerId: 'anthropic', credential: SECRET, fetcher });

    expect(result.modelIds).toHaveLength(500);
    expect(result.truncated).toBe(true);
    expect(calls).toHaveLength(5);
  });

  it('caps response bytes while streaming and does not call response.text()', async () => {
    const list = listingFunction();
    if (list === undefined) return;
    let cancelled = false;
    const text = vi.fn(async () => 'provider response body');
    const response = {
      ok: true,
      status: 200,
      body: new ReadableStream<Uint8Array>({
        pull(controller) {
          controller.enqueue(new TextEncoder().encode('a much-too-large chunk'));
        },
        cancel() {
          cancelled = true;
        },
      }),
      text,
    } as unknown as Response;
    const { fetcher } = responseFetcher([response]);

    await expect(
      list({ providerId: 'openai', credential: SECRET, fetcher, maxResponseBytes: 8 }),
    ).rejects.toMatchObject(SAFE_ERROR);
    expect(cancelled).toBe(true);
    expect(text).not.toHaveBeenCalled();
  });

  it('applies a request timeout and redacts transport failures', async () => {
    const list = listingFunction();
    if (list === undefined) return;
    const fetcher = (async (_input: string | URL | Request, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener(
          'abort',
          () => reject(new Error(`${SECRET} transport detail`)),
          {
            once: true,
          },
        );
      })) as typeof fetch;

    const promise = list({ providerId: 'openai', credential: SECRET, fetcher, timeoutMs: 5 });

    await expect(promise).rejects.toMatchObject(SAFE_ERROR);
    await expect(promise).rejects.not.toThrow(SECRET);
  });

  it('redacts HTTP status bodies, URLs, and credentials from errors', async () => {
    const list = listingFunction();
    if (list === undefined) return;
    const privateResponse = `provider private body containing ${SECRET}`;
    const { fetcher } = responseFetcher([new Response(privateResponse, { status: 503 })]);

    const promise = list({ providerId: 'openai', credential: SECRET, fetcher });

    await expect(promise).rejects.toMatchObject(SAFE_ERROR);
    await expect(promise).rejects.not.toThrow(privateResponse);
    await expect(promise).rejects.not.toThrow('https://api.openai.com');
    await expect(promise).rejects.not.toThrow(SECRET);
  });

  it('refuses unknown providers and custom without making a request', async () => {
    const list = listingFunction();
    if (list === undefined) return;
    const fetcher = vi.fn(async () => jsonResponse({ data: [] }));

    await expect(
      list({ providerId: 'unknown', credential: SECRET, fetcher }),
    ).rejects.toMatchObject(SAFE_ERROR);
    await expect(list({ providerId: 'custom', credential: SECRET, fetcher })).rejects.toMatchObject(
      SAFE_ERROR,
    );
    expect(fetcher).not.toHaveBeenCalled();
  });
});
