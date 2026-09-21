import type { Diagnostic, DiagnosticReport } from './contracts.js';
import { countsOf, sortDiagnostics } from './contracts.js';

/**
 * Environment/project health doctor engine (P09-03).
 *
 * The caller (CLI) resolves environment facts into the input; this engine
 * NEVER mutates state and never touches the filesystem. Stable CI codes
 * (no codes beyond DOC-001..006):
 * - DOC-001 error: node major < 24 (below the required LTS line).
 * - DOC-002 warning: node major is 25+ (untested, ahead-of-LTS).
 * - DOC-003 error: package manager is not "pnpm".
 * - DOC-004 warning: git worktree is dirty (uncommitted changes before phase close).
 * - DOC-005 info: gate checks last ran < 60 minutes ago (fresh).
 * - DOC-006 error: required next-phase prompt files are missing.
 *
 * PURE + deterministic: no clock, no randomness, no filesystem. Diagnostics
 * sorted (severity rank, then code). The returned result also carries an
 * overall summary: fail when any error, warn when any warning, else ok
 * (info diagnostics do not downgrade a green result).
 */

/** Injected environment facts (the CLI resolves these). */
export interface DoctorInput {
  /** Node version string like "24.11.0" (optional leading "v"). */
  nodeVersion: string;
  /** Package manager name, e.g. "pnpm", "npm", "yarn". */
  packageManagerName: string;
  /** Whether the git worktree has uncommitted changes. */
  gitWorktreeDirty: boolean;
  /** Minutes since the phase gate checks last ran (absent = never ran). */
  gateLastRunMinutes?: number;
  /** Count of required next-phase prompt files that are missing. */
  promptFilesMissing: number;
}

/** Overall health summary derived from the diagnostic counts. */
export type DoctorHealth = 'ok' | 'warn' | 'fail';

export interface DoctorResult extends DiagnosticReport {
  /** fail (any error) > warn (any warning) > ok (info/clean). */
  result: DoctorHealth;
}

export interface DoctorEngine {
  /** Environmental/project health check — never mutates state. */
  check(input: DoctorInput): DoctorResult;
}

/** Parse the major version, e.g. "24.11.0" or "v22.3.0" -> 24 / 22. */
function nodeMajor(nodeVersion: string): number | undefined {
  const match = /^v?(\d+)/.exec(nodeVersion.trim());
  return match !== null ? Number(match[1]) : undefined;
}

export function doctorEngine(): DoctorEngine {
  return {
    check(input: DoctorInput): DoctorResult {
      const diagnostics: Diagnostic[] = [];

      // DOC-001 / DOC-002 — Node version band.
      const major = nodeMajor(input.nodeVersion);
      if (major !== undefined && major < 24) {
        diagnostics.push({
          code: 'DOC-001',
          severity: 'error',
          target: 'node',
          message: `Node.js ${input.nodeVersion} (major ${major}) is below the required major 24 LTS`,
          remediation: 'Install Node.js 24 LTS or newer and re-run doctor.',
        });
      } else if (major !== undefined && major >= 25) {
        diagnostics.push({
          code: 'DOC-002',
          severity: 'warning',
          target: 'node',
          message: `Node.js ${input.nodeVersion} is major ${major}: ahead-of-LTS and untested`,
          remediation: 'Pin Node.js to the 24 LTS line until major 25 reaches LTS.',
        });
      }

      // DOC-003 — package manager.
      if (input.packageManagerName !== 'pnpm') {
        diagnostics.push({
          code: 'DOC-003',
          severity: 'error',
          target: 'packageManager',
          message: `package manager is "${input.packageManagerName}", expected "pnpm"`,
          remediation: 'Enable pnpm via corepack (corepack enable) and re-run doctor.',
        });
      }

      // DOC-004 — dirty worktree before phase close.
      if (input.gitWorktreeDirty === true) {
        diagnostics.push({
          code: 'DOC-004',
          severity: 'warning',
          target: 'git',
          message: 'git worktree is dirty: uncommitted changes before phase close',
          remediation: 'Commit or stash the changes before closing the phase.',
        });
      }

      // DOC-005 — fresh gate checks (info only; no remediation needed).
      if (input.gateLastRunMinutes !== undefined && input.gateLastRunMinutes < 60) {
        diagnostics.push({
          code: 'DOC-005',
          severity: 'info',
          target: 'gate',
          message: `gate checks last ran ${input.gateLastRunMinutes} minute(s) ago (fresh)`,
        });
      }

      // DOC-006 — missing next-phase prompt files.
      if (input.promptFilesMissing > 0) {
        diagnostics.push({
          code: 'DOC-006',
          severity: 'error',
          target: 'prompts',
          message: `${input.promptFilesMissing} required next-phase prompt file(s) missing`,
          remediation:
            'Generate or restore the missing next-phase prompt files before starting the phase.',
        });
      }

      const sorted = sortDiagnostics(diagnostics);
      const counts = countsOf(sorted);
      const result: DoctorHealth = counts.error > 0 ? 'fail' : counts.warning > 0 ? 'warn' : 'ok';
      return { diagnostics: sorted, counts, result };
    },
  };
}
