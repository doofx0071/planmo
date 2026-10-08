import { access } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { AGENT_COMMANDS, DETECTABLE_TARGETS, renderAgentFiles } from '@planmo/agent-bridge';

/**
 * Work out which coding agents this project already uses.
 *
 * Evidence is filesystem markers, never the network and never an environment
 * variable: the result must be identical on every run, and the user is shown WHY
 * each agent was detected so a false positive is visible and can be unticked.
 *
 * `hermes` is the one global target — Hermes reads user-level skills from
 * `~/.hermes/skills`, so its marker lives outside the project. The home directory
 * is injectable so detection stays deterministic under test.
 */
export interface AgentDetection {
  /** Agent target id, e.g. `opencode`. */
  id: string;
  /** Why it was detected, e.g. `.opencode/`. */
  evidence: readonly string[];
  /** `installed` when PlanMo's own command files are already present. */
  state: 'installed' | 'present';
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export interface DetectOptions {
  /** Home directory used to resolve `~` markers. Injectable for tests. */
  home?: string;
}

export async function detectAgents(
  root: string,
  opts: DetectOptions = {},
): Promise<AgentDetection[]> {
  // `PLANMO_HOME` overrides the home used for the one global marker, so detection
  // stays deterministic in CI and sandboxes.
  const home = opts.home ?? process.env.PLANMO_HOME ?? homedir();
  const found: AgentDetection[] = [];

  for (const target of DETECTABLE_TARGETS) {
    const markers = target.markers;
    const evidence: string[] = [];
    let installed = false;

    for (const marker of markers) {
      const isDir = marker.endsWith('/');
      const bare = isDir ? marker.slice(0, -1) : marker;
      const base = bare.startsWith('~') ? home : root;
      const rel = bare.startsWith('~') ? bare.slice(2) : bare;
      if (await exists(join(base, rel))) evidence.push(marker);
    }

    // Strongest signal: PlanMo's own command file is already installed.
    if (target.global !== true) {
      for (const file of renderAgentFiles(target, AGENT_COMMANDS)) {
        if (await exists(join(root, file.path))) {
          evidence.push(file.path);
          installed = true;
          break;
        }
      }
    }

    if (evidence.length > 0) {
      found.push({
        id: target.id,
        evidence,
        state: installed ? 'installed' : 'present',
      });
    }
  }

  // Installed first, then by id — deterministic order for the prompt.
  return found.sort(
    (a, b) =>
      Number(b.state === 'installed') - Number(a.state === 'installed') || (a.id < b.id ? -1 : 1),
  );
}
