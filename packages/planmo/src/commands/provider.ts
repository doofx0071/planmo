import { describeProviders } from '@planmo/ai';
import { AGENT_TARGETS } from '@planmo/agent-bridge';
import type { CliIO } from '../cli-io.js';

/** The one status this command may print: every row it lists is callable today. */
const RUNTIME_SUPPORTED = 'runtime-supported';

function protocolLabel(wireFormat: 'openai' | 'anthropic'): string {
  return wireFormat === 'anthropic' ? 'Anthropic Messages' : 'OpenAI-compatible';
}

/**
 * List the provider presets PlanMo actually implements, without reading secrets.
 *
 * Every row printed here is `runtime-supported`: it declares a wire format, a
 * credential env name and a request path with a test behind it. The two other
 * inventories are deliberately NOT listed as providers, and their counts are
 * reported separately so neither can be read as one:
 *   - the coding-agent install targets in `@planmo/agent-bridge` are for COMMAND
 *     INSTALLATION, not model inference;
 *   - the candidate rows in `docs/06-agent-engine/provider-catalog.md` are
 *     discovery metadata from a provider catalog, not verified PlanMo adapters.
 *
 * The two registries are separate namespaces, so an id may appear in both:
 * `opencode` is a coding-agent install target AND the OpenCode Console inference
 * preset. They are different things that share a vendor name, which is exactly
 * why neither list may be read as the other.
 */
export function runProviderCommand(argv: string[], io: CliIO): number {
  const [subcommand, ...rest] = argv;
  if (subcommand !== 'list' || rest.length > 0) {
    const requested = subcommand ?? '';
    io.err(`planmo provider: unknown provider subcommand '${requested}'`);
    io.err("Run 'planmo provider --help' for usage.");
    return 1;
  }

  // Passing an empty env is intentional: this is a capability inventory, not an
  // auth-status command. It must not inspect or reveal credential values.
  const presets = describeProviders({});
  io.out(`PlanMo model providers (${presets.length} ${RUNTIME_SUPPORTED} presets)`);
  for (const preset of presets) {
    const label = preset.id === 'custom' ? 'Custom endpoint' : preset.label;
    const details = [
      RUNTIME_SUPPORTED,
      protocolLabel(preset.wireFormat),
      `API key via ${preset.credentialEnv}`,
      ...(preset.id === 'custom' ? ['base URL required'] : []),
    ].join('; ');
    io.out(`- \`${preset.id}\` — ${label} (${details})`);
  }
  io.out(
    `Not providers: ${AGENT_TARGETS.length} coding-agent install targets (@planmo/agent-bridge) ` +
      'and the discovery-only candidate rows in docs/06-agent-engine/provider-catalog.md.',
  );
  io.out('OAuth/account-plan sign-in is not supported by this release.');
  return 0;
}
