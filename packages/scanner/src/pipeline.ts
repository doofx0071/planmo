/**
 * Lead-owned end-to-end composition (Phase 10).
 *
 * analyzeRepository: safe scan -> evidence-backed detection -> structural
 * standards discovery -> injection classification of policy/CI text ->
 * dry-run adoption plan. Everything is deterministic and all filesystem
 * access goes through the injected reader; nothing is ever written.
 */

import type {
  AdoptReport,
  FileReader,
  InjectionScanResult,
  ScanOptions,
  ScanReport,
  ScannerEngine,
  DetectionEngine,
  StandardsDiscoveryEngine,
} from './contracts.js';
import { ReaderError } from './contracts.js';
import { safeScanner } from './scan/safe-scanner.js';
import { stackDetector } from './detect/stack-detector.js';
import { standardsDiscovery } from './context/standards-discovery.js';
import { classify as classifyText } from './security/prompt-isolation.js';
import { adopt } from './adopt/adopt.js';

/** Manifest files whose text feeds stack/test/CI detection. */
const MANIFEST_BASENAMES: ReadonlySet<string> = new Set([
  'package.json',
  'pnpm-lock.yaml',
  'package-lock.json',
  'yarn.lock',
  'bun.lockb',
  'bun.lock',
  'Cargo.toml',
  'Cargo.lock',
  'go.mod',
  'go.sum',
  'pyproject.toml',
  'requirements.txt',
  'Pipfile',
  'Pipfile.lock',
  'poetry.lock',
  'composer.json',
  'composer.lock',
  'Gemfile',
  'Gemfile.lock',
  'pom.xml',
  'build.gradle',
  'build.gradle.kts',
  'settings.gradle',
  'settings.gradle.kts',
]);

/** CI declaration files whose text is classified for prompt injection. */
const CI_BASENAMES: ReadonlySet<string> = new Set([
  '.gitlab-ci.yml',
  '.gitlab-ci.yaml',
  'Jenkinsfile',
  'azure-pipelines.yml',
  'azure-pipelines.yaml',
  '.circleci/config.yml',
  '.circleci/config.yaml',
]);

function basenameOf(rel: string): string {
  const idx = rel.lastIndexOf('/');
  return idx === -1 ? rel : rel.slice(idx + 1);
}

function isCiYamlPath(rel: string): boolean {
  if (/^\.github\/workflows\/[^/]+\.(ya?ml)$/.test(rel)) return true;
  if (rel === '.github/workflows/ci.yml') return true;
  return CI_BASENAMES.has(rel);
}

async function readSafely(reader: FileReader, rel: string, root: string): Promise<string | null> {
  try {
    return await reader.readFile(joinRoot(root, rel));
  } catch (err) {
    if (err instanceof ReaderError) return null;
    throw err;
  }
}

/** Join a normalized repository root with a POSIX-relative entry path. */
function joinRoot(root: string, rel: string): string {
  const normalized = root.replace(/[/\\]+$/, '');
  return `${normalized}/${rel}`;
}

export interface AnalyzeOptions {
  scan?: Partial<ScanOptions>;
}

export interface AnalyzeResult {
  report: AdoptReport;
  /** The scan itself, so a caller can record its stats and whether a cap cut it short. */
  scan: ScanReport;
  /** Every injection-classified text (path attached). */
  injections: readonly InjectionScanResult[];
  standards: Awaited<ReturnType<StandardsDiscoveryEngine['discover']>>;
  detection: Awaited<ReturnType<DetectionEngine['detect']>>;
}

export async function analyzeRepository(
  root: string,
  reader: FileReader,
  options?: AnalyzeOptions,
): Promise<AnalyzeResult> {
  const scanner: ScannerEngine = safeScanner();
  const scan = await scanner.scan(root, reader, options?.scan);

  // 1) Manifest + CI-declaration text for detection (unreadable files skipped).
  const manifests = new Map<string, string>();
  for (const entry of scan.entries) {
    if (entry.type !== 'file') continue;
    if (!MANIFEST_BASENAMES.has(basenameOf(entry.path)) && !isCiYamlPath(entry.path)) continue;
    const res = await readSafely(reader, entry.path, root);
    if (res !== null) manifests.set(entry.path, res);
  }
  const detection = await stackDetector.detect(manifests);

  // 2) Standards discovery is path-only (never reads content).
  const paths = scan.entries.map((e) => e.path);
  const standards = await standardsDiscovery.discover(paths);

  // 3) Injection classification over EVERY scanned text file (bounded by the
  //    scan caps; binary content is skipped by fail-closed readers). Scanned
  //    content is DATA — it can never override the immutable policy.
  const candidates = new Set<string>();
  for (const entry of scan.entries) if (entry.type === 'file') candidates.add(entry.path);

  const injections: InjectionScanResult[] = [];
  for (const rel of [...candidates].sort()) {
    const res = await readSafely(reader, rel, root);
    if (res === null) continue;
    const result = classifyText(res);
    injections.push({ ...result, path: rel });
  }

  // 4) Dry-run plan (never writes; rewritesApplicationCode is false).
  const report = adopt.plan({ scan, detection, injections, root });
  return { report, scan, injections, standards, detection };
}
