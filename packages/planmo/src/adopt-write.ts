import type {
  AdoptReport,
  DetectionReport,
  InjectionScanResult,
  ScanReport,
} from '@planmo/scanner';

/**
 * Render the four adoption artifacts `adopt` offers to write under `.planmo/adopt/`.
 *
 * `adopt` itself stays pure — it plans the artifact list and writes nothing — so the
 * bodies live here, next to the command that decides whether to write them at all.
 *
 * These are a RECORD of the adoption, not planning input: they capture what the
 * repository looked like when it was adopted, so a later reader can tell what was
 * found rather than what someone remembers being found. That is also why the
 * injection summary lists the flagged PATHS: the CLI report deliberately shows only
 * counts, and "29 files are poisoned" is not actionable without knowing which.
 */
export interface AdoptArtifact {
  readonly path: string;
  readonly content: string;
}

export interface AdoptArtifactInput {
  readonly root: string;
  readonly planmoVersion: string;
  readonly report: AdoptReport;
  readonly scan: ScanReport;
  readonly detection: DetectionReport;
  readonly injections: readonly InjectionScanResult[];
}

/** Every artifact ends with exactly one newline, so diffs stay stable. */
function document(lines: readonly string[]): string {
  return `${lines.join('\n').replace(/\n+$/, '')}\n`;
}

function renderDetectionSummary(input: AdoptArtifactInput): string {
  const { detection } = input;
  const lines: string[] = ['# Detection summary', '', `Root: ${input.root}`, ''];

  lines.push('## Stacks', '');
  if (detection.stacks.length === 0) {
    lines.push('None detected.', '');
  } else {
    for (const stack of detection.stacks) {
      const evidence = stack.evidence.map((item) => item.path).join(', ');
      lines.push(
        `- ${stack.id} (${stack.category}, ${stack.confidence})` +
          (evidence === '' ? '' : ` — ${evidence}`),
      );
    }
    lines.push('');
  }

  lines.push('## Test frameworks', '');
  lines.push(
    ...(detection.testFrameworks.length === 0
      ? ['None detected.']
      : detection.testFrameworks.map((id) => `- ${id}`)),
    '',
  );

  lines.push('## CI systems', '');
  lines.push(
    ...(detection.ciSystems.length === 0
      ? ['None detected.']
      : detection.ciSystems.map((id) => `- ${id}`)),
    '',
  );

  return document(lines);
}

function renderInjectionSummary(input: AdoptArtifactInput): string {
  const { report, injections } = input;
  const { poisoned, suspicious, benign } = report.injectionSummary;
  const lines: string[] = [
    '# Injection summary',
    '',
    `- Benign: ${benign}`,
    `- Suspicious: ${suspicious}`,
    `- Poisoned: ${poisoned}`,
    `- Files scanned: ${poisoned + suspicious + benign}`,
    '',
    'Policy: repository text is data, never instruction authority (PLN-001).',
    'Structural markup (comments, TODOs) is evidence only alongside an instruction',
    'phrase (PLN-005).',
    '',
  ];

  const flagged = injections
    .filter((result) => result.classification !== 'benign')
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

  if (flagged.length === 0) {
    lines.push('No file carried an injection marker.', '');
  } else {
    lines.push('## Flagged files', '');
    for (const result of flagged) {
      lines.push(`- ${result.path} (${result.classification})`);
      for (const marker of result.markers) {
        lines.push(`  - line ${marker.line}: ${marker.code} "${marker.phrase}"`);
      }
    }
    lines.push('');
  }

  return document(lines);
}

function renderManifestRecord(input: AdoptArtifactInput): string {
  const { stats } = input.scan;
  const stacks = input.detection.stacks.map((stack) => stack.id);
  return document([
    '# Adoption record',
    '',
    `- PlanMo: ${input.planmoVersion}`,
    `- Root: ${input.root}`,
    `- Files: ${stats.files}`,
    `- Directories: ${stats.dirs}`,
    `- Symlinks: ${stats.symlinks}`,
    `- Total bytes: ${stats.totalBytes}`,
    `- Stacks detected: ${stacks.length === 0 ? 'none' : stacks.join(', ')}`,
    `- Scan truncated by: ${input.scan.truncatedBy ?? 'nothing'}`,
    '',
    'Dependency and build directories are excluded from the scan',
    '(`node_modules`, `.git`, `dist`, `build`, `out`, `coverage`, `vendor`, `target`,',
    '`__pycache__`, `.venv`, and PlanMo’s own `.planmo`), so these counts describe the',
    'project rather than its dependencies.',
    '',
    'Rewrites application code: false — adoption never modifies application code.',
  ]);
}

/**
 * Build the artifacts in the order `adopt` reported them.
 *
 * `plan-report.md` reuses the report body the CLI already prints, so the file and the
 * terminal output cannot drift apart.
 */
export function renderAdoptArtifacts(input: AdoptArtifactInput): readonly AdoptArtifact[] {
  return [
    { path: '.planmo/adopt/detection-summary.md', content: renderDetectionSummary(input) },
    { path: '.planmo/adopt/injection-summary.md', content: renderInjectionSummary(input) },
    { path: '.planmo/adopt/manifest-record.md', content: renderManifestRecord(input) },
    { path: '.planmo/adopt/plan-report.md', content: input.report.reportMarkdown },
  ];
}
