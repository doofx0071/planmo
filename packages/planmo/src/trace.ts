import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { readStatus } from '@planmo/core';
import {
  REQUIREMENT_ID_PATTERN,
  isTaskId,
  splitCsvLine,
  taskId,
  taskNumber,
  taskPhase,
} from '@planmo/shared';
import {
  createTraceGraphEngine,
  traceRenderer,
  type TraceGraph,
  type TraceGraphReport,
  type TraceInput,
  type TraceLink,
  type TraceTask,
  type TraceTest,
} from '@planmo/trace';
import { TASKS_CSV_PATH } from '@planmo/workflow';
import { WorkspaceNotFoundError } from './workspace-error.js';

/**
 * `planmo trace [id]` — the requirements traceability report.
 *
 * Thin adapter over `@planmo/trace`'s trace-graph engine, the same shape as
 * `validate`/`next`: read the canonical workspace documents off disk, hand the
 * engine a `TraceInput`, render what it returns. No traceability logic lives
 * here — the engine owns the invariants and is pure, so the same workspace
 * always produces the same report and the output is safe to gate CI on.
 *
 * WHAT THE GRAPH IS BUILT FROM (this workspace):
 *   - requirements — `planning/REQUIREMENTS-TRACEABILITY.md` (the Requirement
 *     column) plus any extra `REQ-###` ids declared in
 *     `planning/requirements/PRODUCT-REQUIREMENTS.md`.
 *   - tasks        — `planning/tasks.csv` (id, phase, title, status).
 *   - decisions    — `planning/DECISIONS.md` (the `D-###` ids, e.g. D-000).
 *   - links        — requirement → task edges from the `Tasks` column of
 *     `planning/REQUIREMENTS-TRACEABILITY.md` (e.g. `P00-01–P00-04`, expanded).
 *   - tests        — NONE. The generated workspace carries no per-task test
 *     evidence: `planning/testing/TEST-STRATEGY.md` declares gate levels, not
 *     test→task rows, and there is no evidence file. `tests` is therefore empty
 *     and the engine reports every task as untested (TRC-002). We do NOT
 *     fabricate test rows. If a workspace ever ships evidence rows, this is
 *     where they would be read.
 *
 * LINKS THE ENGINE COULD USE BUT THE WORKSPACE DOES NOT CARRY: the engine links
 * requirements to tasks only. `DECISIONS.md` records project-level decisions
 * with no requirement references, and there are no requirement→decision edges
 * to parse, so none are synthesised.
 */

const TRACEABILITY_PATH = 'planning/REQUIREMENTS-TRACEABILITY.md';
const PRODUCT_REQUIREMENTS_PATH = 'planning/requirements/PRODUCT-REQUIREMENTS.md';
const DECISIONS_PATH = 'planning/DECISIONS.md';

export interface TraceOptions {
  root: string;
  /**
   * Optional requirement/task id to focus on. The trace engine builds and
   * renders the WHOLE graph and offers no subgraph filtering, so this never
   * narrows the output — see `TraceOutcome.focusNote`.
   */
  id?: string;
}

export interface TraceOutcome {
  root: string;
  /** The built graph (a TraceGraphReport: the frozen TraceGraph plus counts). */
  graph: TraceGraphReport;
  /** The whole-graph report as terminal text, ready to print. Byte-stable. */
  text: string;
  /** The requested focus id, or null when the whole graph was requested. */
  focus: string | null;
  /**
   * When a focus id was given: a note stating that the engine renders
   * whole-graph only (so the full report is shown) and naming the focused
   * node. Null when no focus id was requested.
   */
  focusNote: string | null;
}

/** Read a file, or return undefined when it is absent (a valid state). */
async function readIfPresent(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, 'utf8');
  } catch {
    return undefined;
  }
}

/**
 * Parse `planning/tasks.csv` into task rows.
 *
 * The file is `id,phase,title,status,priority`. Titles may be RFC 4180 quoted
 * and contain commas, so fields are split with `splitCsvLine`; `status` is
 * field 4 (index 3) — it is NOT the last field, `priority` is. Rows whose first
 * field is not a canonical task id (the header, or a malformed row) are not
 * tasks and are skipped.
 */
export function parseTasksCsv(csv: string): TraceTask[] {
  const tasks: TraceTask[] = [];
  for (const line of csv.split(/\r?\n/)) {
    if (line.trim() === '') continue;
    const fields = splitCsvLine(line);
    const id = fields[0] ?? '';
    if (!isTaskId(id)) continue;
    tasks.push({
      id,
      phase: fields[1] ?? '',
      title: fields[2] ?? '',
      status: fields[3] ?? '',
    });
  }
  return tasks;
}

