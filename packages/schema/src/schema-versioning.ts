import { z } from 'zod';
import { MAX_SUPPORTED_SCHEMA_VERSION, SCHEMA_VERSION } from './common.js';

/**
 * Schema versioning + deterministic migration framework.
 *
 * Rules (docs/02-architecture/schema-versioning.md):
 * - reject unsupported FUTURE major versions;
 * - migrations are explicit, deterministic, and covered by fixtures;
 * - no silent user-data discard — unknown legacy data is carried through
 *   migrations when it can be mapped, and `extensions` is preserved;
 * - pre-1.0 migration behavior still gets release notes.
 */

/** Error thrown for documents claiming a newer schemaVersion than supported. */
export class UnsupportedSchemaVersionError extends Error {
  constructor(
    readonly found: number,
    readonly max: number,
  ) {
    super(
      `schemaVersion ${found} is not supported by this PlanMo build (max ${max}); ` +
        'upgrade PlanMo or use `planmo doctor` for mixed-state diagnostics.',
    );
    this.name = 'UnsupportedSchemaVersionError';
  }
}

/** Error thrown when a document has no usable schemaVersion and no legacy path exists. */
export class MissingSchemaVersionError extends Error {
  constructor(readonly docType: string) {
    super(`document of type "${docType}" has no schemaVersion and no legacy migration path`);
    this.name = 'MissingSchemaVersionError';
  }
}

/**
 * Reads a document's schemaVersion. Accepts unknown-typed documents
 * (parsed YAML/JSON) and returns `0` for a document with no version field —
 * version 0 is the "unversioned legacy" state handled by explicit migrations
 * registered via `acceptsLegacy`.
 */
export function readSchemaVersion(value: unknown, docType: string): number {
  if (typeof value !== 'object' || value === null) {
    throw new MissingSchemaVersionError(docType);
  }
  const raw = (value as Record<string, unknown>)['schemaVersion'];
  if (raw === undefined) return 0;
  // Accept number or numeric string (YAML authors may quote the value).
  const n = typeof raw === 'string' && /^\d+$/.test(raw) ? Number(raw) : raw;
  if (typeof n !== 'number' || !Number.isInteger(n) || n < 0) {
    throw new MissingSchemaVersionError(docType);
  }
  return n;
}

/**
 * Rejects unsupported major versions. `found === 0` means a legacy document
 * that is NOT yet migrated.
 */
export function assertSupportedVersion(found: number): void {
  if (found > MAX_SUPPORTED_SCHEMA_VERSION) {
    throw new UnsupportedSchemaVersionError(found, MAX_SUPPORTED_SCHEMA_VERSION);
  }
  if (found < 0) {
    throw new MissingSchemaVersionError('unknown');
  }
}

/**
 * A deterministic migration step: takes a fully-typed document of version N
 * and returns the equivalent document of version N+1. Must never touch
 * `extensions` content.
 */
export type MigrationStep<TOld, TNew> = (doc: TOld) => TNew;

/**
 * Migration registry for one document kind. Chains explicit steps from the
 * document's version up to the current SCHEMA_VERSION.
 */
export class SchemaMigrations<TCurrent> {
  private readonly steps = new Map<number, (doc: unknown) => unknown>();

  constructor(
    private readonly docType: string,
    private readonly maxVersion: number,
  ) {}

  /** Register the migration from `fromVersion` to `fromVersion + 1`. */
  add<TOld, TNew>(fromVersion: number, step: MigrationStep<TOld, TNew>): this {
    if (fromVersion < 1 || fromVersion >= this.maxVersion) {
      throw new Error(
        `migration from v${fromVersion} out of range [1, ${this.maxVersion}) for ${this.docType}`,
      );
    }
    this.steps.set(fromVersion, step as (doc: unknown) => unknown);
    return this;
  }

  /**
   * Migrate a document to the current version. Deterministic and strict:
   * a missing version is only acceptable when a v0->v1 step is registered.
   */
  migrate(value: unknown): unknown {
    const found = readSchemaVersion(value, this.docType);
    assertSupportedVersion(found);

    let doc = value as Record<string, unknown>;
    if (found === 0) {
      const first = this.steps.get(0);
      if (!first) throw new MissingSchemaVersionError(this.docType);
      doc = first(doc) as Record<string, unknown>;
    }

    let current = found === 0 ? 1 : found;
    while (current < this.maxVersion) {
      const step = this.steps.get(current);
      if (!step) {
        throw new Error(`no migration path v${current} -> v${current + 1} for ${this.docType}`);
      }
      doc = step(doc) as Record<string, unknown>;
      current += 1;
    }
    return doc;
  }

  /**
   * Legacy (pre-versioning) fixture documents that still existed in the wild
   * are handled by a v0 -> v1 step; when defined, a document WITHOUT
   * schemaVersion is accepted and migrated instead of rejected.
   */
  acceptsLegacy(step: MigrationStep<Record<string, unknown>, Record<string, unknown>>): this {
    this.steps.set(0, step as (doc: unknown) => unknown);
    return this;
  }
}
