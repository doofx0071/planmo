import { writeManaged, type PlannedWrite } from '@planmo/core';
import type { PlanningIR } from './ir.js';
import type { GeneratedArtifact, GenerationManifestDocument, SynthPreview } from './contracts.js';
import { renderPlanningDocuments } from './render.js';
import { renderPlanWorkspace } from './plan-workspace.js';
import { renderStandardsAndContext } from './standards-context.js';
import { buildGenerationManifest, toPersistableManifest } from './manifest.js';
import { previewSynth } from './synth.js';

/**
 * Phase 05 compile pipeline (P05 integration seam, lead-owned).
 *
 * IR → renderers → generation manifest → synth preview → safe apply.
 * Generation NEVER writes outside the project root and never overwrites
 * unmanaged content: the pipeline goes through the ManagedWriter's
 * collision-refusing plan/apply, and `dryRun` produces the exact preview
 * without touching disk (P05-08 / CHG-001 safe upgrade preview).
 *
 * Determinism: a second generation with unchanged inputs produces the same
 * bytes and the same manifest (P05-05) — the renderers are pure and the
 * manifest ordering is path-sorted.
 */

export interface CompileOptions {
  root: string;
  /** Permit replacing files the manifest already owns (default: false). */
  allowOverwrite?: boolean;
  /** Compute + report the plan without writing anything. */
  dryRun?: boolean;
}

export interface CompileResult {
  root: string;
  artifacts: readonly GeneratedArtifact[];
  manifest: GenerationManifestDocument;
  preview: SynthPreview;
  written: string[];
  collisions: string[];
  checksums: Record<string, string>;
  diff: string;
}

function readExistingManifest(root: string): Promise<GenerationManifestDocument | null> {
  return import('node:fs/promises')
    .then((fs) => fs.readFile(`${root}/.planmo/manifest.json`, 'utf8'))
    .then((text) => {
      const persisted = JSON.parse(text) as {
        schemaVersion: number;
        revision: number;
        entries: Array<{
          path: string;
          kind: GeneratedArtifact['kind'];
          generator: string;
          sources: string[];
          checksum: { algorithm: string; digest: string };
          ownershipMode: GeneratedArtifact['ownership'];
          generationVersion: string;
        }>;
      };
      // Reverse map the persisted {algorithm,digest} shape into the pipeline's
      // hex-checksum entry view (mirror of toPersistableManifest).
      return {
        schemaVersion: persisted.schemaVersion,
        revision: persisted.revision,
        entries: persisted.entries.map((e) => ({
          path: e.path,
          kind: e.kind,
          generator: e.generator,
          sources: e.sources,
          checksum: e.checksum.digest,
          ownershipMode: e.ownershipMode,
          generationVersion: e.generationVersion,
        })),
      } satisfies GenerationManifestDocument;
    })
    .catch(() => null);
}

function listExistingPaths(root: string): Promise<string[]> {
  return import('node:fs/promises')
    .then((fs) => fs.readdir(root, { recursive: true, withFileTypes: true }))
    .then((entries) => {
      // Normalize BOTH sides to forward slashes before stripping the root
      // prefix (Windows parentPath uses backslashes).
      const normRoot = root.replaceAll('\\', '/');
      return entries
        .filter(
          (e) =>
            e.isFile() && !e.parentPath.includes('node_modules') && !e.parentPath.includes('.git'),
        )
        .map((e) => {
          const parent = e.parentPath.replaceAll('\\', '/');
          const relParent = parent.startsWith(normRoot) ? parent.slice(normRoot.length) : parent;
          return `${relParent.replace(/^\//, '')}/${e.name}`;
        });
    })
    .catch(() => []);
}

/**
 * Compile + apply the full generation for one project root.
 * `dryRun: true` performs the preview and diff without writing.
 */
export async function compileWorkspace(
  ir: PlanningIR,
  opts: CompileOptions,
): Promise<CompileResult> {
  const root = opts.root.replace(/[\\/]+$/, '');

  const artifacts = [
    ...renderPlanningDocuments(ir),
    ...renderStandardsAndContext(ir),
    ...renderPlanWorkspace(ir),
  ];
  const { document } = buildGenerationManifest(artifacts, ir);

  const existingManifest = await readExistingManifest(root);
  const existingPaths = await listExistingPaths(root);

  const preview = previewSynth(artifacts, {
    existingPaths,
    ...(existingManifest ? { entries: existingManifest.entries } : {}),
  });

  if (!preview.safe && !opts.allowOverwrite) {
    // Collision refusal mirrors the writer: unmanaged existing content is
    // never silently overwritten (ADR-0016 + exit gate "regeneration
    // preserves unmanaged content").
    return {
      root,
      artifacts,
      manifest: document,
      preview,
      written: [],
      collisions: preview.changes.filter((c) => c.action === 'collision').map((c) => c.path),
      checksums: {},
      diff: '',
    };
  }

  // Only write what the preview says is writable. `skip` means the artifact is
  // seeded-and-already-on-disk or user-owned, and ADR-0016 says PlanMo does not
  // touch either — handing them to writeManaged would clobber the user's edits
  // on the next `generate`. The preview is the authority; the writer only knows
  // a single allowOverwrite flag and cannot express per-artifact ownership.
  const skipped = new Set(preview.changes.filter((c) => c.action === 'skip').map((c) => c.path));
  const writes: PlannedWrite[] = artifacts
    .filter((a) => !skipped.has(a.path))
    .map((a) => ({ path: a.path, content: a.content }));
  // The manifest itself is a generated artifact record (never user-owned);
  // persist it in the schema-validated .planmo/manifest.json shape.
  writes.push({
    path: '.planmo/manifest.json',
    content: `${JSON.stringify(toPersistableManifest(document), null, 2)}\n`,
  });

  // contentDirs must cover every directory artifacts can land in, including
  // nested ones (planning/handoffs, planning/policies grow later phases).
  const dirSet = new Set<string>(['.planmo', 'planning']);
  for (const artifact of artifacts) {
    const dir = artifact.path.includes('/')
      ? artifact.path.slice(0, artifact.path.lastIndexOf('/'))
      : '';
    if (dir) dirSet.add(dir);
  }
  const contentDirs = [...dirSet].sort();

  const result = await writeManaged(root, writes, {
    contentDirs,
    allowOverwrite: opts.allowOverwrite ?? preview.safe,
    ...(opts.dryRun !== undefined ? { dryRun: opts.dryRun } : {}),
  });

  return {
    root,
    artifacts,
    manifest: document,
    preview,
    written: result.written,
    collisions: result.collisions,
    checksums: result.checksums,
    diff: result.diff,
  };
}
