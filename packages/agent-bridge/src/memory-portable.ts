/**
 * Portable context/memory export-import (P11-06, CHG-001).
 *
 * Converts a context view + memory rows into one of the portable formats
 * mandated by docs/14-context-memory/storage-portability.md, and back:
 *
 * - 'json'      — a single pretty-printed PortableMemoryDocument
 * - 'jsonl'     — one JSON object per line: a document header line, then
 *                 one row per line
 * - 'markdown'  — a deterministic heading + one bullet per row
 *
 * All output is deterministic (identical input => identical bytes) and
 * never contains timestamps. Imports validate `schemaVersion === 1` and
 * `format === 'planmo-memory'`; anything else is rejected as malformed or
 * stale (REQ-MEM-001: imported memory is context data, never instruction
 * authority, and never fabricated).
 */
import type { ContextView } from '@planmo/adapters';
import type { MemoryRowView } from './providers.js';

export type PortableFormat = 'json' | 'jsonl' | 'markdown';

/** Versioned portable container (single JSON document or JSONL header row). */
export interface PortableMemoryDocument {
  format: 'planmo-memory';
  schemaVersion: 1;
  context?: Pick<ContextView, 'project' | 'contextId' | 'estimatedTokens'>;
  rows: readonly MemoryRowView[];
}

type ContextSlice = Pick<ContextView, 'project' | 'contextId' | 'estimatedTokens'>;

const FORMAT_IDENTIFIER = 'planmo-memory' as const;
const SCHEMA_VERSION = 1 as const;
const ROW_KINDS = ['decision', 'lesson', 'fact', 'warning'] as const;
type RowKind = (typeof ROW_KINDS)[number];

const MARKDOWN_HEADER = '# planmo-memory (schemaVersion: 1)';
/** One bullet: `- [<kind>] <summary> (source: <source>) <!-- id: <id> -->`. */
const MARKDOWN_BULLET = /^- \[([a-z-]+)\] (.*) \(source: (.+)\)(?: <!-- id: ([^>]*) -->)?$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isRowKind(value: unknown): value is RowKind {
  return typeof value === 'string' && (ROW_KINDS as readonly string[]).includes(value);
}

function describe(value: unknown): string {
  return typeof value === 'string' ? JSON.stringify(value) : String(value);
}

/** Canonical row object: stable key order for byte-stable output. */
function canonicalRow(row: MemoryRowView): MemoryRowView {
  return { id: row.id, kind: row.kind, summary: row.summary, source: row.source };
}

/** Deterministic copy sorted by id (never mutates the caller's array). */
function sortedById(rows: readonly MemoryRowView[]): MemoryRowView[] {
  return [...rows].sort((a, b) => a.id.localeCompare(b.id));
}

function contextSlice(view: ContextSlice): {
  project: string;
  contextId: string;
  estimatedTokens: number;
} {
  return {
    project: view.project,
    contextId: view.contextId,
    estimatedTokens: view.estimatedTokens,
  };
}

/**
 * Deterministic export of a context + memory view into a portable format.
 * Rows are sorted by id before emit. Output never contains timestamps.
 */
export function exportMemoryPortable(
  view: Pick<ContextView, 'project' | 'contextId' | 'estimatedTokens'> | null,
  rows: readonly MemoryRowView[],
  format: PortableFormat,
): string {
  const sorted = sortedById(rows);
  if (format === 'json') {
    return toJson(view, sorted);
  }
  if (format === 'jsonl') {
    return toJsonl(view, sorted);
  }
  return toMarkdown(view, sorted);
}

/**
 * Round-trip import; throws a descriptive Error on malformed/stale input.
 * JSONL: first line is the document header, subsequent lines are rows.
 */
export function importMemoryPortable(text: string, format: PortableFormat): PortableMemoryDocument {
  if (format === 'json') return importJson(text);
  if (format === 'jsonl') return importJsonl(text);
  return importMarkdown(text);
}

// ------------------------------------------------------------------ export

function toJson(view: ContextSlice | null, rows: readonly MemoryRowView[]): string {
  return JSON.stringify(documentObject(view, rows), null, 2);
}

function toJsonl(view: ContextSlice | null, rows: readonly MemoryRowView[]): string {
  const lines = [
    JSON.stringify(headerObject(view)),
    ...rows.map((row) => JSON.stringify(canonicalRow(row))),
  ];
  return lines.join('\n');
}

