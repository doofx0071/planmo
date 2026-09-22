/**
 * GitHub export payload rendering (P11-05 prototype).
 *
 * Renders an ADDITIVE PR payload (title, body, files under `artifacts/`) from
 * planning artifacts. Pure and deterministic: no network, no filesystem, no
 * core-command dependency. Rendering is a pure function of its input.
 */
import type { ExportFile, GithubExportPayload } from './phase11-contracts.js';

/** Single allowed root directory for exported files (the additivity guarantee). */
export const EXPORT_PATH_PREFIX = 'artifacts/';

/** Explicit additivity promise embedded in every rendered body. */
export const EXPORT_ADDITIVE_NOTE =
  'This export is purely additive: it only creates new files under artifacts/ and never modifies or overwrites existing repository files.';

/**
 * Reject export paths that could escape the additive artifacts/ prefix or
 * confuse GitHub's file tree: parent traversal, backslashes, or anything
 * outside the prefix. All paths are validated before any payload is built.
 */
function assertSafeExportPath(path: string): void {
  if (!path.startsWith(EXPORT_PATH_PREFIX)) {
    throw new Error(`unsafe export path ${JSON.stringify(path)}: files must live under artifacts/`);
  }
  if (path.includes('\\')) {
    throw new Error(`unsafe export path ${JSON.stringify(path)}: use forward slashes`);
  }
  if (path.split('/').includes('..')) {
    throw new Error(`unsafe export path ${JSON.stringify(path)}: parent traversal is not allowed`);
  }
}

/** Total ordering for additive exports: path first, then content (stable). */
function compareExportFiles(a: ExportFile, b: ExportFile): number {
  if (a.path !== b.path) return a.path < b.path ? -1 : 1;
  if (a.content !== b.content) return a.content < b.content ? -1 : 1;
  return 0;
}

/**
 * Deterministic PR body: the explicit additive note plus optional summary
 * bullets. Never empty — the note alone guarantees a meaningful body.
 */
function renderBody(summaryLines: readonly string[]): string {
  const bullets = summaryLines
    .filter((line) => line.length > 0)
    .map((line) => `- ${line}`)
    .join('\n');
  return bullets.length === 0 ? EXPORT_ADDITIVE_NOTE : `${EXPORT_ADDITIVE_NOTE}\n\n${bullets}`;
}

/**
 * Render an additive GitHub export payload from planning artifacts (P11-05).
 * Same input always renders the same payload: files are sorted deterministically
 * and the title/body are derived solely from the input.
 */
export function renderGithubExport(input: {
  owner: string;
  repo: string;
  branch: string;
  summaryLines: readonly string[];
  files: readonly ExportFile[];
}): GithubExportPayload {
  const files = [...input.files].sort(compareExportFiles);
  for (const file of files) {
    assertSafeExportPath(file.path);
  }
  return {
    owner: input.owner,
    repo: input.repo,
    branch: input.branch,
    title: `feat: ${input.repo} planning artifacts (planmo)`,
    body: renderBody(input.summaryLines),
    files,
  };
}
