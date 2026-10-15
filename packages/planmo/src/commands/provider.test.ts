import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { AGENT_TARGETS } from '@planmo/agent-bridge';
import { PROVIDER_PRESETS, providerPreset } from '@planmo/ai';
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

/**
 * The candidate catalog is DISCOVERY metadata, not a support matrix. Read the
 * committed table so the test compares two real artifacts rather than a
 * hand-written list against another hand-written list.
 */
function catalogRows(): Array<{ id: string; status: string }> {
  const doc = readFileSync(
    fileURLToPath(new URL('../../../../docs/06-agent-engine/provider-catalog.md', import.meta.url)),
    'utf8',
  );
  return doc
    .split('\n')
    .filter((line) => /^\|\s*`[^`]+`\s*\|/.test(line))
    .map((line) => {
      const cells = line
        .trim()
        .replace(/^\|/, '')
        .replace(/\|$/, '')
        .split('|')
        .map((cell) => cell.trim());
      return { id: cells[0]?.replace(/`/g, '') ?? '', status: cells[8] ?? '' };
    });
}

describe('planmo provider list', () => {
  it('lists only the current runtime presets and never prints credential values', async () => {
    const { io, out, err } = capture();
    const code = await run(['provider', 'list'], io);
    const text = out.join('\n');
    const rows = out.filter((line) => line.startsWith('- `'));

    expect(code).toBe(0);
    expect(err).toEqual([]);
    expect(text).toContain(
      `model providers (${PROVIDER_PRESETS.length} runtime-supported presets)`,
    );
    expect(rows).toHaveLength(PROVIDER_PRESETS.length);
    for (const preset of PROVIDER_PRESETS) {
      const label = preset.id === 'custom' ? 'Custom endpoint' : preset.label;
      expect(text).toContain(`- \`${preset.id}\` — ${label}`);
      expect(text).toContain(preset.credentialEnv);
    }
    expect(text).toContain(
      '- `custom` — Custom endpoint (runtime-supported; OpenAI-compatible; API key via PLANMO_AI_API_KEY; base URL required)',
    );
    expect(text).not.toMatch(/(?:sk-[A-Za-z0-9]{12,}|thk_live_[A-Za-z0-9]{8,})/);
    expect(text).not.toContain('AGENT_TARGETS');
  });

  it('labels every listed row with its status', async () => {
    const { io, out } = capture();
    await run(['provider', 'list'], io);
    const rows = out.filter((line) => line.startsWith('- `'));

    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row, row).toMatch(/^- `[^`]+` — .+ \(runtime-supported;/);
    }
  });

  it('reports the agent-target count separately and offers no agent target as a provider', async () => {
    const { io, out } = capture();
    await run(['provider', 'list'], io);
    const text = out.join('\n');
    const offeredIds = out
      .filter((line) => line.startsWith('- `'))
      .map((line) => /^- `([^`]+)`/.exec(line)?.[1] ?? '');

    // The count is reported, and it is the OTHER inventory's count.
    expect(text).toContain(`Not providers: ${AGENT_TARGETS.length} coding-agent install targets`);
    expect(text).toContain('docs/06-agent-engine/provider-catalog.md');
    expect(AGENT_TARGETS.length).toBeGreaterThan(0);

    // The two registries are separate namespaces, so an id may legitimately be
    // both: `opencode` is the coding-agent CLI target AND the OpenCode Console
    // inference preset. What must never happen is an agent target that is NOT a
    // preset leaking into the provider list — that is the conflation this guards.
    const presetIds = new Set(PROVIDER_PRESETS.map((preset) => preset.id));
    const agentIds = new Set(AGENT_TARGETS.map((target) => target.id));
    expect([...agentIds].filter((id) => presetIds.has(id))).toEqual(['opencode']);
    for (const id of offeredIds) {
      expect(agentIds.has(id) && !presetIds.has(id), id).toBe(false);
    }
  });

  it('offers the setup picker runtime-supported rows only, and keeps candidates out of it', async () => {
    // The setup wizard builds its provider menu from PROVIDER_PRESETS, so the
    // picker can only contain runtime-supported rows when that table and the
    // candidate catalog agree. Assert both directions against the real doc.
    const rows = catalogRows();
    expect(rows.length).toBeGreaterThan(0);

    const presetIds = PROVIDER_PRESETS.map((preset) => preset.id);
    const catalogRuntime = rows
      .filter((row) => row.status === 'runtime-supported')
      .map((row) => row.id);
    expect(catalogRuntime.length).toBeGreaterThan(0);

    // A catalog row claiming runtime support must actually be a preset...
    for (const id of catalogRuntime) expect(presetIds, id).toContain(id);

    // ...and no row this catalog does NOT mark runtime-supported may be offered.
    const notRuntime = new Set(
      rows.filter((row) => row.status !== 'runtime-supported').map((row) => row.id),
    );
    for (const id of presetIds) expect(notRuntime.has(id), id).toBe(false);

    // Every offered row is callable: a wire format, an endpoint and a credential name.
    for (const preset of PROVIDER_PRESETS) {
      expect(providerPreset(preset.id)?.id).toBe(preset.id);
      expect(['openai', 'anthropic'], preset.id).toContain(preset.wireFormat);
      expect(preset.credentialEnv, preset.id).toMatch(/^[A-Z][A-Z0-9_]*$/);
      if (preset.id === 'custom') expect(preset.baseUrl).toBe('');
      else expect(preset.baseUrl, preset.id).toMatch(/^https:\/\/.+/);
    }
  });

  it('rejects unknown provider subcommands', async () => {
    const { io, err } = capture();
    const code = await run(['provider', 'login'], io);

    expect(code).toBe(1);
    expect(err.join('\n')).toContain("unknown provider subcommand 'login'");
  });
});
