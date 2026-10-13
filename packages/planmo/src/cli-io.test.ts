import { CANCEL_SYMBOL } from '@clack/prompts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { terminalWizard } from './cli-io.js';

const { passwordPrompt } = vi.hoisted(() => ({
  passwordPrompt: vi.fn(),
}));

// Mock only Clack's prompt boundary so these tests exercise terminalWizard's
// real guard/cancellation/output behavior without an interactive terminal.
vi.mock('@clack/prompts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@clack/prompts')>();
  return { ...actual, password: passwordPrompt };
});

async function withTTY<T>(
  stdinTTY: boolean,
  stdoutTTY: boolean,
  run: () => Promise<T>,
): Promise<T> {
  const stdin = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY');
  const stdout = Object.getOwnPropertyDescriptor(process.stdout, 'isTTY');
  Object.defineProperty(process.stdin, 'isTTY', { value: stdinTTY, configurable: true });
  Object.defineProperty(process.stdout, 'isTTY', { value: stdoutTTY, configurable: true });
  try {
    return await run();
  } finally {
    for (const [stream, descriptor] of [
      [process.stdin, stdin],
      [process.stdout, stdout],
    ] as const) {
      if (descriptor === undefined) delete (stream as { isTTY?: boolean }).isTTY;
      else Object.defineProperty(stream, 'isTTY', descriptor);
    }
  }
}

beforeEach(() => passwordPrompt.mockReset());
afterEach(() => vi.restoreAllMocks());

describe('terminalWizard.password', () => {
  it('uses Clack password input and returns the secret without routing it to output', async () => {
    const syntheticSecret = 'synthetic-test-secret';
    passwordPrompt.mockResolvedValueOnce(syntheticSecret);
    const prompt = vi.spyOn(terminalWizard, 'prompt');
    const out = vi.spyOn(terminalWizard, 'out');
    const stdoutWrite = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const stderrWrite = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const answer = await withTTY(true, true, () =>
      terminalWizard.password('Synthetic secret question'),
    );

    expect(passwordPrompt).toHaveBeenCalledExactlyOnceWith({
      message: 'Synthetic secret question',
    });
    expect(answer).toBe(syntheticSecret);
    expect(prompt).not.toHaveBeenCalled();
    expect(out).not.toHaveBeenCalled();
    expect(stdoutWrite.mock.calls.flat().join(' ')).not.toContain(syntheticSecret);
    expect(stderrWrite.mock.calls.flat().join(' ')).not.toContain(syntheticSecret);
    expect(consoleLog.mock.calls.flat().join(' ')).not.toContain(syntheticSecret);
    expect(consoleError.mock.calls.flat().join(' ')).not.toContain(syntheticSecret);
  });

  it('returns undefined when Clack reports cancellation', async () => {
    passwordPrompt.mockResolvedValueOnce(CANCEL_SYMBOL);

    const answer = await withTTY(true, true, () =>
      terminalWizard.password('Synthetic secret question'),
    );

    expect(passwordPrompt).toHaveBeenCalledExactlyOnceWith({
      message: 'Synthetic secret question',
    });
    expect(answer).toBeUndefined();
  });

  it('rejects before Clack when stdin is not a TTY and stdout is', async () => {
    await expect(
      withTTY(false, true, () => terminalWizard.password('Synthetic secret question')),
    ).rejects.toThrow('needs a terminal');

    expect(passwordPrompt).not.toHaveBeenCalled();
  });

  it('rejects before Clack when stdout is not a TTY and stdin is', async () => {
    await expect(
      withTTY(true, false, () => terminalWizard.password('Synthetic secret question')),
    ).rejects.toThrow('needs a terminal');

    expect(passwordPrompt).not.toHaveBeenCalled();
  });
});
