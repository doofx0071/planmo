import { PRODUCT_SLUG } from '@planmo/shared';

/**
 * The CLI help text. Extracted from `index.ts` so the router stays a router:
 * this is the one place `--help` reads, and `USAGE` is asserted against the real
 * command set by the test suite and `scripts/e2e-phase12-pilots.mjs`.
 */
export const USAGE = [
  `Usage: ${PRODUCT_SLUG} <command> [options]`,
  '',
  'Commands:',
  `  ${PRODUCT_SLUG} init [dir]    create a PlanMo workspace (wizard, or flags)`,
  `  ${PRODUCT_SLUG} status        validate and summarize the workspace`,
  `  ${PRODUCT_SLUG} adopt [dir]    analyze an existing repo, then offer to record it`,
  `  ${PRODUCT_SLUG} plan "<idea>" author the plan document with a model (once)`,
  `  ${PRODUCT_SLUG} generate      generate/refresh the planning workspace`,
  `  ${PRODUCT_SLUG} diff          show what generate would change (writes nothing)`,
  `  ${PRODUCT_SLUG} validate      validate the workspace documents and invariants`,
  `  ${PRODUCT_SLUG} doctor        report environment and workspace health`,
  `  ${PRODUCT_SLUG} next          print the task to work next, and what to read`,
  `  ${PRODUCT_SLUG} task [id]     record a task's status (interactive without args)`,
  `  ${PRODUCT_SLUG} trace [id]    render the requirements -> tasks -> tests trace graph`,
  `  ${PRODUCT_SLUG} handoff       record the current phase's handoff document`,
  `  ${PRODUCT_SLUG} pack          inspect the pack catalog and reconcile the lockfile`,
  `  ${PRODUCT_SLUG} agent init    install command files for your coding agent`,
  `  ${PRODUCT_SLUG} agent list    list the supported agents and their layouts`,
  `  ${PRODUCT_SLUG} provider list show the model-provider presets PlanMo supports`,
  `  ${PRODUCT_SLUG} setup        configure one supported AI model profile`,
  `  ${PRODUCT_SLUG} model [<model-id>] change the saved default profile model`,
  `  ${PRODUCT_SLUG} auth status  show saved profile credential availability`,
  `  ${PRODUCT_SLUG} auth remove <profile-id>  remove profile; remove its OS keyring credential only if one is attached; leave provider environment variables unchanged`,
  `  ${PRODUCT_SLUG} agent apply   validate and record a proposal from an agent`,
  `  ${PRODUCT_SLUG} --version     print the PlanMo version`,
  `  ${PRODUCT_SLUG} --help        show this help`,
  '',
  'init options:',
  '      --name <name>         project display name (default: directory name)',
  '      --type <type>         web-application | cli | library | service |',
  '                            mobile-application | desktop-application | other',
  '      --lifecycle <v>       greenfield | brownfield',
  '      --risk <v>            low | medium | high',
  '      --agent <v>           opencode | claude-code | generic',
  '      --style <v>           minimal | editorial | neobrutalism | soft-product |',
  '                            dense-dashboard | developer-tool | luxury | playful',
  '      --depth <v>           lean | standard | production | high-assurance | custom',
  '      --phase-mode <v>      gated | continuous',
  '      --yes                 accept defaults for anything not provided',
  '      --dry-run             print the plan and write nothing',
  '      --force               overwrite existing unmanaged files',
  '',
  'status options:',
  '      --dir <path>          project root (default: walk up from cwd)',
  '',
  'adopt options:',
  '      --dir <path>          repository root (default: cwd)',
  '      --yes                 report only, never prompt (scripts and CI)',
  '      --dry-run             report only, never prompt',
  '',
  '  adopt prints a read-only report, then offers to write the reports to',
  '  .planmo/adopt/ and to create the workspace. Both prompts default to the safe',
  '  answer; --yes and --dry-run skip them and write nothing, as before.',
  '',
  'task options:',
  '      [id]                  task id, e.g. P00-01 (omit to choose interactively)',
  '      --status <v>          TODO | IN_PROGRESS | BLOCKED | REVIEW | DONE',
  '      --dir <path>          project root (default: cwd)',
  '      --dry-run             report the change and write nothing',
  '',
  '  Status is recorded in .planmo/state.yml, which regeneration preserves. Editing',
  '  the status column of planning/tasks.csv directly does NOT work: that file is',
  '  generated, and the next `planmo generate` resets it to TODO.',
  '',
  'generate options:',
  '      --dir <path>          project root (default: cwd)',
  '      --dry-run             print the plan and write nothing',
  '      --force               overwrite files the manifest already owns',
  '',
  'diff options:',
  '      --dir <path>          project root (default: cwd)',
  '      --exit-code           exit 1 when the planning tree is out of date',
  '',
  'validate options:',
  '      --dir <path>          project root (default: walk up from cwd)',
  '',
  'doctor options:',
  '      --dir <path>          project root (default: cwd)',
  '',
  'next options:',
  '      --dir <path>          project root (default: cwd)',
  '      --print               print the brief to stdout and write nothing (the default)',
  '      --json                emit the brief as machine-readable JSON',
  '',
  'plan options:',
  '      "<idea>"              the project idea, in quotes',
  '      --dir <path>          project root (default: cwd)',
  '      --provider <id>       tokenharbor | openai | anthropic | deepseek |',
  '                            moonshot | xai | openrouter | custom | mock',
  '                            (default: saved profile; otherwise first preset with a nonblank key)',
  '      --model <slug>        model id, e.g. deepseek/deepseek-v4-flash',
  '                            (default: saved profile model)',
  '      --base-url <url>      override the endpoint (required for custom without a saved URL)',
  '      --dry-run             print the plan and write nothing',
  '      --force               overwrite a plan you have edited',
  '',
  '  By default, plan uses the saved default profile for provider, model, endpoint, and keyring reference.',
  '  Explicit --provider, --model, and --base-url flags override saved profile fields.',
  '  A different explicit provider does not inherit the saved model, endpoint, or keyring reference.',
  '  A nonblank environment key takes precedence over the profile keyring credential.',
  '  Without a saved default profile, provider selection is auto-detected from the environment.',
  '  Provider keys come from the provider-named environment variable or the saved profile OS keyring:',
  '  TOKENHARBOR_KEY, OPENAI_API_KEY, ANTHROPIC_API_KEY, DEEPSEEK_API_KEY,',
  '  MOONSHOT_API_KEY, XAI_API_KEY, OPENROUTER_API_KEY, PLANMO_AI_API_KEY.',
  '  Keys are passed to the selected provider only; they are not logged or written to the workspace.',
  '  `planmo generate` remains model-free and never calls a provider.',
  '',
  'trace options:',
  '      --dir <path>          project root (default: cwd)',
  '      [id]                  focus on a requirement/task id (the engine renders',
  '                            the whole graph; the note names the focused node)',
  '',
  'handoff options:',
  '      --dir <path>          project root (default: cwd)',
  '      --dry-run             print the document and write nothing',
  '      --force               overwrite an existing handoff you have edited',
  '',
  'pack options:',
  '      --dir <path>          project root (default: cwd)',
  '      --source <dir>        local directory of pack.yml files to use as the catalog',
  '                            (the only source; no remote registry is ever fetched)',
  '      --dry-run             show what the lockfile would become, write nothing',
  '',
  'provider options:',
  '      list                  list runtime-supported provider presets',
  '                            and their required API-key environment names',
  '',
  'setup options:',
  '      --provider <id>       choose one preset from `planmo provider list`',
  '      --model <id>          enter a model id manually; no discovery request is made',
  '      --base-url <url>      safe HTTPS or loopback HTTP URL for `custom` only',
  '',
  '  A key is entered through a masked prompt and stored in the OS keyring, or',
  '  setup can use the provider-named environment variable. Never pass --api-key.',
  '  A nonblank provider environment variable takes precedence over any saved keyring entry;',
  '  the keyring credential is used only when the variable is blank.',
  '  Provider/model flags run without prompts only when a matching credential exists.',
  '',
  'model options:',
  '      [<model-id>]          set the saved default profile model id directly (no network or prompt)',
  '',
  '  With no id, model requires a terminal and lists models only from a declared provider endpoint',
  '  when a provider credential resolves from the environment or saved keyring reference.',
  '  Provider-reported ids are not a guarantee of PlanMo compatibility; unavailable catalogs',
  '  fall back to ordinary manual model-id entry. Cancelling never changes saved config.',
  '  Only the default profile modelId changes; provider, endpoint, credentials, and other',
  '  profiles are preserved. Use `planmo setup` when no default profile is configured.',
  '',
  'auth options:',
  '      status                show profile id, provider, model, and credential availability',
  '      remove <profile-id>   remove one saved profile; remove its OS keyring credential only if one is attached',
  '                            provider environment variables are unchanged',
  '      --yes                 skip interactive confirmation for remove (required when no TTY is available)',
  '',
  '  Credential values and opaque keyring references are never displayed.',
  '',
  'agent options:',
  '      --agent <id>          any id from `planmo agent list` (comma-separated)',
  '                            omit it to detect and choose interactively',
  '      --dir <path>          project root (default: cwd)',
  '      --global              allow a target that installs outside the project',
  '      --yes                 never prompt: use detection, or --agent',
  '      --force               overwrite files you have edited',
  '      --dry-run             print the plan and write nothing',
  '',
  '  agent apply <proposal.json>  validate a proposal and record it under .planmo/proposals/',
  '                               (plan documents are never rewritten by this command)',
  '',
  'Exit codes: 0 ok · 1 error · 2 collision refused · 3 no project found',
].join('\n');

