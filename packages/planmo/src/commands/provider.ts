import { describeProviders } from '@planmo/ai';
import type { CliIO } from '../cli-io.js';

function protocolLabel(wireFormat: 'openai' | 'anthropic'): string {
  return wireFormat === 'anthropic' ? 'Anthropic Messages' : 'OpenAI-compatible';
}

/** List the provider presets PlanMo actually implements, without reading secrets. */
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
  io.out(`PlanMo model providers (${presets.length} presets)`);
  for (const preset of presets) {
    const label = preset.id === 'custom' ? 'Custom endpoint' : preset.label;
    const details = [
      protocolLabel(preset.wireFormat),
      `API key via ${preset.credentialEnv}`,
      ...(preset.id === 'custom' ? ['base URL required'] : []),
    ].join('; ');
    io.out(`- \`${preset.id}\` — ${label} (${details})`);
  }
  io.out('OAuth/account-plan sign-in is not supported by this release.');
  return 0;
}
