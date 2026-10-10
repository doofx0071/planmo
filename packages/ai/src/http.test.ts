import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProviderError } from './contracts.js';
import { createHttpProvider } from './http.js';

const baseUrl = 'https://api.example.com/v1';

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function chatResponse(content: string, extra: Record<string, unknown> = {}): Response {
  return jsonResponse({
    model: 'served-model',
    choices: [{ message: { role: 'assistant', content } }],
    usage: { prompt_tokens: 11, completion_tokens: 7 },
    ...extra,
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('createHttpProvider', () => {
  it('posts to /chat/completions and maps the response', async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) =>
      chatResponse('hello there'),
    );
    vi.stubGlobal('fetch', fetchMock);
    const provider = createHttpProvider({ baseUrl, apiKey: 'sk-secret', model: 'gpt-x' });

    const response = await provider.generate({ prompt: 'hi', mode: 'text' });

    expect(response.text).toBe('hello there');
    expect(response.simulated).toBe(false);
    expect(response.model).toBe('served-model');
    expect(response.providerId).toBe('api.example.com');
    expect(response.usage).toEqual({ inputTokens: 11, outputTokens: 7 });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.example.com/v1/chat/completions');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer sk-secret');
    const body = JSON.parse(String(init.body));
    expect(body.model).toBe('gpt-x');
    expect(body.messages).toEqual([{ role: 'user', content: 'hi' }]);
  });

  it('includes the system message when present', async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => chatResponse('ok'));
    vi.stubGlobal('fetch', fetchMock);
    const provider = createHttpProvider({ baseUrl, apiKey: 'k', model: 'm' });

    await provider.generate({ system: 'be terse', prompt: 'hi', mode: 'text' });

    const body = JSON.parse(String(fetchMock.mock.calls[0]![1].body));
    expect(body.messages).toEqual([
      { role: 'system', content: 'be terse' },
      { role: 'user', content: 'hi' },
    ]);
  });

  it('parses and schema-validates structured output', async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) =>
      chatResponse('{"answer":42}'),
    );
    vi.stubGlobal('fetch', fetchMock);
    const provider = createHttpProvider({ baseUrl, apiKey: 'k', model: 'm' });

    const response = await provider.generate({
      prompt: 'q',
      mode: 'structured',
      schema: { type: 'object', required: ['answer'], properties: { answer: { type: 'number' } } },
    });

    expect(response.data).toEqual({ answer: 42 });
    expect(response.simulated).toBe(false);
    const body = JSON.parse(String(fetchMock.mock.calls[0]![1].body));
    expect(body.response_format).toEqual({ type: 'json_object' });
  });

  it('rejects structured output that is not JSON or fails the schema', async () => {
    const provider = createHttpProvider({ baseUrl, apiKey: 'k', model: 'm' });

    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, _init: RequestInit) => chatResponse('not json')),
    );
    await expect(
      provider.generate({
        prompt: 'q',
        mode: 'structured',
        schema: { type: 'object', properties: { answer: { type: 'number' } } },
      }),
    ).rejects.toMatchObject({ kind: 'invalid-response' });

    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, _init: RequestInit) => chatResponse('{"answer":"forty-two"}')),
    );
    await expect(
      provider.generate({
        prompt: 'q',
        mode: 'structured',
        schema: { type: 'object', properties: { answer: { type: 'number' } } },
      }),
    ).rejects.toMatchObject({ kind: 'invalid-response' });
  });

  it('times out a stalled request', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init.signal?.addEventListener('abort', () => reject(new Error('aborted')));
          }),
      ),
    );
    const provider = createHttpProvider({ baseUrl, apiKey: 'k', model: 'm', timeoutMs: 10 });

    await expect(provider.generate({ prompt: 'q', mode: 'text' })).rejects.toMatchObject({
      kind: 'timeout',
    });
  });

  it('retries a 5xx and then succeeds', async () => {
    const fetchMock = vi
      .fn(async (_url: string, _init: RequestInit) => chatResponse('unused'))
      .mockResolvedValueOnce(new Response('boom', { status: 500 }))
      .mockResolvedValueOnce(chatResponse('recovered'));
    vi.stubGlobal('fetch', fetchMock);
    const provider = createHttpProvider({ baseUrl, apiKey: 'k', model: 'm', maxRetries: 2 });

    const response = await provider.generate({ prompt: 'q', mode: 'text' });

    expect(response.text).toBe('recovered');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('retries a rate limit (429) and then succeeds', async () => {
    const fetchMock = vi
      .fn(async (_url: string, _init: RequestInit) => chatResponse('unused'))
      .mockResolvedValueOnce(new Response('slow down', { status: 429 }))
      .mockResolvedValueOnce(chatResponse('recovered'));
    vi.stubGlobal('fetch', fetchMock);
    const provider = createHttpProvider({ baseUrl, apiKey: 'k', model: 'm', maxRetries: 1 });

    const response = await provider.generate({ prompt: 'q', mode: 'text' });

    expect(response.text).toBe('recovered');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('never retries an auth failure', async () => {
    const fetchMock = vi.fn(
      async (_url: string, _init: RequestInit) => new Response('no', { status: 401 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const provider = createHttpProvider({ baseUrl, apiKey: 'k', model: 'm', maxRetries: 3 });

    const error = await provider.generate({ prompt: 'q', mode: 'text' }).then(
      () => undefined,
      (thrown: unknown) => thrown,
    );
    expect(error).toBeInstanceOf(ProviderError);
    expect((error as ProviderError).kind).toBe('auth');
    expect((error as ProviderError).retryable).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    [400, 'invalid-response'],
    [403, 'auth'],
    [429, 'rate-limit'],
    [500, 'transport'],
  ] as const)('maps HTTP %i to error kind %s', async (status, kind) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, _init: RequestInit) => new Response('x', { status })),
    );
    const provider = createHttpProvider({ baseUrl, apiKey: 'k', model: 'm', maxRetries: 0 });

    await expect(provider.generate({ prompt: 'q', mode: 'text' })).rejects.toMatchObject({ kind });
  });

  it('throws a clear error when the api key is missing', () => {
    expect(() => createHttpProvider({ baseUrl, apiKey: '', model: 'm' })).toThrowError(
      ProviderError,
    );
    try {
      createHttpProvider({ baseUrl, apiKey: '   ', model: 'm' });
    } catch (error) {
      expect((error as ProviderError).kind).toBe('auth');
      expect((error as ProviderError).message).toContain('apiKey is required');
    }
  });

  it('honours a caller AbortSignal', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init.signal?.addEventListener('abort', () => reject(new Error('aborted')));
          }),
      ),
    );
    const provider = createHttpProvider({ baseUrl, apiKey: 'k', model: 'm', timeoutMs: 10_000 });
    const controller = new AbortController();

    const promise = provider.generate({ prompt: 'q', mode: 'text' }, controller.signal);
    controller.abort();

    await expect(promise).rejects.toMatchObject({ kind: 'aborted' });
  });

  it('never echoes the api key in an error message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async (_url: string, _init: RequestInit) =>
          new Response('sk-leak sk-leak', { status: 500 }),
      ),
    );
    const provider = createHttpProvider({ baseUrl, apiKey: 'sk-leak', model: 'm', maxRetries: 0 });

    const error = await provider.generate({ prompt: 'q', mode: 'text' }).then(
      () => undefined,
      (thrown: unknown) => thrown,
    );
    expect(error).toBeInstanceOf(ProviderError);
    expect((error as ProviderError).message).not.toContain('sk-leak');
    expect((error as ProviderError).message).toContain('[redacted]');
  });
});
