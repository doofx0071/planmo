import type { StateDocument } from '@planmo/schema';
import { HandoffSchema, ManifestSchema, StateSchema } from '@planmo/schema';
import { splitCsvLine, TASK_ID_PATTERN, taskPhase } from '@planmo/shared';
import type { Diagnostic, DiagnosticReport } from './contracts.js';
import { countsOf, sortDiagnostics } from './contracts.js';

/**
 * Cross-document validator engine (P09-02).
 *
 * Validates invariants across the canonical PlanMo documents (state, tasks,
 * manifest, handoff). The caller supplies the raw document text (empty or
 * absent strings are NOT inspected) plus, optionally, the already-parsed
 * canonical state and task rows as a fallback when the raw text is absent.
 *
 * Checks (deterministic, stable CI codes — no codes beyond VLD-001..006):
 * - VLD-001 error: state.currentPhase is not the zero-padded next phase after
 *   the last completed phase (phase gap / skipping ahead). Exempt when
 *   state.status is 'complete'.
 * - VLD-002 error: a task referenced in state.blockedTasks has a status other
 *   than BLOCKED, or the task id is unknown (no row in the tasks document).
 * - VLD-003 warning: handoff.nextPhase differs from the zero-padded next
 *   phase after state.currentPhase.
 * - VLD-004 error: an inspected document fails to parse against its canonical
 *   schema (StateSchema, 5-field tasks CSV lines, ManifestSchema,
 *   HandoffSchema). The parse error message is included in the diagnostic.
 * - VLD-005 error: a task row's id is not the canonical `P<NN>-<NN>` form
 *   (docs/02-architecture/identifier-scheme.md).
 * - VLD-006 error: a task id's embedded phase disagrees with the row's phase
 *   column, e.g. `P07-01` listed under phase `03`.
 *
 * PURE: no filesystem access, no clock, no randomness. Diagnostics are
 * sorted (severity rank, then code); every emitted array is sorted.
 */

/** One canonical tasks.csv row: id,phase,title,status,priority. */
export interface ValidateTaskRow {
  id: string;
  phase: string;
  title: string;
  status: string;
  priority: string;
}

/** Raw canonical document text; empty/absent entries are not inspected. */
export interface ValidationDocuments {
  state?: string;
  tasks?: string;
  manifest?: string;
  handoff?: string;
}

export interface ValidationInput {
  /** Already-parsed canonical state; used when documents.state is absent. */
  state?: StateDocument;
  /** Raw canonical document text for schema-presence checks. */
  documents: ValidationDocuments;
  /** Parsed task rows; used as fallback when documents.tasks is absent. */
  tasks?: readonly ValidateTaskRow[];
}

export type ValidationResult = DiagnosticReport;

export interface ValidatorEngine {
  /** Cross-document invariants + schema presence checks; read-only. */
  validate(input: ValidationInput): ValidationResult;
}

type JsonParse = { ok: true; value: unknown } | { ok: false; message: string };

