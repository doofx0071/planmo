import { access } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { AGENT_COMMANDS, DETECTABLE_TARGETS, renderAgentFiles } from '@planmo/agent-bridge';
import { analyzeRepository, DEFAULT_EXCLUDES, nodeFileReader } from '@planmo/scanner';
import { AGENT_IDS, type AgentId } from '@planmo/schema';

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

/**
 * Stacks that imply a project type.
 *
 * Only unambiguous cases are listed. A bare language stack (`python`, `rust`, `go`)
 * could be a CLI, a library or a service, and guessing between them would be worse
 * than leaving the question to the user — who can see the detected stacks printed
 * above the prompt and correct it in one keypress.
 */
const TYPE_BY_STACK: ReadonlyArray<readonly [stack: string, type: string]> = Object.freeze([
  ['next', 'web-application'],
  ['react', 'web-application'],
  ['vue', 'web-application'],
  ['vite', 'web-application'],
  ['express', 'service'],
]);

/**
 * Agents whose only marker is a bare `AGENTS.md`.
 *
 * That file is the cross-client convention — several agents read it — so finding it
 * is evidence that conventions exist, not that this agent is installed here. It is
 * a weaker signal than a real agent directory and is only used when nothing better
 * was found.
 */
const CONVENTION_AGENTS: readonly string[] = Object.freeze(['amp', 'codex', 'openhands']);

export interface InitDetection {
  readonly stacks: readonly string[];
  readonly testFrameworks: readonly string[];
  readonly ciSystems: readonly string[];
  readonly agents: readonly AgentDetection[];
  readonly fileCount: number;
  /** `brownfield` when the directory already holds files outside the scan excludes. */
  readonly lifecycle: 'greenfield' | 'brownfield';
  readonly type: string;
  /**
   * Always a member of `AGENT_IDS` (ADR-0008's v1 matrix), never a bare detected id:
   * detection may see `codex`, but `project.yml` cannot hold it.
   */
  readonly primaryAgent: AgentId;
}

/**
 * Work out what `planmo init` can answer for itself, so the wizard asks the user to
 * CONFIRM rather than SUPPLY.
 *
 * Every value here is a proposal, not a decision: the caller prints it and the user
 * can override any of it. Detection that silently won a default would be worse than
 * no detection at all, because the user would have no idea why the answer was what
 * it was — and a wrong `lifecycle: greenfield` on an existing repository is exactly
 * the kind of thing that goes unnoticed for months.
 */
export async function detectForInit(root: string): Promise<InitDetection> {
  const { report, detection } = await analyzeRepository(root, nodeFileReader(), {
    // `planning/` is excluded alongside the usual ignores because it is PlanMo's OWN
    // output: without it, running `init` twice in the same directory would see the
    // first run's documents, decide the project was brownfield, and write different
    // answers than the first run. `init` has to be idempotent.
    scan: { exclude: [...DEFAULT_EXCLUDES, 'planning'] },
  });
  const stacks = detection.stacks.map((stack) => stack.id);
  const agents = await detectAgents(root);
  const fileCount = report.scanSummary.files;

  const typed = TYPE_BY_STACK.find(([stack]) => stacks.includes(stack));
  const installed = agents.find((agent) => agent.state === 'installed');
  const specific = agents.find((agent) => !CONVENTION_AGENTS.includes(agent.id));

  // ADR-0008 fixes the v1 primary-agent matrix at three ids; the 31 agents in
  // @planmo/agent-bridge are for COMMAND INSTALLATION, which is a different
  // concern. Proposing an id outside the matrix makes project.yml fail its own
  // schema — which is exactly what happened on a repository whose only signal was
  // AGENTS.md: detection said `codex`, `codex` is not in the matrix, and `init`
  // refused to write the workspace at all. Detection proposes only what the
  // workspace can accept, and falls back to the documented default.
  const primaryAgent =
    [installed?.id, specific?.id].find(
      (id): id is AgentId => id !== undefined && (AGENT_IDS as readonly string[]).includes(id),
    ) ?? 'opencode';

  return {
    stacks,
    testFrameworks: detection.testFrameworks,
    ciSystems: detection.ciSystems,
    agents,
    fileCount,
    // Any file at all outside node_modules/dist/.git means this is not a fresh
    // start. A repository with a README and no code is still brownfield: the point
    // of the distinction is whether there is existing work to respect.
    lifecycle: fileCount > 0 ? 'brownfield' : 'greenfield',
    type: typed?.[1] ?? 'web-application',
    primaryAgent,
  };
}
