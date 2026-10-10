import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProviderError } from './contracts.js';
import { createHttpProvider } from './http.js';

/**
 * The Anthropic Messages wire format. These tests never touch the network: they
 * stub `fetch`, pass a fake key, and assert the exact request shape and the
 * response/error mapping — including that the key can never reach a message.
 */
const baseUrl = 'https://api.anthropic.com/v1';

function anthropicResponse(text: string, extra: Record<string, unknown> = {}): Response {
  return new Response(
    JSON.stringify({
      id: 'msg_1',
      type: 'message',
      role: 'assistant',
      model: 'claude-x',
      content: [{ type: 'text', text }],
      usage: { input_tokens: 11, output_tokens: 7 },
      ...extra,
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}

function providerWith(config: Record<string, unknown> = {}): ReturnType<typeof createHttpProvider> {
  return createHttpProvider({
    baseUrl,
    apiKey: 'sk-ant-secret',
    model: 'claude-x',
    wireFormat: 'anthropic',
    ...config,
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('createHttpProvider (anthropic wire format)', () => {
  it('posts to /messages with x-api-key and anthropic-version, and maps the response', async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => anthropicResponse('hi'));
    vi.stubGlobal('fetch', fetchMock);

    const response = await providerWith().generate({ prompt: 'hello', mode: 'text' });

    expect(response.text).toBe('hi');
    expect(response.simulated).toBe(false);
    expect(response.model).toBe('claude-x');
    expect(response.providerId).toBe('api.anthropic.com');
    expect(response.usage).toEqual({ inputTokens: 11, outputTokens: 7 });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(init.method).toBe('POST');
    const headers = init.headers as Record<string, string>;
    expect(headers['x-api-key']).toBe('sk-ant-secret');
    expect(headers['anthropic-version']).toBe('2023-06-01');
    expect(headers.authorization).toBeUndefined();
  });

  it('maps the body: model, max_tokens and messages, with no system by default', async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => anthropicResponse('ok'));
    vi.stubGlobal('fetch', fetchMock);

    await providerWith().generate({ prompt: 'hello', mode: 'text' });

    const body = JSON.parse(String(fetchMock.mock.calls[0]![1].body));
    expect(body.model).toBe('claude-x');
    expect(body.messages).toEqual([{ role: 'user', content: 'hello' }]);
    expect(typeof body.max_tokens).toBe('number');
    expect(body.system).toBeUndefined();
    expect(body.response_format).toBeUndefined();
  });

  it('sends max_tokens from the request and includes the system prompt', async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => anthropicResponse('ok'));
    vi.stubGlobal('fetch', fetchMock);

    await providerWith().generate({
      system: 'be terse',
      prompt: 'hi',
      mode: 'text',
      maxOutputTokens: 256,
    });

    const body = JSON.parse(String(fetchMock.mock.calls[0]![1].body));
    expect(body.max_tokens).toBe(256);
    expect(body.system).toBe('be terse');
  });

  it('requests JSON in the system prompt for structured mode and validates it', async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) =>
      anthropicResponse('{"answer":42}'),
    );
    vi.stubGlobal('fetch', fetchMock);

    const response = await providerWith().generate({
      prompt: 'q',
      mode: 'structured',
      schema: { type: 'object', required: ['answer'], properties: { answer: { type: 'number' } } },
    });

    expect(response.data).toEqual({ answer: 42 });
    const body = JSON.parse(String(fetchMock.mock.calls[0]![1].body));
    expect(body.system).toMatch(/JSON/i);
    expect(body.response_format).toBeUndefined();
  });

  it('rejects structured output that is not JSON or fails the schema', async () => {
    const provider = providerWith();

    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, _init: RequestInit) => anthropicResponse('nope')),
    );
    await expect(
      provider.generate({ prompt: 'q', mode: 'structured', schema: { type: 'object' } }),
    ).rejects.toMatchObject({ kind: 'invalid-response' });

    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, _init: RequestInit) =>
        anthropicResponse('{"answer":"forty-two"}'),
      ),
    );
    await expect(
      provider.generate({
        prompt: 'q',
        mode: 'structured',
        schema: { type: 'object', properties: { answer: { type: 'number' } } },
      }),
    ).rejects.toMatchObject({ kind: 'invalid-response' });
  });

  it('joins multiple text content blocks and ignores non-text blocks', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async (_url: string, _init: RequestInit) =>
          new Response(
            JSON.stringify({
              model: 'claude-x',
              content: [
                { type: 'text', text: 'Hello ' },
                { type: 'thinking', thinking: 'ignored' },
                { type: 'text', text: 'world' },
              ],
              usage: { input_tokens: 1, output_tokens: 2 },
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          ),
      ),
    );

    const response = await providerWith().generate({ prompt: 'q', mode: 'text' });
    expect(response.text).toBe('Hello world');
  });

  it('rejects a response with no text content', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async (_url: string, _init: RequestInit) =>
          new Response(JSON.stringify({ content: [{ type: 'tool_use' }] }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
      ),
    );

    await expect(providerWith().generate({ prompt: 'q', mode: 'text' })).rejects.toMatchObject({
      kind: 'invalid-response',
    });
  });

  it.each([
    [400, 'invalid-response'],
    [401, 'auth'],
    [403, 'auth'],
    [429, 'rate-limit'],
    [500, 'transport'],
  ] as const)('maps HTTP %i to error kind %s', async (status, kind) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, _init: RequestInit) => new Response('x', { status })),
    );

    await expect(
      providerWith({ maxRetries: 0 }).generate({ prompt: 'q', mode: 'text' }),
    ).rejects.toMatchObject({ kind });
  });

  it('bounds each attempt with a timeout and honours a caller AbortSignal', async () => {
    const stalled = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    );
    vi.stubGlobal('fetch', stalled);

    await expect(
      providerWith({ timeoutMs: 10 }).generate({ prompt: 'q', mode: 'text' }),
    ).rejects.toMatchObject({ kind: 'timeout' });

    const controller = new AbortController();
    const promise = providerWith({ timeoutMs: 10_000 }).generate(
      { prompt: 'q', mode: 'text' },
      controller.signal,
    );
    controller.abort();
    await expect(promise).rejects.toMatchObject({ kind: 'aborted' });
  });

  it('retries a retryable failure then succeeds, but never retries auth', async () => {
    const retryMock = vi
      .fn(async (_url: string, _init: RequestInit) => anthropicResponse('ok'))
      .mockResolvedValueOnce(new Response('boom', { status: 500 }))
      .mockResolvedValueOnce(anthropicResponse('recovered'));
    vi.stubGlobal('fetch', retryMock);

    const response = await providerWith({ maxRetries: 2 }).generate({
      prompt: 'q',
      mode: 'text',
    });
    expect(response.text).toBe('recovered');
    expect(retryMock).toHaveBeenCalledTimes(2);

    const authMock = vi.fn(
      async (_url: string, _init: RequestInit) => new Response('no', { status: 401 }),
    );
    vi.stubGlobal('fetch', authMock);
    await expect(
      providerWith({ maxRetries: 3 }).generate({ prompt: 'q', mode: 'text' }),
    ).rejects.toMatchObject({ kind: 'auth' });
    expect(authMock).toHaveBeenCalledTimes(1);
  });

  it('never echoes the api key in an error message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async (_url: string, _init: RequestInit) =>
          new Response('upstream echoed sk-ant-secret', { status: 500 }),
      ),
    );

    const error = await providerWith({ maxRetries: 0 })
      .generate({ prompt: 'q', mode: 'text' })
      .then(
        () => undefined,
        (thrown: unknown) => thrown,
      );
    expect(error).toBeInstanceOf(ProviderError);
    expect((error as ProviderError).message).not.toContain('sk-ant-secret');
    expect((error as ProviderError).message).toContain('[redacted]');
  });
});