function toMarkdown(view: ContextSlice | null, rows: readonly MemoryRowView[]): string {
  const lines: string[] = [MARKDOWN_HEADER];
  if (view !== null) {
    const ctx = contextSlice(view);
    lines.push(
      '',
      `project: ${ctx.project}`,
      `contextId: ${ctx.contextId}`,
      `estimatedTokens: ${ctx.estimatedTokens}`,
    );
  }
  lines.push('', ...rows.map(markdownBullet));
  return lines.join('\n');
}

/** Canonical document object: deterministic key order. */
function documentObject(
  view: ContextSlice | null,
  rows: readonly MemoryRowView[],
): Record<string, unknown> {
  const doc = headerObject(view);
  doc.rows = rows.map(canonicalRow);
  return doc;
}

/** Canonical JSONL header (document minus rows): deterministic key order. */
function headerObject(view: ContextSlice | null): Record<string, unknown> {
  const header: Record<string, unknown> = {
    format: FORMAT_IDENTIFIER,
    schemaVersion: SCHEMA_VERSION,
  };
  if (view !== null) {
    header.context = contextSlice(view);
  }
  return header;
}

function markdownBullet(row: MemoryRowView): string {
  // Newlines cannot survive a single-line bullet; normalized to spaces so
  // the line stays machine-parseable (see storage-portability.md).
  const summary = row.summary.replace(/\r?\n/g, ' ');
  return `- [${row.kind}] ${summary} (source: ${row.source}) <!-- id: ${row.id} -->`;
}

// ------------------------------------------------------------------ import

