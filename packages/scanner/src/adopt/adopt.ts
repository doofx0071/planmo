import type {
  AdoptChange,
  AdoptEngine,
  AdoptReport,
  DetectionReport,
  InjectionScanResult,
  ScanReport,
} from '../contracts.js';

/**
 * PlanMo adopt — dry-run adoption planning engine (P10-04, high).
 *
 * `plan()` is PURE planning: given scan + detection + injection results it
 * produces the deterministic `AdoptReport` and the exact list of would-be
 * artifacts. It does NOTHING else — writing is always the caller's decision
 * and only ever happens under `.planmo/adopt/` (v1 never rewrites application
 * code; `rewritesApplicationCode` is the literal `false`).
 *
 * The artifact set is fixed and data-derived, so the report is fully
 * deterministic: sorted by kind asc, then path asc, with byte lengths computed
 * from the artifact contents (UTF-8). No time, no randomness, no filesystem
 * access.
 */

const ADOPT_DIR = '.planmo/adopt/';

export const adopt: AdoptEngine = Object.freeze({
  name: 'adopt',
  plan(input: {
    scan: ScanReport;
    detection: DetectionReport;
    injections: readonly InjectionScanResult[];
    root: string;
  }): AdoptReport {
    const { scan, detection, injections, root } = input;
    const scanSummary = scan.stats;
    const detectionSummary: AdoptReport['detectionSummary'] = {
      stacks: detection.stacks.length,
      testFrameworks: detection.testFrameworks.length,
      ciSystems: detection.ciSystems.length,
    };
    const injectionSummary: AdoptReport['injectionSummary'] = {
      poisoned: 0,
      suspicious: 0,
      benign: 0,
    };
    for (const injection of injections) injectionSummary[injection.classification]++;

    const detectionMd = detectionSummaryMarkdown(detection);
    const injectionMd = injectionSummaryMarkdown(injections);
    const manifestMd = manifestRecordMarkdown(scan);
    const reportMarkdown = reportMarkdownBody({
      root,
      scan,
      detection,
      detectionSummary,
      injectionSummary,
      injectionsCount: injections.length,
    });

    const changeEntries: readonly AdoptChange[] = [
      {
        path: `${ADOPT_DIR}detection-summary.md`,
        kind: 'detection-summary',
        bytes: utf8Bytes(detectionMd),
      },
      {
        path: `${ADOPT_DIR}injection-summary.md`,
        kind: 'injection-summary',
        bytes: utf8Bytes(injectionMd),
      },
      {
        path: `${ADOPT_DIR}manifest-record.md`,
        kind: 'manifest-record',
        bytes: utf8Bytes(manifestMd),
      },
      {
        path: `${ADOPT_DIR}plan-report.md`,
        kind: 'plan-report',
        bytes: utf8Bytes(reportMarkdown),
      },
    ];
    const changes = Object.freeze(
      changeEntries.slice().sort((a, b) => compareAsc(a.kind, b.kind) || compareAsc(a.path, b.path)),
    );

    return {
      root,
      scanSummary,
      detectionSummary,
      injectionSummary,
      changes,
      rewritesApplicationCode: false,
      reportMarkdown,
    };
  },
});

