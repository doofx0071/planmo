import { createHash } from 'node:crypto';
import type { PackLockEntry as PackLockEntryType } from '@planmo/schema';
import type { ProjectConfig, PlanningDepth, PhaseMode, PlanDocument } from '@planmo/schema';
import type { ResolutionResult } from '@planmo/packs';
import type { StandardsSelection, PlanningProfile } from '@planmo/packs';

/**
 * Planning compiler IR (P05-01).
 *
 * The IR is the deterministic intermediate representation the Phase 05
 * pipeline compiles: normalized project model + lockfile + resolution +
 * profile + standards selection → a plain, sorted, hash-stable IR that
 * renderers consume. The IR itself is pure data: no clocks, no random, no
 * filesystem — the same inputs always produce the same bytes (exit gate:
 * "byte-stable or intentionally normalized output").
 *
 * The IR never carries AI output. AI remains an upstream proposal source;
 * anything model-derived enters through the validated `ProjectConfig`
 * (proposals are normalized before this module runs).
 */

export const IR_SCHEMA_VERSION = 1 as const;

/** Canonical phase spine shared by all generated plan documents. */
export interface PhaseNode {
  /** Zero-padded phase number, e.g. "00", "05". */
  id: string;
  title: string;
  objective: string;
}

/**
 * Full canonical phase spine (00–12) — the same engine that produced this
 * repo's own roadmap. Deterministic and fixed for a given IR version.
 */
export const CANONICAL_PHASES: readonly PhaseNode[] = [
  {
    id: '00',
    title: 'Product & research foundation',
    objective: 'Lock product boundaries, naming, licensing criteria, and non-goals.',
  },
  {
    id: '01',
    title: 'Repository & engineering foundation',
    objective: 'Create monorepo toolchain, strict types, lint/format/test, CI, boundaries.',
  },
  {
    id: '02',
    title: 'Canonical project model & schemas',
    objective: 'Schema-version every persisted PlanMo document and add migration tests.',
  },
  {
    id: '03',
    title: 'CLI foundation',
    objective: 'Implement init, safe filesystem writer, dry-run/diff, ownership rules, status.',
  },
  {
    id: '04',
    title: 'Pack & profile system',
    objective: 'Implement declarative packs, deterministic resolution, lockfile, profiles.',
  },
  {
    id: '05',
    title: 'Planning compiler & artifact generator',
    objective: 'Generate plan documents with an ownership manifest and reproducible regeneration.',
  },
  {
    id: '06',
    title: 'Agent bridge',
    objective: 'Implement generic and per-agent adapters with a structured AI proposal contract.',
  },
  {
    id: '07',
    title: 'Frontend design engine',
    objective: 'Implement design profiles, design tokens, eight styles, frontend docs.',
  },
  {
    id: '08',
    title: 'Workflow/session engine',
    objective: 'Implement phases, handoffs, work packets, gates, planmo next.',
  },
  {
    id: '09',
    title: 'Trace, validate, doctor & drift',
    objective: 'Implement trace graph, validation, drift detection, doctor command.',
  },
  {
    id: '10',
    title: 'Existing repository adoption',
    objective: 'Support adopting an existing repository incrementally.',
  },
  {
    id: '11',
    title: 'Ecosystem & integrations',
    objective: 'Packs registry, templates, agent ecosystem integrations.',
  },
  {
    id: '12',
    title: 'Hardening, pilot & v1',
    objective: 'Hardening, security review, pilot, and v1 release.',
  },
];

/**
 * Inputs to the IR compiler. Everything is already schema-validated at the
 * boundary (ProjectConfigSchema / lockfile / resolution / profiles / packs);
 * this module normalizes without re-validating.
 */
export interface IrInput {
  project: ProjectConfig;
  resolution: ResolutionResult;
  lockfile: { planmoVersion: string; packs: readonly PackLockEntryType[] };
  /** Compiled profile for the project's planning depth (null for custom). */
  profile: PlanningProfile | null;
  /** Standards + policy selection for the project context (never undefined). */
  standards: StandardsSelection;
  /**
   * The recorded plan document, when the project has one.
   *
   * A plan AUGMENTS the canonical spine rather than replacing it: with a plan, its
   * phases and tasks are the project's; without one, the canonical spine and the
   * seeded tasks stand exactly as before. That is what keeps every workspace
   * generated before the AI planner existed — and every golden fixture — valid and
   * byte-identical, and makes the AI opt-in rather than a breaking change.
   */
  plan?: PlanDocument | null;
}

