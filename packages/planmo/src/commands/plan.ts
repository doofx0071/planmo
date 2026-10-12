import { resolve } from 'node:path';
import { createHttpProvider, createMockProvider, resolveProvider } from '@planmo/ai';
import { ProjectNotFoundError, readStatus } from '@planmo/core';
import { parseArgs, type CliIO } from '../cli-io.js';
import { runPlan, renderPlanSummary } from '../plan.js';
import { mockPlanResponse } from '../plan-build.js';

/**
 * `planmo plan` — author `.planmo/plan.yml` with a model, once (ADR-0027).
 *
 * The model never runs inside `generate`; this command is the single place a
 * provider is called, and its output is validated before it is written.
 */
export async function runPlanCommand(argv: string[], io: CliIO): Promise<number> {
  const { flags, positional } = parseArgs(argv);
  const root = resolve(flags.get('dir') ?? process.cwd());
  const idea = (flags.get('idea') ?? positional.join(' ')).trim();
  if (idea === '') {
    io.err('planmo plan: an idea is required');
    io.err('  usage: planmo plan "<idea>" [--dir <path>] [--provider <id>] [--model <slug>]');
    return 1;
  }

  // The workspace check comes BEFORE provider resolution, deliberately. A user in
  // the wrong directory should be told that, not told to set an API key — and it
  // keeps the documented exit contract (3 = no project found here) true regardless
  // of what credentials happen to be configured.
  try {
    await readStatus({ root });
  } catch (err) {
    if (err instanceof ProjectNotFoundError) {
      io.err(`planmo plan: ${(err as Error).message}`);
      return 3;
    }
    throw err;
  }

  const requested = flags.get('provider');
  const model = flags.get('model');
  const baseUrl = flags.get('base-url');

  let provider;
  let providerId: string;
  let modelId: string;

  if (requested === 'mock') {
    // Explicitly requested, never selected implicitly: the mock exists so the whole
    // path can be exercised offline, and it says plainly that it is simulated.
    provider = createMockProvider({ text: mockPlanResponse(idea) });
    providerId = 'mock';
    modelId = model ?? 'mock';
    io.err('note: using the mock provider — output is simulated, not a real model.');
  } else {
    const resolved = resolveProvider({
      ...(requested !== undefined ? { preset: requested } : {}),
      ...(model !== undefined ? { model } : {}),
      ...(baseUrl !== undefined ? { baseUrl } : {}),
    });

    if (!resolved.configured) {
      io.err(`planmo plan: no model provider is configured (${resolved.reason}).`);
      if (resolved.reason === 'missing-credential' && resolved.preset !== undefined) {
        io.err(`  set ${resolved.preset.credentialEnv} to use ${resolved.preset.label}.`);
      } else if (resolved.reason === 'missing-base-url') {
        io.err('  the custom preset needs --base-url <url>.');
      } else {
        io.err('  set one of: TOKENHARBOR_KEY, OPENAI_API_KEY, ANTHROPIC_API_KEY,');
        io.err('             DEEPSEEK_API_KEY, MOONSHOT_API_KEY, XAI_API_KEY, OPENROUTER_API_KEY');
      }
      io.err('  or run with --provider mock to exercise the flow offline.');
      return 1;
    }

    provider = createHttpProvider({
      baseUrl: resolved.baseUrl,
      apiKey: process.env[resolved.preset.credentialEnv] ?? '',
      model: resolved.model ?? '',
      wireFormat: resolved.wireFormat,
    });
    providerId = resolved.preset.id;
    modelId = resolved.model ?? '';
  }

  if (modelId === '') {
    io.err('planmo plan: a model is required — pass --model <slug>.');
    io.err('  e.g. --provider tokenharbor --model deepseek/deepseek-v4-flash');
    return 1;
  }

  try {
    const outcome = await runPlan({
      root,
      idea,
      provider,
      providerId,
      model: modelId,
      ...(flags.has('dry-run') ? { dryRun: true } : {}),
      ...(flags.has('force') ? { allowOverwrite: true } : {}),
    });
    io.out(renderPlanSummary(outcome));
    // A plan that failed validation is a failure of the command: nothing was
    // written, and the caller needs to know that. A refused overwrite is the
    // documented collision code, like every other writing command.
    if (!outcome.ok) return 1;
    return outcome.collisions.length > 0 ? 2 : 0;
  } catch (err) {
    io.err(`planmo plan: ${(err as Error).message}`);
    return err instanceof ProjectNotFoundError ? 3 : 1;
  }
}
