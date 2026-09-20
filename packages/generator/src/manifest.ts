import {
  ARTIFACT_KINDS,
  OWNERSHIP_MODES,
  SCHEMA_VERSION,
  SemVerString,
  type ManifestDocument,
} from '@planmo/schema';
import { sha256Hex, type PlanningIR } from './ir.js';
import type {
  GeneratedArtifact,
  GenerationManifestDocument,
  GenerationManifestEntry,
} from './contracts.js';

/**
 * Generation manifest & checksum builder (P05-03).
 *
 * Turns the renderers' deterministic artifacts into the `.planmo/manifest.json`
 * payload: one entry per artifact with its sha256 checksum, generator identity,
 * ownership mode, the PlanMo version that generated it, and deterministic
 * lineage tracing the entry back to the input model plus every locked pack.
 *
 * Determinism guarantees (exit gate "byte-stable or intentionally normalized
 * output"):
 * - entries are sorted by repo-relative path;
 * - checksums are sha256 of the exact UTF-8 content bytes (see {sha256Hex});
 * - lineage markers are total-ordered and deduped, so lockfile input order can
 *   never change the manifest bytes;
 * - no clocks, no random, no filesystem access.
 *
 * The returned `document` is the in-memory view: its entries carry the checksum
 * as a hex string (the frozen `GenerationManifestEntry` shape). The schema's
 * `ManifestEntry` instead requires `checksum: { algorithm, digest }` and a
 * SemVerString `generationVersion`; map with `toPersistableManifest` before
 * persisting / round-tripping through `ManifestSchema.parse`.
 */

/** Generator identity recorded on every manifest entry. */
export const GENERATOR_ID = '@planmo/generator' as const;

/**
 * Revision of a first build. The builder is stateless (the frozen signature
 * takes no previous manifest), so every fresh build is revision 0; the
 * persistence layer reads the previous `.planmo/manifest.json` and bumps the
 * revision when regenerating over it.
 */
export const MANIFEST_FIRST_REVISION = 0 as const;

/**
 * Fallback generation version used when the IR does not carry the lockfile's
 * planmoVersion. Mirrors `@planmo/packs` lock.ts `PLANMO_CURRENT_VERSION`
 * (`0.0.0`) that P04-03 actually writes into lockfiles, so the manifest's
 * generationVersion stays consistent with the locked PlanMo version.
 */
export const DEFAULT_GENERATION_VERSION = '0.0.0' as const;

/** Lineage marker prefix tracing an entry to the input-model snapshot. */
export const INPUT_LINEAGE_PREFIX = 'input:' as const;

/** Lineage marker prefix tracing an entry to a locked pack (`ref@version`). */
export const PACK_LINEAGE_PREFIX = 'pack:' as const;

/** A sha256 digest is exactly 64 lowercase hex characters. */
const HEX_SHA256 = /^[0-9a-f]{64}$/;

/**
 * The frozen PlanningIR (P05-01) does not yet carry the lockfile the builder
 * wants for generationVersion (P05-06/07 lineage alignment); read it
 * defensively when present and fall back to `DEFAULT_GENERATION_VERSION`.
 */
interface IrWithLockfile {
  lockfile?: { planmoVersion?: unknown };
}

/**
 * Deterministic lineage markers for one IR: the input-model snapshot
 * (`input:<inputHash>`) followed by every locked pack (`pack:<ref>@<version>`).
 * Total-ordered and deduped so the lockfile's input order can never change the
 * manifest bytes.
 */
