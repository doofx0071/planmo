import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { readStatus } from '@planmo/core';
import { ManifestSchema } from '@planmo/schema';
import { validatorEngine, type Diagnostic } from '@planmo/trace';

/**
 * Validate a workspace's canonical documents.
 *
 * Thin adapter over `@planmo/trace`'s validator: read the documents off disk,
 * hand them to the engine, and report what it returns. No validation logic lives
 * here — the engine owns the invariants and is pure, so the same workspace
 * always produces the same report, and the report is safe to gate CI on.
 *
 * The one check that cannot live in the engine is the manifest checksum audit
 * (VLD-007): the engine is pure and only sees document text, while verifying a
 * recorded sha256 means reading the artifact off disk.
 */
export interface ValidateOptions {
  root: string;
}

export interface ValidateOutcome {
  root: string;
  diagnostics: readonly Diagnostic[];
  counts: { error: number; warning: number; info: number };
  /** True when the report contains no errors. Warnings do not fail the gate. */
  ok: boolean;
}

/** Read a file, or return undefined when it is absent (a valid state). */
async function readIfPresent(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, 'utf8');
  } catch {
    return undefined;
  }
}

/**
 * Ownership modes whose bytes are PlanMo's, not the user's.
 *
 * `seeded` and `user` documents are the user's from the moment they exist, so a
 * difference between them and their recorded checksum is normal and must not be
 * reported. The legacy aliases are included so pre-CHG-001 manifests behave the
 * same as current ones.
 */
const PLANMO_OWNED_MODES: ReadonlySet<string> = new Set([
  'generated',
  'managed',
  'merged',
  'merge',
]);

const SEVERITY_RANK: Record<string, number> = { error: 0, warning: 1, info: 2 };

/**
 * VLD-007: a generated document that no longer matches the checksum recorded for
 * it in `.planmo/manifest.json`.
 *
 * Every manifest entry has carried a sha256 of its artifact since P05-03, and
 * nothing ever read one back — so a hand-edited generated document passed
 * `validate` untouched and the recorded checksum was dead data. This is a
 * warning rather than an error: `generate` owns those files and will overwrite
 * the edit, so drift is information, not a broken workspace.
 */
async function checksumDiagnostics(
  root: string,
  manifestRaw: string | undefined,
): Promise<Diagnostic[]> {
  if (manifestRaw === undefined) return [];

  let entries: readonly {
    path: string;
    checksum: { algorithm: string; digest: string };
    ownershipMode: string;
  }[];
  try {
    entries = ManifestSchema.parse(JSON.parse(manifestRaw)).entries;
  } catch {
    // A manifest that does not parse is VLD-004's finding, not this one.
    return [];
  }

  const diagnostics: Diagnostic[] = [];
  for (const entry of entries) {
    if (!PLANMO_OWNED_MODES.has(entry.ownershipMode)) continue;
    if (entry.checksum.algorithm !== 'sha256') continue;

    let bytes: Buffer;
    try {
      bytes = await readFile(join(root, entry.path));
    } catch {
      // A missing file is not drift; `diff`/`generate` report that separately.
      continue;
    }
    if (createHash('sha256').update(bytes).digest('hex') === entry.checksum.digest) continue;

    diagnostics.push({
      code: 'VLD-007',
      severity: 'warning',
      target: entry.path,
      message: `${entry.path} no longer matches the checksum recorded for it in .planmo/manifest.json — it was edited after generation`,
      remediation:
        'Run `planmo generate` to restore it, or move the text into a document you own (planning/DECISIONS.md, OPEN-QUESTIONS.md, RISKS.md).',
    });
  }
  return diagnostics;
}

export async function validateWorkspace(opts: ValidateOptions): Promise<ValidateOutcome> {
  const status = await readStatus({ root: opts.root });
  if (status.project === null) {
    throw new Error(`no readable .planmo/project.yml in ${opts.root}`);
  }

  // The engine's document slots are JSON-shaped. state.yml is YAML on disk, so
  // pass the parsed document re-serialized as JSON; tasks.csv stays raw text
  // because the engine parses the CSV itself.
  const documents: { state?: string; tasks?: string; manifest?: string } = {};
  if (status.state !== null) documents.state = JSON.stringify(status.state);

  const tasks = await readIfPresent(join(status.root, 'planning', 'tasks.csv'));
  if (tasks !== undefined) documents.tasks = tasks;

  const manifest = await readIfPresent(join(status.root, '.planmo', 'manifest.json'));
  if (manifest !== undefined) documents.manifest = manifest;

  const report = validatorEngine().validate({
    documents,
    ...(status.state !== null ? { state: status.state } : {}),
  });

  const diagnostics = [...report.diagnostics, ...(await checksumDiagnostics(status.root, manifest))]
    .slice()
    .sort(
      (a, b) =>
        (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9) ||
        a.code.localeCompare(b.code) ||
        a.target.localeCompare(b.target),
    );

  const counts = {
    error: diagnostics.filter((d) => d.severity === 'error').length,
    warning: diagnostics.filter((d) => d.severity === 'warning').length,
    info: diagnostics.filter((d) => d.severity === 'info').length,
  };

  return {
    root: status.root,
    diagnostics,
    counts,
    ok: counts.error === 0,
  };
}
