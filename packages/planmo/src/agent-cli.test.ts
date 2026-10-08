import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { run } from './index.js';

// Detection also reads the global `~/.hermes` marker, so point it at an empty
// home: the machine's real setup must not change what these tests expect.
process.env.PLANMO_HOME = await mkdtemp(join(tmpdir(), 'planmo-home-'));

/**
 * The guided `planmo agent init`: detection pre-checks the multi-select, the user
 * can override it, and cancelling writes nothing.
 *
 * `run` only prompts on a real terminal, so these tests force `isTTY` for the
 * duration of the call — the interactive branch is the one under test.
 */
function capture() {
  const out: string[] = [];
  const err: string[] = [];
  return { io: { out: (l: string) => out.push(l), err: (l: string) => err.push(l) }, out, err };
}

/** Force the interactive branch, then restore the real streams. */
async function asTty<T>(fn: () => Promise<T>): Promise<T> {
  const stdin = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY');
  const stdout = Object.getOwnPropertyDescriptor(process.stdout, 'isTTY');
  Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });
  Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });
  try {
    return await fn();
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

async function workspace(markers: string[] = []): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'planmo-agent-cli-'));
  const init = capture();
  expect(await run(['init', root, '--yes'], init.io)).toBe(0);
  for (const marker of markers) {
    await mkdir(join(root, marker), { recursive: true });
  }
  return root;
}

interface Script {
  picked?: string[] | undefined;
  /** Answers for each `confirm` in order; the last value repeats. */
  confirms?: boolean[] | undefined;
}

/** A wizard that records what it was asked and answers from the script. */
function scripted(script: Script) {
  const seen: {
    choices?: { value: string | boolean | number }[];
    initial?: readonly (string | boolean | number)[];
    prompts: string[];
  } = {
    prompts: [],
  };
  let confirms = 0;
  const wizard = {
    prompt: async () => 'x',
    select: async () => undefined,
    multiSelect: async <T extends string | boolean | number>(
      question: string,
      choices: { value: T; label: string }[],
      initial: readonly T[],
    ): Promise<T[] | undefined> => {
      seen.prompts.push(question);
      seen.choices = choices;
      seen.initial = initial;
      return script.picked as T[] | undefined;
    },
    confirm: async (question: string): Promise<boolean | undefined> => {
      seen.prompts.push(question);
      const answers = script.confirms ?? [true];
      return answers[Math.min(confirms++, answers.length - 1)];
    },
    out: () => {},
  };
  return { wizard, seen };
}

describe('planmo agent init — guided flow', () => {
  it('pre-checks what was detected and installs the selection', async () => {
    const root = await workspace(['.opencode']);
    const { wizard, seen } = scripted({ picked: ['opencode'], confirms: [true] });
    const { io, out } = capture();

    const code = await asTty(() => run(['agent', 'init', '--dir', root], io, wizard));

    expect(code).toBe(0);
    expect(seen.initial).toEqual(['opencode']);
    expect(out.join('\n')).toContain('.opencode/commands/planmo-next.md');
    expect(existsSync(join(root, '.opencode/commands/planmo-next.md'))).toBe(true);
  });

  it('offers every supported agent, not just the detected ones', async () => {
    const root = await workspace(['.opencode']);
    const { wizard, seen } = scripted({ picked: ['opencode'], confirms: [true] });
    await asTty(() => run(['agent', 'init', '--dir', root], capture().io, wizard));

    const ids = (seen.choices ?? []).map((choice) => choice.value);
    expect(ids).toContain('opencode');
    expect(ids).toContain('claude-code');
    expect(ids).toContain('codex');
    expect(ids).toContain('hermes');
  });

  it('asks what was detected before asking which to install', async () => {
    const root = await workspace(['.opencode']);
    const { wizard, seen } = scripted({ picked: ['opencode'], confirms: [true] });
    await asTty(() => run(['agent', 'init', '--dir', root], capture().io, wizard));

    expect(seen.prompts[0]).toContain('Which agent(s)');
    expect(seen.prompts[1]).toContain('Install 1 command set(s) now?');
  });

  it('installs every agent the user picked', async () => {
    const root = await workspace();
    const { wizard } = scripted({ picked: ['opencode', 'claude-code'], confirms: [true] });

    expect(await asTty(() => run(['agent', 'init', '--dir', root], capture().io, wizard))).toBe(0);
    expect(existsSync(join(root, '.opencode/commands/planmo-next.md'))).toBe(true);
    expect(existsSync(join(root, '.claude/skills/planmo-next/SKILL.md'))).toBe(true);
  });

  it('writes nothing when the selection is cancelled', async () => {
    const root = await workspace(['.opencode']);
    const { wizard } = scripted({ picked: undefined });
    const { io, out } = capture();

    expect(await asTty(() => run(['agent', 'init', '--dir', root], io, wizard))).toBe(0);
    expect(out.join('\n')).toContain('Cancelled');
    expect(existsSync(join(root, '.opencode/commands'))).toBe(false);
  });

  it('writes nothing when the user declines the confirmation', async () => {
    const root = await workspace(['.opencode']);
    const { wizard } = scripted({ picked: ['opencode'], confirms: [false] });
    const { io, out } = capture();

    expect(await asTty(() => run(['agent', 'init', '--dir', root], io, wizard))).toBe(0);
    expect(out.join('\n')).toContain('nothing was written');
    expect(existsSync(join(root, '.opencode/commands'))).toBe(false);
  });

  it('writes nothing when the user selects nothing', async () => {
    const root = await workspace();
    const { wizard } = scripted({ picked: [] });
    const { io, out } = capture();

    expect(await asTty(() => run(['agent', 'init', '--dir', root], io, wizard))).toBe(0);
    expect(out.join('\n')).toContain('Nothing selected');
    expect(await readdir(root)).not.toContain('.opencode');
  });

  it('asks before installing a target that lives outside the project', async () => {
    const root = await workspace();
    const { wizard, seen } = scripted({ picked: ['hermes'], confirms: [true, false] });
    const { io, out } = capture();

    expect(await asTty(() => run(['agent', 'init', '--dir', root], io, wizard))).toBe(0);
    expect(seen.prompts.join('\n')).toContain('outside this project');
    expect(out.join('\n')).toContain('Skipped hermes');
  });
});