/** A per-command option block heading inside `USAGE`, e.g. `init options:`. */
const SECTION_HEADING = /^[a-z][a-z-]* options:$/;

/**
 * The help text for ONE command: the usage line, its entry in the command list,
 * and its own option block.
 *
 * This is what makes `planmo <command> --help` safe. Before it existed the flag
 * was not understood at any level below the top, so `init --help` ran the init
 * wizard and `adopt --help` scanned the whole repository before prompting —
 * a help flag that performs the destructive work it should describe.
 */
export function usageFor(command: string): string {
  const lines = USAGE.split('\n');
  const start = lines.indexOf(`${command} options:`);
  if (start < 0) return USAGE;

  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i]!;
    if (SECTION_HEADING.test(line) || line.startsWith('Exit codes:')) {
      end = i;
      break;
    }
  }
  const section = lines.slice(start, end);
  while (section.length > 0 && section[section.length - 1]!.trim() === '') section.pop();

  const commandLine = lines.find(
    (line) =>
      line.trimStart().startsWith(`${PRODUCT_SLUG} ${command} `) ||
      line.trimStart() === `${PRODUCT_SLUG} ${command}`,
  );
  return [lines[0]!, '', ...(commandLine === undefined ? [] : [commandLine, '']), ...section].join(
    '\n',
  );
}