/**
 * The compiled IR — a plain, deterministic, hash-stable snapshot of every
 * input a renderer may need. All collections are sorted; there is no
 * timestamp or ephemeral state anywhere in the structure.
 */
export interface PlanningIR {
  schemaVersion: typeof IR_SCHEMA_VERSION;
  /** sha256 of the canonical (sorted-key) serialization of the inputs. */
  inputHash: string;
  project: ProjectConfig;
  depth: PlanningDepth;
  phaseMode: PhaseMode;
  /** Locked packs sorted by ref — the exact versions/checksums generation binds to. */
  lockedPacks: readonly PackLockEntryType[];
  /** Phases this project plans through (the plan's, or the canonical spine). */
  phases: readonly PhaseNode[];
  /** The recorded plan document, or null when the project has none. */
  plan: PlanDocument | null;
  /** Standards selection, sorted, with conflicts surfaced (never silently resolved). */
  standards: StandardsSelection;
  /** Compiled profile or null when depth is custom. */
  profile: PlanningProfile | null;
}

/** Canonical JSON: recursive key-sort so identical inputs hash identically. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function sha256Hex(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/**
 * Depth → phase spine pruning. `lean` plans the first 4 phases, `standard`
 * the first 7, `production` the first 10, `high-assurance` all 13, `custom`
 * all 13 (the canonical spine is the safe default). Deterministic.
 */
export function phasesForDepth(depth: PlanningDepth): readonly PhaseNode[] {
  const counts: Record<PlanningDepth, number> = {
    lean: 4,
    standard: 7,
    production: 10,
    'high-assurance': 13,
    custom: 13,
  };
  return CANONICAL_PHASES.slice(0, counts[depth]);
}

function sortPacks(packs: readonly PackLockEntryType[]): readonly PackLockEntryType[] {
  return [...packs].sort((a, b) => {
    if (a.ref !== b.ref) return a.ref < b.ref ? -1 : 1;
    if (a.version !== b.version) return a.version < b.version ? -1 : 1;
    // Integrity is optional in the schema; tiebreak on its digest when
    // present ('' when absent) so the sort stays a deterministic total order.
    const da = a.integrity?.digest ?? '';
    const db = b.integrity?.digest ?? '';
    return da < db ? -1 : da > db ? 1 : 0;
  });
}

/** Documented default when a project config omits its planning block. */
const DEFAULT_PLANNING = {
  depth: 'standard',
  phaseMode: 'gated',
  freshSessionPerPhase: true,
} as const;

/** Compile a deterministic IR from validated inputs (P05-01). */
export function buildIr(input: IrInput): PlanningIR {
  const sortedPacks = sortPacks(input.lockfile.packs);
  // ProjectConfig.planning is optional in the schema; the IR compiler
  // normalizes it to the documented default (deterministic, never silent
  // on a per-build basis).
  const planning = input.project.planning ?? DEFAULT_PLANNING;
  const normalizedProject: ProjectConfig = { ...input.project, planning };
  const plan = input.plan ?? null;
  // With a plan, the project's own decomposition is the spine. Without one, the
  // canonical depth-pruned spine — unchanged, which is what keeps the goldens and
  // every pre-existing workspace byte-identical.
  const phases: readonly PhaseNode[] =
    plan === null
      ? phasesForDepth(planning.depth)
      : plan.phases.map((phase) => ({
          id: phase.id,
          title: phase.title,
          objective: phase.objective,
        }));

  const hash = sha256Hex(
    canonicalJson({
      project: normalizedProject,
      packs: sortedPacks,
      profile: input.profile,
      standards: input.standards,
      phases,
      // The plan is an input when there IS one. A project without a plan has
      // unchanged inputs, so its hash must not move either — otherwise adopting
      // the AI planner would make every existing workspace report as out of date.
      // Tasks are inside `plan`, so a plan that changes its tasks without changing
      // its phases still changes the hash.
      ...(plan !== null ? { plan } : {}),
    }),
  );

  return {
    schemaVersion: IR_SCHEMA_VERSION,
    inputHash: hash,
    project: normalizedProject,
    depth: planning.depth,
    phaseMode: planning.phaseMode,
    lockedPacks: sortedPacks,
    phases,
    plan,
    standards: input.standards,
    profile: input.profile,
  };
}