function parseJsonDocument(text: string): JsonParse {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

/** Parse a raw tasks CSV. Every non-blank, non-header line must have 5 fields. */
function parseTasksCsv(
  text: string,
): { ok: true; rows: ValidateTaskRow[] } | { ok: false; message: string } {
  const rows: ValidateTaskRow[] = [];
  let lineNo = 0;
  for (const lineRaw of text.split('\n')) {
    const line = lineRaw.trim();
    if (line === '') continue;
    lineNo += 1;
    // Quote-aware: a title containing a comma is quoted by the generator and
    // must not split. Splitting on a bare ',' would turn a valid five-column
    // row into six and reject a workspace the generator itself produced.
    const fields = splitCsvLine(line);
    if (fields.length === 5 && fields[0]?.trim() === 'id') continue; // header
    if (fields.length !== 5) {
      return {
        ok: false,
        message: `line ${lineNo} has ${fields.length} comma-separated field(s), expected 5`,
      };
    }
    rows.push({
      id: fields[0]?.trim() ?? '',
      phase: fields[1]?.trim() ?? '',
      title: fields[2]?.trim() ?? '',
      status: fields[3]?.trim() ?? '',
      priority: fields[4]?.trim() ?? '',
    });
  }
  return { ok: true, rows };
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function docParseError(doc: string, reason: string): Diagnostic {
  return {
    code: 'VLD-004',
    severity: 'error',
    target: doc,
    message: `${doc} document fails schema parse: ${reason}`,
    remediation: `Fix ${doc} so it validates against its canonical PlanMo schema, then re-run validate.`,
  };
}

/** VLD-001: phase gap — currentPhase must be the zero-padded next phase. */
function phaseGapDiagnostics(state: StateDocument): Diagnostic[] {
  if (state.status === 'complete') return [];
  const numeric = state.completedPhases.map((p) => Number(p)).filter((n) => Number.isFinite(n));
  const lastCompleted = numeric.length > 0 ? Math.max(...numeric) : -1;
  const expected = pad2(lastCompleted + 1);
  if (state.currentPhase === expected) return [];
  return [
    {
      code: 'VLD-001',
      severity: 'error',
      target: 'state',
      message: `phase gap: state.currentPhase is "${state.currentPhase}" but the zero-padded next phase after the last completed phase is "${expected}"`,
      remediation:
        'Set state.currentPhase to the zero-padded next phase id, or mark state.status complete if the phase is finished.',
    },
  ];
}

/** VLD-002: blocked tasks must exist in the tasks document with status BLOCKED. */
function blockedTaskDiagnostics(
  state: StateDocument,
  statuses: ReadonlyMap<string, string>,
): Diagnostic[] {
  const out: Diagnostic[] = [];
  for (const id of [...new Set(state.blockedTasks)].sort()) {
    const status = statuses.get(id);
    if (status === undefined) {
      out.push({
        code: 'VLD-002',
        severity: 'error',
        target: id,
        message: `task "${id}" is referenced in state.blockedTasks but has no row in the tasks document`,
        remediation: `Add "${id}" to planning/tasks.csv or remove it from state.blockedTasks.`,
      });
    } else if (status !== 'BLOCKED') {
      out.push({
        code: 'VLD-002',
        severity: 'error',
        target: id,
        message: `task "${id}" is referenced in state.blockedTasks but its status is "${status}"`,
        remediation: `Set task "${id}" status to BLOCKED in planning/tasks.csv or remove it from state.blockedTasks.`,
      });
    }
  }
  return out;
}

/** VLD-003: handoff.nextPhase must be the zero-padded phase after currentPhase. */
function nextPhaseDiagnostics(state: StateDocument, handoff: { nextPhase: string }): Diagnostic[] {
  const current = Number(state.currentPhase);
  if (!Number.isFinite(current)) return [];
  const expected = pad2(current + 1);
  if (handoff.nextPhase === expected) return [];
  return [
    {
      code: 'VLD-003',
      severity: 'warning',
      target: 'handoff',
      message: `handoff.nextPhase is "${handoff.nextPhase}" but the zero-padded next phase after state.currentPhase "${state.currentPhase}" is "${expected}"`,
      remediation: 'Update handoff.nextPhase to the zero-padded next phase id.',
    },
  ];
}

/** VLD-005: every task row must carry a canonical `P<NN>-<NN>` id. */
function taskIdFormatDiagnostics(rows: readonly ValidateTaskRow[]): Diagnostic[] {
  const out: Diagnostic[] = [];
  for (const row of rows) {
    if (TASK_ID_PATTERN.test(row.id)) continue;
    out.push({
      code: 'VLD-005',
      severity: 'error',
      target: row.id,
      message: `task id "${row.id}" is not the canonical P<NN>-<NN> form`,
      remediation: `Rename it to P<phase>-<task> with two digits each, e.g. P${row.phase || '03'}-01.`,
    });
  }
  return out;
}

/** VLD-006: a task id's embedded phase must match the row's phase column. */
function taskPhaseMatchDiagnostics(rows: readonly ValidateTaskRow[]): Diagnostic[] {
  const out: Diagnostic[] = [];
  for (const row of rows) {
    const embedded = taskPhase(row.id);
    if (embedded === undefined || embedded === row.phase) continue;
    out.push({
      code: 'VLD-006',
      severity: 'error',
      target: row.id,
      message: `task "${row.id}" is listed under phase "${row.phase}" but its id names phase "${embedded}"`,
      remediation: `Set the phase column to "${embedded}" or renumber the id to P${row.phase}-<task>.`,
    });
  }
  return out;
}

export function validatorEngine(): ValidatorEngine {
  return {
    validate(input: ValidationInput): ValidationResult {
      const diagnostics: Diagnostic[] = [];

      // ---- VLD-004: schema presence checks over the raw documents.
      let state = input.state;
      const rawState = input.documents.state?.trim() ?? '';
      if (rawState !== '') {
        const json = parseJsonDocument(rawState);
        if (!json.ok) {
          diagnostics.push(docParseError('state', json.message));
          state = undefined;
        } else {
          const parsed = StateSchema.safeParse(json.value);
          if (!parsed.success) {
            diagnostics.push(docParseError('state', parsed.error.message));
            state = undefined;
          } else {
            state = parsed.data;
          }
        }
      }

      const statuses = new Map<string, string>();
      let taskRows: readonly ValidateTaskRow[] = input.tasks ?? [];
      const rawTasks = input.documents.tasks?.trim() ?? '';
      if (rawTasks !== '') {
        const csv = parseTasksCsv(rawTasks);
        if (csv.ok) {
          taskRows = csv.rows;
          for (const row of csv.rows) statuses.set(row.id, row.status);
        } else {
          diagnostics.push(docParseError('tasks', csv.message));
          for (const row of input.tasks ?? []) statuses.set(row.id, row.status);
        }
      } else {
        for (const row of input.tasks ?? []) statuses.set(row.id, row.status);
      }
      diagnostics.push(...taskIdFormatDiagnostics(taskRows));
      diagnostics.push(...taskPhaseMatchDiagnostics(taskRows));

      let handoff: { nextPhase: string } | undefined;
      const rawManifest = input.documents.manifest?.trim() ?? '';
      if (rawManifest !== '') {
        const json = parseJsonDocument(rawManifest);
        if (!json.ok) {
          diagnostics.push(docParseError('manifest', json.message));
        } else {
          const parsed = ManifestSchema.safeParse(json.value);
          if (!parsed.success) diagnostics.push(docParseError('manifest', parsed.error.message));
        }
      }

      const rawHandoff = input.documents.handoff?.trim() ?? '';
      if (rawHandoff !== '') {
        const json = parseJsonDocument(rawHandoff);
        if (!json.ok) {
          diagnostics.push(docParseError('handoff', json.message));
        } else {
          const parsed = HandoffSchema.safeParse(json.value);
          if (!parsed.success) {
            diagnostics.push(docParseError('handoff', parsed.error.message));
          } else {
            handoff = parsed.data;
          }
        }
      }

      // ---- Cross-document invariants (need a parseable state).
      if (state !== undefined) {
        diagnostics.push(...phaseGapDiagnostics(state));
        diagnostics.push(...blockedTaskDiagnostics(state, statuses));
        if (handoff !== undefined) diagnostics.push(...nextPhaseDiagnostics(state, handoff));
      }

      const sorted = sortDiagnostics(diagnostics);
      return { diagnostics: sorted, counts: countsOf(sorted) };
    },
  };
}
