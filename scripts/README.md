# Scripts

Verification and build tooling. Run from the repository root with Node 24 on PATH
and dependencies installed (`pnpm install`).

## Gate and structure

| Script                  | Purpose                                                                     |
| ----------------------- | --------------------------------------------------------------------------- |
| `check-boundaries.mjs`  | Enforces the package dependency graph and package naming. Wired into `pnpm boundary-check` and CI. |

## End-to-end suites

These drive the **real built CLI** (`packages/planmo/dist/bin.js`) or the built
packages, so run `pnpm build` first. Each script exits non-zero on failure and
prints a one-line verdict.

| Script                   | Covers                                                                |
| ------------------------ | --------------------------------------------------------------------- |
| `e2e-phase05.mjs`        | Planning compiler and artifact generator: determinism, manifest, diff |
| `e2e-phase06.mjs`        | Agent bridge: adapters, proposal gate, determinism                    |
| `e2e-phase07.mjs`        | Design engine: DTCG emit, registry trust, a11y, standards             |
| `e2e-phase08.mjs`        | Workflow engine: packets, leases, gates, consolidation                |
| `e2e-phase09.mjs`        | Trace: quality, debt, memory health, standards drift, fitness         |
| `e2e-phase10.mjs`        | Scanner: standards ranking, symlink refusal                           |
| `e2e-phase11.mjs`        | Ecosystem: portable export, provider honesty                          |
| `e2e-phase12-pilots.mjs` | Real-CLI pilots: init, dry-run, collision, adopt, exit codes          |
| `e2e-cli-generate.mjs`   | Real-CLI: `init` writes the planning tree; `generate` regeneration    |

The names record the roadmap phase that introduced each suite; they are the
regression suite, not per-phase scratch work.

## Evaluations

| Script                       | Measures                                                            |
| ---------------------------- | ------------------------------------------------------------------- |
| `eval-context-retrieval.mjs` | Context recall/precision per scenario, including the v1 lexical blind spot |
| `eval-token-budget.mjs`      | Token cost of each context strategy against the configured budget   |
