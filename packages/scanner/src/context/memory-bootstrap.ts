import { createHash } from 'node:crypto';
import type {
  DetectionReport,
  MemoryBootstrapEngine,
  MemoryFact,
  ScanReport,
} from '../contracts.js';

/**
 * Brownfield memory bootstrap (P10-10, CHG-001).
 *
 * Derives durable, DECLARATIVE memory facts (ADR-0013/0014 semantics) from the
 * scan + detection results — with provenance. Facts are statements about the
 * repository ("Repository uses TypeScript"), never instructions ("use
 * TypeScript" is forbidden and never produced).
 *
 * Fact inventory (deterministic rule order; the result sorts by id asc):
 * - one repo fact over the aggregate scan stats (provenance: scan root);
 * - presence facts for root README.md (repo) and AGENTS.md (security:
 *   instruction-bearing surface treated as scanned data);
 * - one stack fact per detected stack, with the exact evidence paths;
 * - one stack fact per declared test framework and CI system (the frozen
 *   DetectionReport carries no per-framework evidence, so the aggregate
 *   provenance is the scan root — documented limitation);
 * - a security fact when the repo contains symlink entries (traversal risk),
 *   with the exact symlink paths;
 * - repo facts for scan warnings (paths) and truncation (root).
 *
 * id = 'fact-' + first 8 hex chars of sha256(fact text). PURE + deterministic:
 * no time, no randomness; node:crypto's sha256 is a pure function of content.
 */

export const memoryBootstrap: MemoryBootstrapEngine = Object.freeze({
  name: 'memory-bootstrap',
  async bootstrap(scan: ScanReport, detection: DetectionReport): Promise<readonly MemoryFact[]> {
    const facts: MemoryFact[] = [];
    const root: string = scan.root;
    const entryPaths = new Set(scan.entries.map((entry) => entry.path));

    // --- repo: aggregate scan stats -------------------------------------------------
    facts.push(
      makeFact(
        'repo',
        `Repository at ${root} contains ${scan.stats.files} files, ${scan.stats.dirs} directories ` +
          `and ${scan.stats.symlinks} symlinks (${scan.stats.totalBytes} bytes).`,
        [root],
      ),
    );

    // --- repo/security: instruction-bearing root files ---------------------------------
    if (entryPaths.has('README.md')) {
      facts.push(makeFact('repo', 'Repository has a README.md at the root.', ['README.md']));
    }
    if (entryPaths.has('AGENTS.md')) {
      // security scope: AGENTS.md is the instruction-bearing surface; its text is scanned data
      facts.push(makeFact('security', 'Repository has an AGENTS.md at the root.', ['AGENTS.md']));
    }

    // --- stack: detected stacks with exact evidence paths -------------------------------
    for (const stack of [...detection.stacks].sort((a, b) => compareAsc(a.id, b.id))) {
      facts.push(
        makeFact(
          'stack',
          `Repository uses ${stack.id} (${stack.category}, ${stack.confidence} confidence).`,
          uniqueSorted(stack.evidence.map((e) => e.path)),
        ),
      );
    }

    // --- stack: declared test frameworks / CI systems (aggregate provenance: root) ------
    for (const framework of [...detection.testFrameworks].sort(compareAsc)) {
      facts.push(makeFact('stack', `Repository declares the ${framework} test framework.`, [root]));
    }
    for (const ci of [...detection.ciSystems].sort(compareAsc)) {
      facts.push(makeFact('stack', `Repository declares ${ci} for CI.`, [root]));
    }

    // --- security: symlink entries are a traversal risk surface --------------------------
    if (scan.stats.symlinks > 0) {
      const symlinkPaths = uniqueSorted(
        scan.entries.filter((entry) => entry.type === 'symlink').map((entry) => entry.path),
      );
      facts.push(
        makeFact(
          'security',
          `Repository contains ${scan.stats.symlinks} symlink entries.`,
          symlinkPaths,
        ),
      );
    }

    // --- repo: warnings and truncation -----------------------------------------------------
    if (scan.warnings.length > 0) {
      facts.push(
        makeFact(
          'repo',
          `Scanner recorded ${scan.warnings.length} warnings while scanning the repository.`,
          uniqueSorted(scan.warnings.map((w) => w.path)),
        ),
      );
    }
    if (scan.truncatedBy !== null) {
      facts.push(makeFact('repo', `Scan was truncated by the ${scan.truncatedBy} cap.`, [root]));
    }

    const byId = new Map<string, MemoryFact>();
    for (const fact of facts) {
      if (!byId.has(fact.id)) byId.set(fact.id, fact);
    }
    return [...byId.values()].sort((a, b) => compareAsc(a.id, b.id));
  },
});

function compareAsc(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort(compareAsc);
}

function makeFact(
  scope: MemoryFact['scope'],
  fact: string,
  provenance: readonly string[],
): MemoryFact {
  const id = `fact-${createHash('sha256').update(fact, 'utf8').digest('hex').slice(0, 8)}`;
  return { id, fact, scope, provenance: uniqueSorted(provenance) };
}
