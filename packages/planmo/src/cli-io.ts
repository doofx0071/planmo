import { createInterface } from 'node:readline/promises';
import { stdin as nodeStdin, stdout as nodeStdout } from 'node:process';
import * as clack from '@clack/prompts';

/**
 * CLI input/output and interactive prompts — the boundary between the command
 * handlers and the terminal.
 *
 * Extracted from `index.ts` (Stage 6 of the reliability pass). The router and the
 * handlers depend on these interfaces, not on `@clack/prompts` or `readline`, so a
 * test drives any command with an injected `CliIO`/`WizardIO` and the terminal
 * stays an implementation detail of this one module.
 */

/** Where a command writes its output. Injected so tests capture instead of print. */
export interface CliIO {
  out: (line: string) => void;
  err: (line: string) => void;
}

/** The default sink: straight to stdout/stderr. */
export const defaultIO: CliIO = {
  out: (line) => console.log(line),
  err: (line) => console.error(line),
};

/** Minimal `--flag value` / `--flag=value` parser (no external dep). */
export function parseArgs(argv: string[]): { flags: Map<string, string>; positional: string[] } {
  const flags = new Map<string, string>();
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg.startsWith('--')) {
      const eq = arg.indexOf('=');
      if (eq >= 0) {
        flags.set(arg.slice(2, eq), arg.slice(eq + 1));
      } else {
        const next = argv[i + 1];
        if (next !== undefined && !next.startsWith('--')) {
          flags.set(arg.slice(2), next);
          i++;
        } else {
          flags.set(arg.slice(2), 'true');
        }
      }
    } else {
      positional.push(arg);
    }
  }
  return { flags, positional };
}

/** Prompt values must be primitives — that is all a terminal prompt can render. */
type WizardValue = string | boolean | number;

/** One choice in a select or multi-select prompt. */
interface WizardChoice<T extends WizardValue> {
  value: T;
  label: string;
  hint?: string;
}

export interface WizardIO {
  prompt: (question: string, dflt?: string) => Promise<string>;
  /** Arrow-key single select. `undefined` means the user cancelled. */
  select: <T extends WizardValue>(
    question: string,
    choices: WizardChoice<T>[],
  ) => Promise<T | undefined>;
  /** Arrow-key multi select, with `initial` pre-checked. `undefined` = cancelled. */
  multiSelect: <T extends WizardValue>(
    question: string,
    choices: WizardChoice<T>[],
    initial: readonly T[],
  ) => Promise<T[] | undefined>;
  /** Yes/no confirmation. `undefined` means the user cancelled. */
  confirm: (question: string, dflt: boolean) => Promise<boolean | undefined>;
  out: (line: string) => void;
}

export const terminalWizard: WizardIO = {
  prompt: async (question: string, dflt?: string) => {
    const rl = createInterface({ input: nodeStdin, output: nodeStdout });
    try {
      const suffix = dflt !== undefined ? ` [${dflt}]` : '';
      const answer = await rl.question(`${question}${suffix}: `);
      return answer.trim() === '' && dflt !== undefined ? dflt : answer.trim();
    } finally {
      rl.close();
    }
  },
  select: async <T extends WizardValue>(
    question: string,
    choices: WizardChoice<T>[],
  ): Promise<T | undefined> => {
    // clack types its options as `Option<Value>`, a conditional type over `Value`
    // that TypeScript cannot reduce while `Value` is still a type parameter. The
    // shapes are identical, so the list passes through unchanged.
    const opts = { message: question, options: choices } as unknown as Parameters<
      typeof clack.select<T>
    >[0];
    const answer = await clack.select<T>(opts);
    return clack.isCancel(answer) ? undefined : answer;
  },
  multiSelect: async <T extends WizardValue>(
    question: string,
    choices: WizardChoice<T>[],
    initial: readonly T[],
  ): Promise<T[] | undefined> => {
    const opts = {
      message: question,
      options: choices,
      initialValues: [...initial],
      required: false,
    } as unknown as Parameters<typeof clack.multiselect<T>>[0];
    const answer = await clack.multiselect<T>(opts);
    return clack.isCancel(answer) ? undefined : answer;
  },
  confirm: async (question: string, dflt: boolean): Promise<boolean | undefined> => {
    const answer = await clack.confirm({ message: question, initialValue: dflt });
    return clack.isCancel(answer) ? undefined : answer;
  },
  out: (line) => console.log(line),
};
