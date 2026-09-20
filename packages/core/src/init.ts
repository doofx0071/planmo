import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import {
  ManifestSchema,
  ProjectConfigSchema,
  StateSchema,
  type AccessibilityLevel,
  type AgentId,
  type DesignDensity,
  type DesignStyle,
  type PhaseMode,
  type PlanningDepth,
  type ProjectConfig,
  type ProjectLifecycle,
  type ProjectRisk,
  type ProjectType,
} from '@planmo/schema';
import { writeManaged, type PlannedWrite } from './writer.js';

/**
 * planmo init — create a minimal, schema-valid PlanMo workspace (P03-03).
 *
 * Writes ONLY through the ManagedWriter (root containment, symlink safety,
 * collision refusal, atomic temp+rename, checksums, dry-run/diff). Every
 * emitted document is validated against its strict Zod schema BEFORE any
 * byte is written; a template failure aborts the whole plan.
 */

export interface InitOptions {
  /** Absolute or relative target directory (created if missing). */
  root: string;
  /** Project display name (default: basename of root). */
  name?: string;
  lifecycle?: ProjectLifecycle;
  type?: ProjectType;
  risk?: ProjectRisk;
  primaryAgent?: AgentId;
  style?: DesignStyle;
  density?: DesignDensity;
  accessibility?: AccessibilityLevel;
  planningDepth?: PlanningDepth;
  phaseMode?: PhaseMode;
  /** Permit replacing files that already exist (default: refuse). */
  allowOverwrite?: boolean;
  /** Compute + report the plan without writing anything. */
  dryRun?: boolean;
}

export interface InitResult {
  root: string;
  written: string[];
  collisions: string[];
  checksums: Record<string, string>;
  project: ProjectConfig;
  diff: string;
}

function baseName(root: string): string {
  return (
    root
      .replace(/[\\/]+$/, '')
      .split(/[\\/]/)
      .pop() ?? 'project'
  );
}

/**
 * Single source of truth for the default workspace documents produced by
 * init. Each is a plain object validated by the exported schema builders;
 * `@planmo/schema` constructor types are strict, so invalid defaults fail
 * typecheck (defense in depth) and runtime validation still runs.
 */
export function workspaceDocuments(opts: InitOptions): Record<string, string> {
  const project = ProjectConfigSchema.parse({
    schemaVersion: 1,
    project: {
      name: opts.name ?? baseName(opts.root),
      lifecycle: opts.lifecycle ?? 'greenfield',
      type: opts.type ?? 'web-application',
      risk: opts.risk ?? 'medium',
    },
    planning: {
      depth: opts.planningDepth ?? 'standard',
      phaseMode: opts.phaseMode ?? 'gated',
      freshSessionPerPhase: true,
    },
    agents: {
      primary: opts.primaryAgent ?? 'opencode',
    },
    packs: [],
  });

  const state = StateSchema.parse({
    schemaVersion: 1,
    currentPhase: '00',
    status: 'planned',
    completedPhases: [],
    blockedTasks: [],
  });

  const manifest = ManifestSchema.parse({
    schemaVersion: 1,
    revision: 0,
    entries: [],
  });

  // Validate ProjectConfig again through its own schema (parse already did,
  // but keep the invariant explicit: nothing invalid is ever emitted).
  const validated = ProjectConfigSchema.parse(project);
  StateSchema.parse(state);
  ManifestSchema.parse(manifest);

  return {
    '.planmo/project.yml': stringifyYaml(validated),
    '.planmo/state.yml': stringifyYaml(state),
    '.planmo/manifest.json': `${JSON.stringify(manifest, null, 2)}\n`,
  };
}

/** Run init; returns the plan result and the validated project document. */
export async function initWorkspace(opts: InitOptions): Promise<InitResult> {
  const root = opts.root;
  const docs = workspaceDocuments(opts);
  const writes: PlannedWrite[] = Object.entries(docs).map(([path, content]) => ({
    path,
    content,
  }));

  const result = await writeManaged(root, writes, {
    contentDirs: ['.planmo'],
    ...(opts.allowOverwrite !== undefined ? { allowOverwrite: opts.allowOverwrite } : {}),
    ...(opts.dryRun !== undefined ? { dryRun: opts.dryRun } : {}),
  });

  // The project document embedded in the plan (re-parsed for the caller).
  const project = ProjectConfigSchema.parse(parseYaml(docs['.planmo/project.yml']!));

  return {
    root,
    written: result.written,
    collisions: result.collisions,
    checksums: result.checksums,
    project,
    diff: result.diff,
  };
}
