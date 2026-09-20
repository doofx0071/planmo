import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import {
  ManifestSchema,
  ProjectConfigSchema,
  StateSchema,
  type ProjectConfig,
  type StateDocument,
} from '@planmo/schema';
import { ProjectNotFoundError } from './errors.js';
import { findProjectRoot } from './paths.js';

/**
 * planmo status (P03-04) — read-only workspace introspection.
 *
 * Reads and validates the canonical documents against their strict schemas.
 * NEVER writes; status is the diagnostic surface that init/generation
 * phases and `planmo doctor` build on.
 */

export type StatusLevel = 'ok' | 'warning' | 'error';

export interface StatusIssue {
  level: StatusLevel;
  doc: string;
  message: string;
}

export interface WorkspaceStatus {
  /** Resolved project root (always present when status resolves). */
  root: string;
  project: ProjectConfig | null;
  state: StateDocument | null;
  issues: StatusIssue[];
  /** True when every canonical document parses and validates. */
  healthy: boolean;
}

export interface StatusOptions {
  /** Directory to start the upward root search from (default: cwd). */
  startDir?: string;
  /** Explicit root bypasses the search (used by tests and --root). */
  root?: string;
}

/** Minimal duck-typed subset of a Zod schema used by the document reader. */
interface DocSchema {
  safeParse: (data: unknown) => {
    success: boolean;
    data?: unknown;
    error?: { issues: ReadonlyArray<{ message: string; path: ReadonlyArray<PropertyKey> }> };
  };
}

async function readDoc(
  schema: DocSchema,
  path: string,
): Promise<{ ok: true; value: unknown } | { ok: false; issues: string[] }> {
  let raw: string;
  try {
    raw = await readFile(path, 'utf8');
  } catch {
    return { ok: false, issues: [] };
  }
  let parsed: unknown;
  try {
    parsed = path.endsWith('.json') ? (JSON.parse(raw) as unknown) : (parseYaml(raw) as unknown);
  } catch (err) {
    return { ok: false, issues: [`unparseable: ${(err as Error).message}`] };
  }
  const result = schema.safeParse(parsed);
  if (result.success) {
    return { ok: true, value: result.data };
  }
  const issues = (result.error?.issues ?? []).map(
    (i: { message: string; path: ReadonlyArray<PropertyKey> }) => {
      const where = i.path.length ? ` at ${i.path.join('.')}` : '';
      return `invalid${where}: ${i.message}`;
    },
  );
  return { ok: false, issues };
}

/** Read and validate the canonical documents of a workspace. */
export async function readStatus(opts: StatusOptions = {}): Promise<WorkspaceStatus> {
  const root = opts.root ?? (await findProjectRoot(opts.startDir ?? process.cwd()));

  // An explicit root is trusted as the project location, but it must still
  // carry the .planmo marker — status of a non-project directory is an
  // error, not a healthy-but-empty report.
  if (opts.root !== undefined) {
    const { access } = await import('node:fs/promises');
    try {
      await access(join(root, '.planmo'));
    } catch {
      throw new ProjectNotFoundError(root);
    }
  }

  const issues: StatusIssue[] = [];

  const projectPath = join(root, '.planmo', 'project.yml');
  const statePath = join(root, '.planmo', 'state.yml');
  const manifestPath = join(root, '.planmo', 'manifest.json');

  // Each canonical document is independently validated; every failure is
  // collected so status reports the FULL picture, not the first error.
  const docs = await Promise.all([
    readDoc(ProjectConfigSchema, projectPath).then((r) => ({ doc: 'project.yml', r })),
    readDoc(StateSchema, statePath).then((r) => ({ doc: 'state.yml', r })),
    readDoc(ManifestSchema, manifestPath).then((r) => ({ doc: 'manifest.json', r })),
  ]);

  let project: ProjectConfig | null = null;
  let state: StateDocument | null = null;

  for (const { doc, r } of docs) {
    if (!r.ok) {
      issues.push({
        level: 'error',
        doc,
        message: r.issues.length === 0 ? 'missing document' : r.issues.join('; '),
      });
      continue;
    }
    if (doc === 'project.yml') project = r.value as ProjectConfig;
    if (doc === 'state.yml') state = r.value as StateDocument;
  }

  return {
    root,
    project,
    state,
    issues,
    healthy: issues.length === 0,
  };
}
