import { describe, expect, it } from 'vitest';
import { ProviderError } from './contracts.js';
import type { ModelRequest } from './contracts.js';
import { createMockProvider } from './mock.js';
import { validateAgainstSchema } from './structured.js';

const textRequest = (prompt = 'hello world'): ModelRequest => ({ prompt, mode: 'text' });

describe('createMockProvider', () => {
  it('is deterministic: identical input yields byte-identical output', async () => {
    const provider = createMockProvider();
    const request: ModelRequest = {
      system: 'be terse',
      prompt: 'summarize the plan',
      mode: 'text',
    };
    const first = await provider.generate(request);
    const second = await provider.generate(request);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(second).toEqual(first);

    const structured: ModelRequest = {
      prompt: 'extract fields',
      mode: 'structured',
      schema: { type: 'object', properties: { name: { type: 'string' }, n: { type: 'integer' } } },
    };
    expect(await provider.generate(structured)).toEqual(await provider.generate(structured));
  });

  it('always reports simulated: true, and exposes id/model/capabilities defaults', async () => {
    const provider = createMockProvider();
    expect(provider.id).toBe('mock');
    expect(provider.model).toBe('mock-1');
    expect(provider.capabilities).toEqual({
      structuredOutput: true,
      streaming: false,
      toolCalling: false,
    });
    expect((await provider.generate(textRequest())).simulated).toBe(true);

    const custom = createMockProvider({
      id: 'mock-2',
      model: 'mock-model-2',
      capabilities: { streaming: true },
    });
    expect(custom.id).toBe('mock-2');
    expect(custom.model).toBe('mock-model-2');
    expect(custom.capabilities).toEqual({
      structuredOutput: true,
      streaming: true,
      toolCalling: false,
    });
    expect((await custom.generate(textRequest())).simulated).toBe(true);
  });

  it('echoes the prompt in text mode and omits data', async () => {
    const provider = createMockProvider();
    const response = await provider.generate({
      system: 'sys',
      prompt: 'user',
      mode: 'text',
    });
    expect(response.text).toBe('sys\nuser');
    expect(response.data).toBeUndefined();
  });

  it('synthesizes schema-valid structured output by default', async () => {
    const provider = createMockProvider();
    const schema = {
      type: 'object',
      required: ['name', 'count', 'tags'],
      properties: {
        name: { type: 'string' },
        count: { type: 'integer' },
        tags: { type: 'array', items: { type: 'string' } },
      },
    };
    const response = await provider.generate({ prompt: 'q', mode: 'structured', schema });
    expect(response.simulated).toBe(true);
    expect(validateAgainstSchema(response.data, schema)).toEqual({ valid: true });
    expect(response.text).toBe(JSON.stringify(response.data));
  });

  it('returns canned structured data when it validates', async () => {
    const provider = createMockProvider({ data: { answer: 42 } });
    const response = await provider.generate({
      prompt: 'q',
      mode: 'structured',
      schema: { type: 'object', required: ['answer'], properties: { answer: { type: 'number' } } },
    });
    expect(response.data).toEqual({ answer: 42 });
    expect(response.simulated).toBe(true);
  });

  it('rejects structured output that fails the schema', async () => {
    const provider = createMockProvider({ data: { answer: 'forty-two' } });
    const error = await provider
      .generate({
        prompt: 'q',
        mode: 'structured',
        schema: {
          type: 'object',
          properties: { answer: { type: 'number' } },
        },
      })
      .then(
        () => undefined,
        (thrown: unknown) => thrown,
      );
    expect(error).toBeInstanceOf(ProviderError);
    expect((error as ProviderError).kind).toBe('invalid-response');
  });

  it('rejects structured mode when no schema is supplied', async () => {
    const provider = createMockProvider();
    await expect(provider.generate({ prompt: 'q', mode: 'structured' })).rejects.toMatchObject({
      kind: 'invalid-response',
    });
  });

  it('reports deterministic token counts', async () => {
    const provider = createMockProvider();
    const request = textRequest('a'.repeat(8));
    const first = await provider.generate(request);
    const second = await provider.generate(request);
    expect(first.usage).toEqual({ inputTokens: 2, outputTokens: 2 });
    expect(second.usage).toEqual(first.usage);
  });

  it('honours an already-aborted signal', async () => {
    const provider = createMockProvider();
    const controller = new AbortController();
    controller.abort();
    await expect(provider.generate(textRequest(), controller.signal)).rejects.toMatchObject({
      kind: 'aborted',
    });
  });
});