function compareAsc(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function utf8Bytes(text: string): number {
  return new TextEncoder().encode(text).length;
}

function bulletList(items: readonly string[]): string[] {
  return items.map((item) => `- ${item}`);
}

function detectionSummaryMarkdown(detection: DetectionReport): string {
  const stacks = [...detection.stacks].sort((a, b) => compareAsc(a.id, b.id));
  const blocks: string[] = ['# Detection summary'];
  blocks.push(
    [
      'Stacks: ' + detection.stacks.length,
      ...bulletList(stacks.map((s) => `${s.id} (${s.category}, ${s.confidence})`)),
    ].join('\n'),
  );
  blocks.push(
    [
      'Test frameworks: ' + detection.testFrameworks.length,
      ...bulletList([...detection.testFrameworks].sort(compareAsc)),
    ].join('\n'),
  );
  blocks.push(
    [
      'CI systems: ' + detection.ciSystems.length,
      ...bulletList([...detection.ciSystems].sort(compareAsc)),
    ].join('\n'),
  );
  return blocks.join('\n\n');
}

function injectionSummaryMarkdown(injections: readonly InjectionScanResult[]): string {
  const counts = { poisoned: 0, suspicious: 0, benign: 0 };
  for (const injection of injections) counts[injection.classification]++;
  const byClass = { poisoned: [] as string[], suspicious: [] as string[], benign: [] as string[] };
  for (const injection of [...injections].sort((a, b) => compareAsc(a.path, b.path))) {
    byClass[injection.classification].push(injection.path);
  }
  const blocks: string[] = [
    [
      '# Injection summary',
      `Benign: ${counts.benign}`,
      `Suspicious: ${counts.suspicious}`,
      `Poisoned: ${counts.poisoned}`,
      `Files: ${injections.length}`,
    ].join('\n'),
  ];
  for (const cls of ['poisoned', 'suspicious', 'benign'] as const) {
    if (byClass[cls].length > 0) {
      blocks.push(
        [`## ${capitalize(cls)} (${byClass[cls].length})`, ...bulletList(byClass[cls])].join('\n'),
      );
    }
  }
  return blocks.join('\n\n');
}

function capitalize(text: string): string {
  return text.length === 0 ? text : text[0]!.toUpperCase() + text.slice(1);
}

function manifestRecordMarkdown(scan: ScanReport): string {
  const entries = [...scan.entries].sort((a, b) => compareAsc(a.path, b.path));
  return [
    '# Manifest record',
    ...bulletList(entries.map((entry) => `${entry.path} (${entry.type})`)),
  ].join('\n');
}

interface ReportSectionInput {
  root: string;
  scan: ScanReport;
  detection: DetectionReport;
  detectionSummary: { stacks: number; testFrameworks: number; ciSystems: number };
  injectionSummary: { poisoned: number; suspicious: number; benign: number };
  injectionsCount: number;
}

function reportMarkdownBody(input: ReportSectionInput): string {
  const { root, scan, detection, detectionSummary, injectionSummary, injectionsCount } = input;
  const stacks = [...detection.stacks].sort((a, b) => compareAsc(a.id, b.id));
  const artifactLines = [
    '.planmo/adopt/detection-summary.md (detection-summary)',
    '.planmo/adopt/injection-summary.md (injection-summary)',
    '.planmo/adopt/manifest-record.md (manifest-record)',
    '.planmo/adopt/plan-report.md (plan-report)',
  ];
  const blocks: string[] = [
    [
      '# PlanMo adoption plan',
      '',
      `Root: ${root}`,
      '',
      'Dry run: yes — planning writes nothing; only the caller may write under .planmo/adopt/.',
    ].join('\n'),
    [
      '## Scan summary',
      `- Files: ${scan.stats.files}`,
      `- Directories: ${scan.stats.dirs}`,
      `- Symlinks: ${scan.stats.symlinks}`,
      `- Total bytes: ${scan.stats.totalBytes}`,
    ].join('\n'),
    [
      '## Detection summary',
      `- Stacks: ${detectionSummary.stacks}`,
      ...stacks.map((s) => `  - ${s.id} (${s.category}, ${s.confidence})`),
      `- Test frameworks: ${detectionSummary.testFrameworks}`,
      `- CI systems: ${detectionSummary.ciSystems}`,
    ].join('\n'),
    [
      '## Injection summary',
      `- Benign: ${injectionSummary.benign}`,
      `- Suspicious: ${injectionSummary.suspicious}`,
      `- Poisoned: ${injectionSummary.poisoned}`,
      `- Files scanned: ${injectionsCount}`,
    ].join('\n'),
    ['## Would-be artifacts', ...bulletList(artifactLines)].join('\n'),
    [
      '## Notes',
      '- rewritesApplicationCode: false',
      '- adopt never rewrites application code in v1; .planmo/adopt/ is the only writable surface.',
    ].join('\n'),
  ];
  return blocks.join('\n\n');
}
