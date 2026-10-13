import { describe, expect, it } from 'vitest';
import { PROVIDER_PRESETS } from '@planmo/ai';
import { run } from '../index.js';

function capture() {
  const out: string[] = [];
  const err: string[] = [];
  return {
    io: { out: (line: string) => out.push(line), err: (line: string) => err.push(line) },
    out,
    err,
  };
}

describe('planmo provider list', () => {
  it('lists only the current runtime presets and never prints credential values', async () => {
    const { io, out, err } = capture();
    const code = await run(['provider', 'list'], io);
    const text = out.join('\n');
    const rows = out.filter((line) => line.startsWith('- `'));

    expect(code).toBe(0);
    expect(err).toEqual([]);
    expect(text).toContain(`model providers (${PROVIDER_PRESETS.length} presets)`);
    expect(rows).toHaveLength(PROVIDER_PRESETS.length);
    for (const preset of PROVIDER_PRESETS) {
      const label = preset.id === 'custom' ? 'Custom endpoint' : preset.label;
      expect(text).toContain(`- \`${preset.id}\` — ${label}`);
      expect(text).toContain(preset.credentialEnv);
    }
    expect(text).toContain(
      '- `custom` — Custom endpoint (OpenAI-compatible; API key via PLANMO_AI_API_KEY; base URL required)',
    );
    expect(text).not.toMatch(/(?:sk-[A-Za-z0-9]{12,}|thk_live_[A-Za-z0-9]{8,})/);
    expect(text).not.toContain('AGENT_TARGETS');
  });

  it('rejects unknown provider subcommands', async () => {
    const { io, err } = capture();
    const code = await run(['provider', 'login'], io);

    expect(code).toBe(1);
    expect(err.join('\n')).toContain("unknown provider subcommand 'login'");
  });
});
