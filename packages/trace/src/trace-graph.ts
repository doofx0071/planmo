import type {
  Diagnostic,
  TraceGraph,
  TraceGraphEngine,
  TraceInput,
  TraceLink,
  TraceNode,
  TraceTest,
} from './contracts.js';
import { severityRank } from './contracts.js';

/**
 * Trace graph engine (P09-01/04, CHG-001 REQ-TRC-001..004).
 *
 * Derives the trace graph from canonical requirements/tasks/decisions/tests
 * and emits stable-code diagnostics usable as an exit gate:
 *
 * - TRC-001 warning  orphaned requirement: no trace link references it;
 * - TRC-002 warning  task without passing test evidence (no test row, or the
 *                    only rows are non-passing — red evidence is no evidence);
 * - TRC-003 error    test row references an unknown task (dangling evidence);
 * - TRC-004 error    link target references an unknown entity id.
 *
 * PURE + deterministic: no filesystem, no time, identical input yields
 * identical output. Every returned array is sorted; diagnostics are sorted by
 * severity rank (error > warning > info), then code, then target.
 *
 * The frozen TraceGraph contract is extended with per-kind counts + a stable
 * report label (TraceGraphReport) consumed by the text renderer; the built
 * value remains assignable to TraceGraph so the frozen engine interface holds.
 */

/** Per-kind entity counts for the trace report. */
export interface TraceCounts {
  requirements: number;
  tasks: number;
  tests: number;
  links: number;
}

/** Built trace report: the frozen TraceGraph plus counts + label. */
export interface TraceGraphReport extends TraceGraph {
  /** Stable report label rendered by the text renderer. */
  label: string;
  counts: TraceCounts;
}

function linkEdge(link: TraceLink): string {
  return `${link.from} -> ${link.to}`;
}

function byId(a: { id: string }, b: { id: string }): number {
  return a.id.localeCompare(b.id);
}

function compareDiagnostics(a: Diagnostic, b: Diagnostic): number {
  return (
    severityRank[a.severity] - severityRank[b.severity] ||
    a.code.localeCompare(b.code) ||
    a.target.localeCompare(b.target)
  );
}

/** Requirements whose owning tasks are not trace-linked: the orphan set. */
function orphanedRequirementIds(input: TraceInput, linked: ReadonlySet<string>): string[] {
  return input.requirements.filter((id) => !linked.has(id)).sort();
}

/** Tasks with no test row at all. */
function untestedTaskIds(
  input: TraceInput,
  testsByTask: ReadonlyMap<string, readonly TraceTest[]>,
): string[] {
  return input.tasks
    .map((t) => t.id)
    .filter((id) => !testsByTask.has(id))
    .sort();
}

/** Tasks without a PASSING test row (red evidence does not count). */
function missingEvidenceTaskIds(
  input: TraceInput,
  testsByTask: ReadonlyMap<string, readonly TraceTest[]>,
): string[] {
  return input.tasks
    .map((t) => t.id)
    .filter((id) => !(testsByTask.get(id) ?? []).some((t) => t.passing))
    .sort();
}

export function createTraceGraphEngine(): TraceGraphEngine {
  return {
    build(input: TraceInput): TraceGraphReport {
      const taskIds = new Set(input.tasks.map((t) => t.id));
      const testNames = new Set(input.tests.map((t) => t.name));
      const knownIds = new Set([...input.requirements, ...taskIds, ...testNames]);

      // Edge keys per node: "<from> -> <to>" (deduped, sorted per node).
      const edgesByNode = new Map<string, Set<string>>();
      const linked = new Set<string>();
      const sortedLinks = [...input.links].sort((a, b) => linkEdge(a).localeCompare(linkEdge(b)));
      for (const link of sortedLinks) {
        const edge = linkEdge(link);
        for (const id of [link.from, link.to]) {
          linked.add(id);
          const set = edgesByNode.get(id) ?? new Set<string>();
          set.add(edge);
          edgesByNode.set(id, set);
        }
      }

      // Test rows grouped by owning task (dangling task refs are TRC-003).
      const testsByTask = new Map<string, TraceTest[]>();
      for (const test of input.tests) {
        if (test.task === undefined) continue;
        const list = testsByTask.get(test.task) ?? [];
        list.push(test);
        testsByTask.set(test.task, list);
      }

      const diagnostics: Diagnostic[] = [];

      // TRC-001: requirements with no trace link.
      for (const id of orphanedRequirementIds(input, linked)) {
        diagnostics.push({
          severity: 'warning',
          code: 'TRC-001',
          target: id,
          message: `orphaned requirement ${id}: no trace links`,
        });
      }

      // TRC-002: tasks without passing test evidence.
      for (const task of [...input.tasks].sort(byId)) {
        if (!(testsByTask.get(task.id) ?? []).some((t) => t.passing)) {
          diagnostics.push({
            severity: 'warning',
            code: 'TRC-002',
            target: task.id,
            message: `task ${task.id} has no test evidence`,
          });
        }
      }

      // TRC-003: dangling evidence — test row referencing an unknown task.
      for (const test of [...input.tests].sort((a, b) => a.name.localeCompare(b.name))) {
        if (test.task !== undefined && !taskIds.has(test.task)) {
          diagnostics.push({
            severity: 'error',
            code: 'TRC-003',
            target: test.name,
            message: `test ${test.name} references unknown task ${test.task}`,
          });
        }
      }

      // TRC-004: link targets referencing missing entities.
      for (const link of sortedLinks) {
        if (!knownIds.has(link.to)) {
          const edge = linkEdge(link);
          diagnostics.push({
            severity: 'error',
            code: 'TRC-004',
            target: edge,
            message: `link ${edge} references unknown target ${link.to}`,
          });
        }
      }

      const nodes: TraceNode[] = [];
      const nodeKinds: Array<readonly [string, TraceNode['kind']]> = [];
      for (const id of input.requirements) nodeKinds.push([id, 'requirement']);
      for (const task of input.tasks) nodeKinds.push([task.id, 'task']);
      for (const id of input.decisions) nodeKinds.push([id, 'decision']);
      for (const test of input.tests) nodeKinds.push([test.name, 'test']);
      nodeKinds.sort((a, b) => a[0].localeCompare(b[0]));

      const seenNodes = new Set<string>();
      for (const [id, kind] of nodeKinds) {
        if (seenNodes.has(id)) continue;
        seenNodes.add(id);
        nodes.push({ id, kind, edges: [...(edgesByNode.get(id) ?? [])].sort() });
      }

      return {
        nodes,
        orphans: orphanedRequirementIds(input, linked),
        untested: untestedTaskIds(input, testsByTask),
        missingEvidence: missingEvidenceTaskIds(input, testsByTask),
        diagnostics: [...diagnostics].sort(compareDiagnostics),
        label: 'trace graph',
        counts: {
          requirements: input.requirements.length,
          tasks: input.tasks.length,
          tests: input.tests.length,
          links: input.links.length,
        },
      };
    },
  };
}

/** Unused-symbol guard (kept for lint symmetry with sibling engines). */
export type { TraceNode };