/** Requirement ids declared in a document, in first-seen order, deduped. */
export function collectRequirementIds(doc: string): string[] {
  const ids: string[] = [];
  for (const match of doc.matchAll(/REQ-\d{3}/g)) {
    const id = match[0] ?? '';
    if (REQUIREMENT_ID_PATTERN.test(id) && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

/** Decision ids declared in `DECISIONS.md` (e.g. D-000), sorted, deduped. */
export function collectDecisionIds(doc: string): string[] {
  const ids: string[] = [];
  for (const match of doc.matchAll(/D-\d{3}/g)) {
    const id = match[0] ?? '';
    if (id !== '' && !ids.includes(id)) ids.push(id);
  }
  return ids.sort();
}

/** Expand `P00-01–P00-04` (same phase) to every id between; else the endpoints. */
function expandRange(start: string, end: string): string[] {
  const startPhase = taskPhase(start);
  const endPhase = taskPhase(end);
  const startNumber = taskNumber(start);
  const endNumber = taskNumber(end);
  if (
    startPhase === undefined ||
    endPhase === undefined ||
    startNumber === undefined ||
    endNumber === undefined ||
    startPhase !== endPhase
  ) {
    return [start, end];
  }
  const from = Number(startNumber);
  const to = Number(endNumber);
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) return [start, end];
  const ids: string[] = [];
  for (let n = from; n <= to; n++) ids.push(taskId(startPhase, n));
  return ids;
}

/**
 * Task ids named by a traceability `Tasks` cell. The generator joins a phase's
 * tasks as `<first>–<last>` with an en dash (U+2013); a comma-separated list is
 * also accepted. A range is only expanded when both endpoints are canonical
 * task ids in the same phase.
 */
function parseTaskRefs(cell: string): string[] {
  const refs: string[] = [];
  for (const part of cell.split(',')) {
    const token = part.trim();
    if (token === '') continue;
    const range = /^(P\d{2}-\d{2})\s*\u2013\s*(P\d{2}-\d{2})$/.exec(token);
    if (range !== null) {
      const start = range[1];
      const end = range[2];
      if (start !== undefined && end !== undefined) refs.push(...expandRange(start, end));
      continue;
    }
    if (isTaskId(token)) refs.push(token);
  }
  return refs;
}

/**
 * Parse the `REQUIREMENTS-TRACEABILITY.md` table into requirement ids and
 * requirement→task links. Columns: Requirement | Phase | Tasks | Design | Test
 * | Status. Only the Requirement and Tasks columns are read; Design/Test are
 * `—` in a generated workspace and carry no ids to link.
 */
function parseTraceability(doc: string): { requirements: string[]; links: TraceLink[] } {
  const requirements: string[] = [];
  const links: TraceLink[] = [];
  for (const line of doc.split(/\r?\n/)) {
    if (!line.trimStart().startsWith('|')) continue;
    const cells = line.split('|').map((cell) => cell.trim());
    const requirement = cells[1] ?? '';
    if (!REQUIREMENT_ID_PATTERN.test(requirement)) continue;
    if (!requirements.includes(requirement)) requirements.push(requirement);
    for (const to of parseTaskRefs(cells[3] ?? '')) {
      if (!links.some((link) => link.from === requirement && link.to === to)) {
        links.push({ from: requirement, to });
      }
    }
  }
  return { requirements, links };
}

/** The note shown when a focus id is requested (the engine never filters). */
function focusNoteFor(graph: TraceGraph, id: string): string {
  const node = graph.nodes.find((candidate) => candidate.id === id);
  if (node === undefined) {
    return `focus '${id}' is not a node in the trace graph; the whole graph is shown (the engine renders whole-graph only)`;
  }
  return `focus '${id}' (${node.kind}, ${node.edges.length} edge(s)) is not applied: the trace engine renders whole-graph only, so the full report is shown`;
}

/** Pure render step: the whole graph as byte-stable text. */
export function renderTraceGraph(graph: TraceGraph): string {
  return traceRenderer().render(graph);
}

export async function traceWorkspace(opts: TraceOptions): Promise<TraceOutcome> {
  const status = await readStatus({ root: opts.root });
  if (status.project === null) {
    throw new WorkspaceNotFoundError(opts.root);
  }
  const root = status.root;

  const [csv, traceabilityDoc, productDoc, decisionsDoc] = await Promise.all([
    readIfPresent(join(root, TASKS_CSV_PATH)),
    readIfPresent(join(root, TRACEABILITY_PATH)),
    readIfPresent(join(root, PRODUCT_REQUIREMENTS_PATH)),
    readIfPresent(join(root, DECISIONS_PATH)),
  ]);

  const tasks = csv === undefined ? [] : parseTasksCsv(csv);

  const trace =
    traceabilityDoc === undefined
      ? { requirements: [] as string[], links: [] as TraceLink[] }
      : parseTraceability(traceabilityDoc);

  // Requirements named by either document: the traceability table first (it
  // also carries the links), then any extra ids the product requirements
  // declare. A requirement only the product document knows about stays an
  // orphan and the engine reports it (TRC-001).
  const requirements = [...trace.requirements];
  if (productDoc !== undefined) {
    for (const id of collectRequirementIds(productDoc)) {
      if (!requirements.includes(id)) requirements.push(id);
    }
  }

  const decisions = decisionsDoc === undefined ? [] : collectDecisionIds(decisionsDoc);

  // No test evidence is carried by the workspace — see the module header. We do
  // not invent test rows; an empty list is the honest input.
  const tests: TraceTest[] = [];

  const input: TraceInput = { requirements, tasks, decisions, tests, links: trace.links };

  // The engine returns a TraceGraphReport (the frozen TraceGraph plus counts
  // and a label); its declared interface is the narrower TraceGraph, so recover
  // the report shape the renderer and `--json` want.
  const graph = createTraceGraphEngine().build(input) as TraceGraphReport;
  const text = renderTraceGraph(graph);

  return {
    root,
    graph,
    text,
    focus: opts.id ?? null,
    focusNote: opts.id === undefined ? null : focusNoteFor(graph, opts.id),
  };
}