function importJson(text: string): PortableMemoryDocument {
  if (text.trim().length === 0) {
    throw new Error('memory portable import (json): input is empty');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new Error(
      `memory portable import (json): malformed JSON: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  return parseDocument(parsed, 'json');
}

function importJsonl(text: string): PortableMemoryDocument {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    throw new Error('memory portable import (jsonl): input is empty');
  }
  const lines = trimmed
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const headerText = lines[0];
  if (headerText === undefined) {
    throw new Error('memory portable import (jsonl): missing header line');
  }
  let header: unknown;
  try {
    header = JSON.parse(headerText);
  } catch (err) {
    throw new Error(
      `memory portable import (jsonl): malformed JSON in header line: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (!isRecord(header)) {
    throw new Error('memory portable import (jsonl): header must be an object');
  }
  if (header.format !== FORMAT_IDENTIFIER) {
    throw new Error(
      `memory portable import (jsonl): expected format "planmo-memory", got ${describe(header.format)}`,
    );
  }
  if (header.schemaVersion !== SCHEMA_VERSION) {
    throw new Error(
      `memory portable import (jsonl): unsupported schemaVersion ${describe(header.schemaVersion)}; expected 1`,
    );
  }
  let context: ContextSlice | undefined;
  if (header.context !== undefined) {
    context = parseContext(header.context, 'jsonl');
  }

  const rows: MemoryRowView[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch (err) {
      throw new Error(
        `memory portable import (jsonl): malformed JSON in row line ${i + 1}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    rows.push(parseRow(parsed, i - 1, 'jsonl'));
  }
  return buildDocument(context, rows);
}

function importMarkdown(text: string): PortableMemoryDocument {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    throw new Error('memory portable import (markdown): input is empty');
  }
  const lines = trimmed.split(/\r?\n/);
  const header = lines[0];
  if (header === undefined || header !== MARKDOWN_HEADER) {
    throw new Error(
      `memory portable import (markdown): expected header "${MARKDOWN_HEADER}" on the first line, got ${
        header === undefined ? 'nothing' : JSON.stringify(header)
      }`,
    );
  }

  const acc: { project?: string; contextId?: string; estimatedTokens?: number } = {};
  let sawMetadata = false;
  const rows: MemoryRowView[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) continue;
    const trimmedLine = line.trim();
    if (trimmedLine.length === 0) continue;

    // Metadata (project/contextId/estimatedTokens) is only valid before the
    // first row bullet and must be complete (export always writes all three).
    if (rows.length === 0) {
      const project = stripPrefix(trimmedLine, 'project:');
      if (project !== null) {
        acc.project = project;
        sawMetadata = true;
        continue;
      }
      const contextId = stripPrefix(trimmedLine, 'contextId:');
      if (contextId !== null) {
        acc.contextId = contextId;
        sawMetadata = true;
        continue;
      }
      const tokens = stripPrefix(trimmedLine, 'estimatedTokens:');
      if (tokens !== null) {
        if (!/^\d+$/.test(tokens)) {
          throw new Error(
            `memory portable import (markdown): estimatedTokens must be a non-negative integer, got ${JSON.stringify(tokens)}`,
          );
        }
        acc.estimatedTokens = Number(tokens);
        sawMetadata = true;
        continue;
      }
    }

    const bullet = MARKDOWN_BULLET.exec(trimmedLine);
    if (bullet !== null) {
      if (
        sawMetadata &&
        (acc.project === undefined ||
          acc.contextId === undefined ||
          acc.estimatedTokens === undefined)
      ) {
        throw new Error(
          'memory portable import (markdown): partial context metadata; project/contextId/estimatedTokens must all be present',
        );
      }
      rows.push(parseBullet(bullet, rows.length));
      continue;
    }

    throw new Error(
      `memory portable import (markdown): unexpected line ${i + 1}: ${JSON.stringify(trimmedLine)}`,
    );
  }

  if (
    sawMetadata &&
    (acc.project === undefined || acc.contextId === undefined || acc.estimatedTokens === undefined)
  ) {
    throw new Error(
      'memory portable import (markdown): partial context metadata; project/contextId/estimatedTokens must all be present',
    );
  }
  const context: ContextSlice | undefined =
    sawMetadata &&
    acc.project !== undefined &&
    acc.contextId !== undefined &&
    acc.estimatedTokens !== undefined
      ? { project: acc.project, contextId: acc.contextId, estimatedTokens: acc.estimatedTokens }
      : undefined;
  return buildDocument(context, rows);
}

/** Shared document validation for the single-document (JSON) format. */
function parseDocument(value: unknown, format: PortableFormat): PortableMemoryDocument {
  if (!isRecord(value)) {
    throw new Error(`memory portable import (${format}): root must be an object`);
  }
  if (value.format !== FORMAT_IDENTIFIER) {
    throw new Error(
      `memory portable import (${format}): expected format "planmo-memory", got ${describe(value.format)}`,
    );
  }
  if (value.schemaVersion !== SCHEMA_VERSION) {
    throw new Error(
      `memory portable import (${format}): unsupported schemaVersion ${describe(value.schemaVersion)}; expected 1`,
    );
  }
  let context: ContextSlice | undefined;
  if (value.context !== undefined) {
    context = parseContext(value.context, format);
  }
  if (!Array.isArray(value.rows)) {
    throw new Error(`memory portable import (${format}): rows must be an array`);
  }
  const rows = value.rows.map((row, index) => parseRow(row, index, format));
  return buildDocument(context, rows);
}

function buildDocument(
  context: ContextSlice | undefined,
  rows: readonly MemoryRowView[],
): PortableMemoryDocument {
  return {
    format: FORMAT_IDENTIFIER,
    schemaVersion: SCHEMA_VERSION,
    ...(context !== undefined ? { context } : {}),
    rows,
  };
}

function parseContext(value: unknown, format: PortableFormat): ContextSlice {
  if (!isRecord(value)) {
    throw new Error(`memory portable import (${format}): context must be an object`);
  }
  if (
    typeof value.project !== 'string' ||
    typeof value.contextId !== 'string' ||
    typeof value.estimatedTokens !== 'number'
  ) {
    throw new Error(
      `memory portable import (${format}): context must have string project/contextId and numeric estimatedTokens`,
    );
  }
  return {
    project: value.project,
    contextId: value.contextId,
    estimatedTokens: value.estimatedTokens,
  };
}

function parseRow(value: unknown, index: number, format: PortableFormat): MemoryRowView {
  if (!isRecord(value)) {
    throw new Error(`memory portable import (${format}): row ${index} must be an object`);
  }
  if (
    typeof value.id !== 'string' ||
    typeof value.summary !== 'string' ||
    typeof value.source !== 'string'
  ) {
    throw new Error(
      `memory portable import (${format}): row ${index} must have string id/kind/summary/source`,
    );
  }
  if (!isRowKind(value.kind)) {
    throw new Error(
      `memory portable import (${format}): row ${index} has invalid kind ${describe(value.kind)}; expected decision|lesson|fact|warning`,
    );
  }
  return canonicalRow({
    id: value.id,
    kind: value.kind,
    summary: value.summary,
    source: value.source,
  });
}

function parseBullet(match: RegExpExecArray, index: number): MemoryRowView {
  const kind = match[1];
  const summary = match[2];
  const source = match[3];
  const id = match[4] ?? '';
  if (kind === undefined || summary === undefined || source === undefined) {
    throw new Error(`memory portable import (markdown): row ${index} is malformed`);
  }
  if (!isRowKind(kind)) {
    throw new Error(
      `memory portable import (markdown): row ${index} has invalid kind ${JSON.stringify(kind)}; expected decision|lesson|fact|warning`,
    );
  }
  return { id, kind, summary, source };
}

function stripPrefix(line: string, prefix: string): string | null {
  return line.startsWith(prefix) ? line.slice(prefix.length).trim() : null;
}
