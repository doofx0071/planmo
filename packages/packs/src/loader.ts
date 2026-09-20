import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import {
  PackContentShapeSchema,
  PackSchema,
  type PackContentShape,
  type PackDocument,
} from '@planmo/schema';

/**
 * Declarative pack loader (P04-01).
 *
 * Loads `pack.yml` from a pack directory, validates the document against
 * the strict PackSchema, validates category-specific content shape
 * (standards / policy / context), and REJECTS executable constructs per
 * ADR-0004 (v1 packs are declarative, non-executable data).
 */

export class PackLoadError extends Error {
  readonly ref: string;
  readonly kind: 'schema' | 'executable' | 'read';
  readonly issues: string[];

  constructor(
    ref: string,
    kind: 'schema' | 'executable' | 'read',
    message: string,
    issues: string[] = [],
  ) {
    super(message);
    this.name = 'PackLoadError';
    this.ref = ref;
    this.kind = kind;
    this.issues = issues;
  }
}

/**
 * Keys that would indicate executable or install-time behavior. Their
 * PRESENCE anywhere in pack content is rejected (fail closed): pack.yml must
 * be pure structured data.
 */
const EXECUTABLE_KEYS = new Set([
  'hooks',
  'scripts',
  'commands',
  'exec',
  'install',
  'postinstall',
  'preinstall',
  'run',
  'shell',
  'lifecycle',
  'template-engine',
  'code',
]);

function findExecutableKeys(value: unknown, path: string, found: string[]): void {
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      findExecutableKeys(value[i], `${path}[${i}]`, found);
    }
    return;
  }
  if (value !== null && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      const p = `${path}.${key}`;
      if (EXECUTABLE_KEYS.has(key) && child !== null && child !== undefined) {
        found.push(p);
      }
      findExecutableKeys(child, p, found);
    }
  }
}

/** sha256 hex digest of the raw pack.yml bytes (integrity for locking). */
export function packIntegrity(rawYaml: string): string {
  return createHash('sha256').update(rawYaml, 'utf8').digest('hex');
}

export interface LoadedPack {
  /** Path to the pack.yml that produced this pack. */
  sourcePath: string;
  /** sha256 hex digest of the raw pack.yml (before parse). */
  integritySha256: string;
  /** Parsed, schema-validated pack document. */
  document: PackDocument;
  /** Parsed, schema-validated pack document (alias for ergonomic access). */
  row: PackDocument;
  /** Validated content for policy categories (standards/policy/context); null for other categories. */
  contentShape: PackContentShape | null;
}

/**
 * Load and validate one declarative pack from its directory.
 * The directory must contain `pack.yml`. Throws PackLoadError on any
 * schema failure, executable construct, or unreadable/missing file.
 */
export function loadPack(packDir: string): LoadedPack {
  const packFile = join(packDir, 'pack.yml');
  let raw: string;
  try {
    raw = readFileSync(packFile, 'utf8');
  } catch {
    throw new PackLoadError(packDir, 'read', `cannot read ${packFile}`);
  }

  let parsed: unknown;
  try {
    parsed = parseYaml(raw);
  } catch (err) {
    throw new PackLoadError(
      packDir,
      'schema',
      `invalid YAML in ${packFile}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const result = PackSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues.map((i) => i.path.join('.') || '(root)');
    throw new PackLoadError(packDir, 'schema', `pack ${packFile} failed schema validation`, issues);
  }
  const pack = result.data;

  // Executable construct rejection (ADR-0004). Fail closed on ANY forbidden key.
  const executable: string[] = [];
  findExecutableKeys(pack.content, 'content', executable);
  if (executable.length > 0) {
    throw new PackLoadError(
      pack.ref,
      'executable',
      `pack ${pack.ref} contains executable constructs (${executable.join(', ')})`,
      executable,
    );
  }

  // Category-specific content shape validation for CHG-001 policy categories
  // (standards/policy/context). Other categories own their content validation
  // in their phases; here they only need to be executable-free and schema-valid.
  const POLICY_CATEGORIES = new Set(['standards', 'policy', 'context']);
  let contentShape: PackContentShape | null = null;
  if (POLICY_CATEGORIES.has(pack.category)) {
    const shapeResult = PackContentShapeSchema.safeParse({
      category: pack.category,
      content: pack.content,
    });
    if (!shapeResult.success) {
      const issues = shapeResult.error.issues.map((i) => i.path.join('.') || '(root)');
      throw new PackLoadError(
        pack.ref,
        'schema',
        `pack ${pack.ref} content does not match category ${pack.category}`,
        issues,
      );
    }
    contentShape = shapeResult.data;
  }

  return {
    sourcePath: packFile,
    integritySha256: packIntegrity(raw),
    document: pack,
    row: pack,
    contentShape,
  };
}
