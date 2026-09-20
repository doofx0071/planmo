import type { ArtifactKind, OwnershipMode } from '@planmo/schema';
import type { PlanningIR } from './ir.js';

/**
 * Frozen worker-facing contracts for the Phase 05 generator pipeline.
 *
 * These are the ONLY agreements between the three parallel workstreams:
 * the renderers (P05-02/P05-09), the manifest/checksum builder (P05-03),
 * and the synth preview (P05-08). The compile pipeline composes them in
 * `compile.ts`. Do not change these types without changing compile.ts.
 */

/**
 * One generated artifact: a repo-relative path plus its exact bytes.
 * `ownership` follows ADR-0016 classes:
 *   - generated  — PlanMo owns the whole file (safe to rewrite)
 *   - merged     — PlanMo owns explicit structured sections (markers)
 *   - seeded     — PlanMo created it once; afterwards the user owns it
 *   - user       — PlanMo never writes it
 */
export interface GeneratedArtifact {
  /** Repo-relative path with forward slashes, e.g. "planning/ROADMAP.md". */
  path: string;
  /** Exact UTF-8 content bytes. */
  content: string;
  kind: ArtifactKind;
  ownership: OwnershipMode;
  /** Pack refs / inputs that contributed content (for lineage). */
  sources: readonly string[];
}

/** A renderer maps the IR to artifacts. Must be pure and deterministic. */
export type Renderer = (ir: PlanningIR) => readonly GeneratedArtifact[];

/**
 * NOTE on function contracts: the Phase 05 pipeline functions are defined in
 * their owning modules (render.ts → renderPlanningDocuments /
 * renderStandardsAndContext, manifest.ts → buildGenerationManifest,
 * synth.ts → previewSynth). contracts.ts carries only the agreed INPUT/OUTPUT
 * types so the three parallel workstreams could build without coupling.
 */

/**
 * Minimal manifest entry shape the pipeline needs. The schema's
 * ManifestEntry requires checksum/generationVersion; the builder fills
 * those, so the entry view here carries the checksum as a hex string.
 */
export interface GenerationManifestEntry {
  path: string;
  kind: ArtifactKind;
  generator: string;
  sources: readonly string[];
  checksum: string; // sha256 hex
  ownershipMode: OwnershipMode;
  generationVersion: string;
}

export interface GenerationManifestDocument {
  schemaVersion: number;
  revision: number;
  entries: GenerationManifestEntry[];
}

/** P05-08 (CHG-001): safe upgrade/synth preview — report only, never writes. */
export interface SynthChange {
  path: string;
  action: 'create' | 'overwrite' | 'merge' | 'skip' | 'collision';
  ownership: OwnershipMode;
  /** Reason shown to the user, e.g. "user-owned, not modified", "unmanaged file". */
  reason: string;
}

export interface SynthPreview {
  /** All planned changes in deterministic (path-sorted) order. */
  changes: SynthChange[];
  /** True when applying would touch no user-owned/unmanaged content. */
  safe: boolean;
  /** Human-readable summary lines (deterministic order). */
  summary: string[];
}
