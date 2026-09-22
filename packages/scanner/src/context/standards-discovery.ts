/**
 * P10-08 standards discovery (Worker B, CHG-001).
 *
 * Structural location + classification of policy/context documents. Input is
 * the list of repo-relative POSIX paths (e.g. from a ScanReport); output is a
 * deterministic precedence-ordered classification. No content is read or
 * parsed beyond the path itself, so repository text can never influence the
 * ordering. Does NOT import design-engine or trace — the scanner boundary is
 * core/shared/schema only (this module is dependency-free).
 *
 * Deterministic precedence (lower rank wins, README is informational only):
 *   rank = kindBase + depth, kindBase: agents=0, claude=1000,
 *   cursorrules=2000, readme=3000; depth = number of path segments minus 1.
 *
 * Ordering: root AGENTS.md (rank 0) < nested AGENTS.md (rank = depth) <
 * CLAUDE.md < .cursorrules < README.md (informational, rank max). Ties broken
 * by path ascending.
 */
export type StandardsDocKind = 'agents' | 'claude' | 'cursorrules' | 'readme';

export type StandardsDocRole = 'policy' | 'informational';

export interface StandardsDoc {
  /** POSIX path relative to repo root. */
  path: string;
  kind: StandardsDocKind;
  /** 'policy' = instruction-bearing (AGENTS.md/CLAUDE.md/.cursorrules); 'informational' = README. */
  role: StandardsDocRole;
  /** Number of path segments minus one (root file = 0). */
  depth: number;
  /** Deterministic precedence rank; lower wins. */
  rank: number;
}

export interface StandardsDiscoveryResult {
  /** All matches sorted rank asc, then path asc. */
  docs: readonly StandardsDoc[];
  /** Instruction-bearing docs only (excludes README), same sort. */
  policyDocs: readonly StandardsDoc[];
  /** README docs (informational, rank max), same sort. */
  informationalDocs: readonly StandardsDoc[];
}

export interface StandardsDiscoveryEngine {
  readonly name: 'standards-discovery';
  /** Pure structural classification; never touches filesystem or content. */
  discover(paths: readonly string[]): Promise<StandardsDiscoveryResult>;
}

const KIND_BASE: Readonly<Record<StandardsDocKind, number>> = {
  agents: 0,
  claude: 1000,
  cursorrules: 2000,
  readme: 3000,
};

const ROLE_BY_KIND: Readonly<Record<StandardsDocKind, StandardsDocRole>> = {
  agents: 'policy',
  claude: 'policy',
  cursorrules: 'policy',
  readme: 'informational',
};

function classify(path: string): StandardsDoc | null {
  let normalized = path;
  if (normalized.startsWith('./')) normalized = normalized.slice(2);
  if (normalized.length === 0) return null;

  const segments = normalized.split('/');
  const basename = segments[segments.length - 1];
  const depth = segments.length - 1;

  let kind: StandardsDocKind | null = null;
  if (basename === 'AGENTS.md') kind = 'agents';
  else if (basename === 'CLAUDE.md') kind = 'claude';
  else if (basename === '.cursorrules') kind = 'cursorrules';
  else if (basename === 'README.md') kind = 'readme';
  if (kind === null) return null;

  return {
    path: normalized,
    kind,
    role: ROLE_BY_KIND[kind],
    depth,
    rank: KIND_BASE[kind] + depth,
  };
}

function byRankThenPath(a: StandardsDoc, b: StandardsDoc): number {
  return (
    (a.rank < b.rank ? -1 : a.rank > b.rank ? 1 : 0) ||
    (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)
  );
}

export const standardsDiscovery: StandardsDiscoveryEngine = {
  name: 'standards-discovery',

  async discover(paths: readonly string[]): Promise<StandardsDiscoveryResult> {
    const docs: StandardsDoc[] = [];
    for (const path of paths) {
      const doc = classify(path);
      if (doc !== null) docs.push(doc);
    }
    docs.sort(byRankThenPath);
    const policyDocs = docs.filter((doc) => doc.role === 'policy');
    const informationalDocs = docs.filter((doc) => doc.role === 'informational');
    return { docs, policyDocs, informationalDocs };
  },
};
