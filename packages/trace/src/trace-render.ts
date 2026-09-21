import type { Diagnostic, TraceGraph, TraceRenderer } from './contracts.js';
import { severityRank } from './contracts.js';
import type { TraceCounts, TraceGraphReport } from './trace-graph.js';

/**
 * Trace graph text renderer (P09-04).
 *
 * Deterministic plain-text rendering of a built trace graph, byte-stable for
 * identical input:
 *
 *   TRACE REPORT - <label>
 *   <code> [<severity>] <target>: <message>      (one line per diagnostic)
 *   counts: requirements=N tasks=N tests=N links=N
 *   result: <PASS|WARN|FAIL>
 *
 * result is FAIL when any error diagnostic exists, WARN when any warning
 * exists, else PASS. Diagnostics are re-sorted (severity error > warning >
 * info, then code, then target) so output is stable regardless of the input
 * graph's ordering. PURE: no filesystem, no time.
 */

function compareDiagnostics(a: Diagnostic, b: Diagnostic): number {
  return (
    severityRank[a.severity] - severityRank[b.severity] ||
    a.code.localeCompare(b.code) ||
    a.target.localeCompare(b.target)
  );
}

/** Fallback counts derived from the graph when the report has none. */
function deriveCounts(graph: TraceGraph): TraceCounts {
  const edges = new Set<string>();
  for (const node of graph.nodes) {
    for (const edge of node.edges) edges.add(edge);
  }
  return {
    requirements: graph.nodes.filter((n) => n.kind === 'requirement').length,
    tasks: graph.nodes.filter((n) => n.kind === 'task').length,
    tests: graph.nodes.filter((n) => n.kind === 'test').length,
    links: edges.size,
  };
}

export function traceRenderer(): TraceRenderer {
  return {
    render(graph: TraceGraph): string {
      const report = graph as TraceGraphReport;
      const counts = report.counts ?? deriveCounts(graph);
      const diagnostics = [...graph.diagnostics].sort(compareDiagnostics);

      const lines: string[] = [];
      lines.push(`TRACE REPORT - ${report.label ?? 'trace graph'}`);
      for (const d of diagnostics) {
        lines.push(`${d.code} [${d.severity}] ${d.target}: ${d.message}`);
      }
      lines.push(
        `counts: requirements=${counts.requirements} tasks=${counts.tasks} ` +
          `tests=${counts.tests} links=${counts.links}`,
      );
      const result = diagnostics.some((d) => d.severity === 'error')
        ? 'FAIL'
        : diagnostics.some((d) => d.severity === 'warning')
          ? 'WARN'
          : 'PASS';
      lines.push(`result: ${result}`);
      return `${lines.join('\n')}\n`;
    },
  };
}