describe('planmo agent init — without a terminal', () => {
  it('uses detection instead of prompting', async () => {
    const root = await workspace(['.opencode']);
    const { io, out } = capture();

    expect(await run(['agent', 'init', '--dir', root], io)).toBe(0);
    expect(out.join('\n')).toContain('Detected opencode');
    expect(existsSync(join(root, '.opencode/commands/planmo-next.md'))).toBe(true);
  });

  it('never auto-installs a global target without --global', async () => {
    const root = await workspace();
    const home = await mkdtemp(join(tmpdir(), 'planmo-home-'));
    await mkdir(join(home, '.hermes'), { recursive: true });
    const previous = process.env.PLANMO_HOME;
    process.env.PLANMO_HOME = home;
    try {
      const { io, out } = capture();
      expect(await run(['agent', 'init', '--dir', root], io)).toBe(0);
      expect(out.join('\n')).toContain('pass --global to include it');
      expect(existsSync(join(home, '.hermes/skills'))).toBe(false);
    } finally {
      process.env.PLANMO_HOME = previous;
    }
  });

  it('errors when nothing is detected and no flag was given', async () => {
    const root = await workspace();
    const { io, err } = capture();

    expect(await run(['agent', 'init', '--dir', root], io)).toBe(1);
    expect(err.join('\n')).toContain('no coding agent detected');
    expect(err.join('\n')).toContain('--agent');
  });

  it('--agent installs without prompting even on a terminal', async () => {
    const root = await workspace();
    const { wizard } = scripted({ picked: ['opencode'], confirms: [true] });
    const { io } = capture();

    const code = await asTty(() =>
      run(['agent', 'init', '--dir', root, '--agent', 'codex'], io, wizard),
    );

    expect(code).toBe(0);
    expect(existsSync(join(root, '.agents/skills/planmo-next/SKILL.md'))).toBe(true);
  });

  it('--agent accepts a comma-separated list', async () => {
    const root = await workspace();
    const { io } = capture();

    expect(
      await run(['agent', 'init', '--dir', root, '--agent', 'opencode, claude-code'], io),
    ).toBe(0);
    expect(existsSync(join(root, '.opencode/commands/planmo-next.md'))).toBe(true);
    expect(existsSync(join(root, '.claude/skills/planmo-next/SKILL.md'))).toBe(true);
  });

  it('--yes never prompts', async () => {
    const root = await workspace(['.claude']);
    const { wizard } = scripted({ picked: ['opencode'], confirms: [true] });
    const { io } = capture();

    expect(await asTty(() => run(['agent', 'init', '--dir', root, '--yes'], io, wizard))).toBe(0);
    expect(existsSync(join(root, '.claude/skills/planmo-next/SKILL.md'))).toBe(true);
    expect(existsSync(join(root, '.opencode'))).toBe(false);
  });
});

describe('planmo agent list', () => {
  it('lists every agent with its directory', async () => {
    const { io, out } = capture();
    expect(await run(['agent', 'list'], io)).toBe(0);
    const text = out.join('\n');
    for (const id of ['opencode', 'claude-code', 'codex', 'copilot', 'generic', 'hermes']) {
      expect(text).toContain(id);
    }
    expect(text).toContain('.opencode/commands');
  });
});

describe('USAGE', () => {
  it('documents the guided agent command', async () => {
    const { io, out } = capture();
    await run(['--help'], io);
    const text = out.join('\n');
    expect(text).toContain('agent init');
    expect(text).toContain('agent list');
    expect(text).toContain('omit it to choose interactively');
    expect(text).toContain('--global');
  });
});