export function lineageMarkers(ir: PlanningIR): readonly string[] {
  const markers = [`${INPUT_LINEAGE_PREFIX}${ir.inputHash}`];
  for (const pack of ir.lockedPacks) {
    markers.push(`${PACK_LINEAGE_PREFIX}${pack.ref}@${pack.version}`);
  }
  return [...new Set(markers)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/** Preserve-first-occurrence dedupe (`Set` is insertion-ordered). */
function dedupe(values: readonly string[]): string[] {
  return [...new Set(values)];
}

/**
 * Fail fast on malformed artifacts. Paths must be non-empty, forward-slash
 * repo-relative paths without `..` segments (security stop condition: no path
 * traversal into a manifest), kinds/ownerships must be schema values, sources
 * must be non-empty strings, and paths must be unique.
 */
function assertValidArtifacts(artifacts: readonly GeneratedArtifact[]): void {
  if (!Array.isArray(artifacts)) {
    throw new TypeError('buildGenerationManifest: artifacts must be an array');
  }
  const seen = new Set<string>();
  for (const artifact of artifacts) {
    if (artifact === null || typeof artifact !== 'object' || Array.isArray(artifact)) {
      throw new TypeError(
        'buildGenerationManifest: every artifact must be a GeneratedArtifact object',
      );
    }
    const { path, content, kind, ownership, sources } = artifact;
    if (typeof path !== 'string' || path.trim() === '') {
      throw new Error('buildGenerationManifest: artifact.path must be a non-empty string');
    }
    if (path.includes('\\')) {
      throw new Error(
        `buildGenerationManifest: artifact.path must use forward slashes, got "${path}"`,
      );
    }
    if (path.startsWith('/') || /^[A-Za-z]:\//.test(path)) {
      throw new Error(
        `buildGenerationManifest: artifact.path must be repo-relative, got "${path}"`,
      );
    }
    if (path.split('/').includes('..')) {
      throw new Error(
        `buildGenerationManifest: artifact.path must not contain ".." segments, got "${path}"`,
      );
    }
    if (typeof content !== 'string') {
      throw new TypeError('buildGenerationManifest: artifact.content must be a string');
    }
    if (!ARTIFACT_KINDS.includes(kind)) {
      throw new Error(`buildGenerationManifest: unknown artifact kind "${String(kind)}"`);
    }
    if (!OWNERSHIP_MODES.includes(ownership)) {
      throw new Error(`buildGenerationManifest: unknown ownership mode "${String(ownership)}"`);
    }
    if (!Array.isArray(sources)) {
      throw new TypeError('buildGenerationManifest: artifact.sources must be an array');
    }
    for (const source of sources) {
      if (typeof source !== 'string' || source.trim() === '') {
        throw new Error(
          'buildGenerationManifest: every artifact source must be a non-empty string',
        );
      }
    }
    if (seen.has(path)) {
      throw new Error(`buildGenerationManifest: duplicate artifact path "${path}"`);
    }
    seen.add(path);
  }
}

/**
 * Fail fast on a malformed IR. The IR is schema-validated upstream, but the
 * manifest is persisted provenance — garbage in must never reach it silently.
 */
function assertValidIr(ir: PlanningIR): void {
  if (ir === null || typeof ir !== 'object') {
    throw new TypeError('buildGenerationManifest: ir must be an object');
  }
  if (typeof ir.inputHash !== 'string' || !HEX_SHA256.test(ir.inputHash)) {
    throw new Error('buildGenerationManifest: ir.inputHash must be a 64-char lowercase hex sha256');
  }
  if (!Array.isArray(ir.lockedPacks)) {
    throw new TypeError('buildGenerationManifest: ir.lockedPacks must be an array');
  }
  for (const pack of ir.lockedPacks) {
    if (
      pack === null ||
      typeof pack !== 'object' ||
      typeof pack.ref !== 'string' ||
      pack.ref.trim() === ''
    ) {
      throw new Error('buildGenerationManifest: every locked pack must carry a non-empty ref');
    }
    if (typeof pack.version !== 'string' || pack.version.trim() === '') {
      throw new Error('buildGenerationManifest: every locked pack must carry a non-empty version');
    }
  }
}

/**
 * Resolve the generation version recorded on every entry. Prefers the
 * lockfile's planmoVersion (SemVer, validated when present) and falls back to
 * `DEFAULT_GENERATION_VERSION` until the frozen IR carries the lockfile.
 */
function readGenerationVersion(ir: PlanningIR): string {
  const candidate = (ir as unknown as IrWithLockfile).lockfile?.planmoVersion;
  if (candidate === undefined) return DEFAULT_GENERATION_VERSION;
  if (typeof candidate !== 'string' || !SemVerString.safeParse(candidate).success) {
    throw new Error(
      'buildGenerationManifest: ir.lockfile.planmoVersion must be a valid SemVer string when present, got ' +
        JSON.stringify(candidate),
    );
  }
  return candidate;
}

/**
 * Build the generation manifest for a set of rendered artifacts (P05-03).
 *
 * Pure and deterministic: same `artifacts` + same `ir` always produce the same
 * document bytes. Lineage: every entry's `sources` = the renderer-declared
 * sources, then the deterministic lineage markers from {lineageMarkers}
 * (`input:<inputHash>` first, then `pack:<ref>@<version>` per locked pack).
 *
 * Note on `generationVersion`: read from `ir.lockfile.planmoVersion` when the
 * IR carries the lockfile; the frozen PlanningIR (P05-01) does not expose it
 * yet, so it falls back to `DEFAULT_GENERATION_VERSION` ('0.0.0', matching the
 * P04-03 lockfile value). This is reported contract drift — the IR loses the
 * lockfile's planmoVersion during compilation.
 */
export function buildGenerationManifest(
  artifacts: readonly GeneratedArtifact[],
  ir: PlanningIR,
): { document: GenerationManifestDocument; entries: GenerationManifestEntry[] } {
  assertValidIr(ir);
  assertValidArtifacts(artifacts);

  const generationVersion = readGenerationVersion(ir);
  const lineage = lineageMarkers(ir);

  const entries: GenerationManifestEntry[] = [...artifacts]
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
    .map((artifact) => ({
      path: artifact.path,
      kind: artifact.kind,
      generator: GENERATOR_ID,
      sources: dedupe([...artifact.sources, ...lineage]),
      checksum: sha256Hex(artifact.content),
      ownershipMode: artifact.ownership,
      generationVersion,
    }));

  const document: GenerationManifestDocument = {
    schemaVersion: SCHEMA_VERSION,
    revision: MANIFEST_FIRST_REVISION,
    entries,
  };

  return { document, entries };
}

/**
 * Map an in-memory manifest document to the persisted schema shape.
 *
 * The frozen `GenerationManifestEntry` carries `checksum` as a sha256 hex
 * string, while the schema's `ManifestEntry` requires
 * `checksum: { algorithm: 'sha256', digest }`. This mapping adapts each entry's
 * hex checksum into `{ algorithm: 'sha256', digest }` (and keeps the
 * SemVerString generationVersion), producing a document that
 * `ManifestSchema.parse` accepts — the reverse mapping (digest → hex) is the
 * read path used by the persistence layer when loading an existing manifest.
 */
export function toPersistableManifest(document: GenerationManifestDocument): ManifestDocument {
  if (document.schemaVersion !== SCHEMA_VERSION) {
    throw new Error(
      `toPersistableManifest: unsupported manifest schemaVersion ${document.schemaVersion} (expected ${SCHEMA_VERSION})`,
    );
  }
  return {
    schemaVersion: SCHEMA_VERSION,
    revision: document.revision,
    entries: document.entries.map((entry) => ({
      path: entry.path,
      kind: entry.kind,
      generator: entry.generator,
      sources: [...entry.sources],
      checksum: { algorithm: 'sha256', digest: entry.checksum },
      ownershipMode: entry.ownershipMode,
      generationVersion: entry.generationVersion,
    })),
  };
}
