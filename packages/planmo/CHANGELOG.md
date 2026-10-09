# planmo

## 1.11.0

### Minor Changes

- 9fede71: `planmo trace`, `planmo handoff` and `planmo pack` — and the Hermes target fix
  that testing against a real agent found.
  
  **`planmo trace [id]`** renders the requirements → tasks → tests trace graph:
  
  ```console
  $ planmo trace
  TRACE REPORT - trace graph
  TRC-002 [warning] P00-01: task P00-01 has no test evidence
  ...
  ```
  
  The engine builds and renders the **whole** graph and offers no subgraph
  filtering, so an `id` never narrows the output. The command prints a note saying
  so and naming the focused node, rather than implying it filtered. Adapting the
  engine's real capability is the honest choice; inventing a filter would be worse
  than the missing feature.
  
  **`planmo handoff`** records the current phase's handoff from `.planmo/state.yml`
  and `planning/tasks.csv` (RFC 4180 parsed; status is field 4, never the last
  field) and writes `planning/handoffs/phase-<NN>-handoff.md` through
  `writeManaged`, so a handoff **you** own is a collision rather than a silent
  overwrite. `--dry-run` prints the document and writes nothing.
  
  `missingForResume` — the engine's own answer to "is this enough to resume from?" —
  is reported as a **warning**, not a failure. A phase with no completed tasks yet
  genuinely cannot be resumed from, and that is the normal state early in a phase;
  exiting non-zero for work that succeeded would be a false failure.
  
  **`planmo pack`** is honest about a gap rather than papering over it. There is no
  remote registry and no bundled catalog, so the only source is a local directory
  of `pack.yml` files (`--source <dir>`); with none configured it says so:
  
  ```console
  $ planmo pack
  Pack catalog
    No pack catalog source is configured. `planmo pack` resolves packs only from a
    local directory of pack.yml files (--source <dir>); it never fetches from a
    remote registry.
  ```
  
  Nothing is downloaded and no network call is made.
  
  ## Exit code 3 now means what it says
  
  All three adapters threw a **plain** `Error` when `.planmo/` existed but
  `project.yml` was unreadable, which lost the `ProjectNotFoundError` type the CLI's
  exit-3 mapping depends on — and `pack` wrapped the original error, so it lost the
  type on _every_ path. A missing workspace reported exit 1, the code for a generic
  error, in a contract callers branch on.
  
  They now share one `WorkspaceNotFoundError extends ProjectNotFoundError`. Caught
  by the new E2E check `pack exits 3 without a workspace`, which is exactly the kind
  of thing that only a real CLI run finds — the unit tests passed throughout.
  
  ## The Hermes fix
  
  `planmo agent init --agent hermes` wrote to `~/.hermes/skills`, which is wrong
  twice over: on Windows Hermes's home is `%LOCALAPPDATA%\hermes`, so the file
  landed in a directory Hermes never scans, and it demanded `--global` to write
  outside the project at all. Hermes reads repo-local skills from
  `<project>/.hermes/skills/`, so that is now the target — project-scoped, no
  consent needed. `hermes-global` keeps the user-level location for the
  all-projects case.
  
  Found by installing the generated skills and then loading one **through Hermes
  itself**: `skills_list` discovered all three and `skill_view('planmo-next')`
  reported `readiness_status: available`. That also verifies the thing that could
  not be checked from inside this repository — that the skill files PlanMo writes
  are consumable by a real agent runtime.

### Patch Changes

- Updated dependencies [9fede71]
  - @planmo/agent-bridge@1.3.1
  - @planmo/workflow@1.1.2
  - @planmo/trace@1.1.6

## 1.10.0

### Minor Changes

- fa4cd8a: `planmo doctor` — environment and workspace health, and the package-manager bug
  that had to be fixed before it could be wired.
  
  ```console
  $ planmo doctor
  environment:
    node            v24.11.0
    package manager pnpm
    git worktree    clean
    prompts missing 0
  doctor: OK (0 error(s), 0 warning(s), 0 info)
  ```
  
  **The bug.** `doctorEngine()` hardcoded `expected "pnpm"` and raised **DOC-003 as
  an error** for anything else. That is correct for this repository, where pnpm is
  the convention, and wrong for every other project — a Python service, a Go binary,
  a Rust crate would each have been told their package manager was an error. It
  could not be wired as it stood without shipping false failures.
  
  The engine no longer invents an expectation. `DoctorInput.expectedPackageManager`
  is optional: supplied, a mismatch is an error as before; absent, the engine stays
  silent, because there is nothing to judge. Silence rather than an `info`
  diagnostic is deliberate — it keeps the engine's existing "a clean environment
  reports nothing" property intact, and the CLI prints the resolved facts itself:
  
  ```console
  $ planmo doctor          # in a project with a poetry.lock
    package manager poetry
  doctor: OK (0 error(s), 0 warning(s), 0 info)
  ```
  
  **The adapter** (`packages/planmo/src/doctor.ts`) resolves the facts the engine
  cannot know, the same shape as `validate` over the same package:
  
  - Node version from the runtime.
  - Package manager detected from the lockfile (pnpm, bun, yarn, npm, uv, poetry,
    pipenv, cargo, go, bundler, composer) — most specific first, `unknown` when
    there is none. Reported, never judged.
  - Git worktree state via `git status --porcelain`. A failing `git` (not a repo, no
    git installed) is reported as clean rather than as an error: not having git is
    not a health problem here.
  - Missing next-phase prompt file: the workspace state names one, so if it is
    absent that is a real gap; if the state names none, there is nothing to check.
  
  `doctor` exits `0` unless the environment genuinely fails (`1`), and `3` with no
  workspace — so it works as a pre-flight check without turning a warning into a
  build failure.

### Patch Changes

- Updated dependencies [fa4cd8a]
  - @planmo/trace@1.1.5

## 1.9.0

### Minor Changes

- 01f48ae: `planmo diff` — see what `generate` would change, before letting it change it.
  
  ```console
  $ planmo diff
  The planning tree already matches the project model.
    24 generated document(s) already current.
    6 document(s) you own, left alone.
  
  $ planmo diff              # after deleting a generated document
  Would create (1):
    planning/testing/TEST-STRATEGY.md
  
  1 document(s) would change, 0 refused.
  Run `planmo generate` to apply.
  ```
  
  `generate --dry-run` already existed and printed the planned writes. `diff` is the
  reviewable form: it groups the pending work by action (`create` / `update` /
  `merge` / `refused`), shows the unified diff of the content changes, and writes
  nothing. `--exit-code` makes it a check — exit `1` when the tree is out of date,
  like `git diff --exit-code` — so the default exit contract is untouched and a diff
  stays information rather than a failure unless you ask for it to be one.
  
  **The preview decides by ownership, not by bytes.** `SynthPreview` reports
  `overwrite` for anything the generation manifest owns, whether or not the content
  differs — so reporting the preview directly called a freshly generated tree "24
  documents would update", which is exactly the kind of noise that makes people stop
  reading a diff. Every candidate is now compared against the bytes on disk, and
  only real differences are reported. `GenerateOutcome` therefore carries `contents`
  (the exact bytes each document would be written with) alongside `changes`, and the
  doc comment on `changes` says plainly what it does and does not mean.
  
  Seeded documents you own are never reported as updates — `DECISIONS.md`,
  `OPEN-QUESTIONS.md`, `RISKS.md` and `prompts/` appear under "left alone", which is
  the ownership rule (ADR-0016) asserted through the diff surface.

## 1.8.1

### Patch Changes

- 7d05587: Clarify the `policies/` line in the README's workspace tree.
  
  `planning/policies/` exists only when a pack supplies standards rules, so the
  tree now says so rather than implying the folder is always generated. Follows the
  generator fix that stopped the generated `planning/README.md` advertising the
  folder unconditionally.
- Updated dependencies [7d05587]
  - @planmo/generator@1.1.3

## 1.8.0

### Minor Changes

- 5666d75: `planmo agent apply` — the other half of the agent loop, so `planmo-propose` is no
  longer a promise the CLI cannot keep.
  
  Since `agent init` shipped, every agent has received a `planmo-propose` command
  ending with _"tell the user to run `npx planmo agent apply proposal.json`, which
  validates it before anything changes."_ That command did not exist.
  
  ```console
  $ planmo agent apply proposal.json
  ✓ wrote .planmo/proposals/add-planmo-next-to-the-command-surface.json
  Recorded proposal "Add planmo next to the command surface" from cursor
  
  2 item(s):
    cli-next  proposed  Wire the next command.
        ref: REQ-001
    docs  proposed  Document it in the README.
        why: Users cannot find it.
  
  Plan documents were NOT rewritten. An item states what should change, not a
  mechanical edit, so changing the plan stays a human decision — that is the
  invariant that keeps agent output out of canonical state.
  ```
  
  **`apply` validates and records; it never rewrites the plan.** `AiProposalSchema`
  is deliberately loose — an item is `{ id, status, summary, rationale?, references? }`
  — and its own documentation says items are deltas the workflow engine interprets
  and the agent bridge never applies directly. Rewriting the plan from a free-text
  summary would mean PlanMo inventing an edit the agent never specified, and would
  put agent output straight into canonical state. ADR-0026 records the decision and
  the alternatives that were rejected.
  
  What it does do, and does strictly:
  
  - **Validates at the bridge boundary** with the existing strict schema. An unknown
    key is rejected naming the field, and **nothing partial is written** — not even
    the proposals directory.
  - **Records the normalised proposal** at `.planmo/proposals/<slug>.json` through
    the safe writer. No timestamp, so the record is deterministic, safe to diff and
    commit, and re-applying an unchanged proposal is a no-op.
  - **Slugs the free-text `requestId`** to `[a-z0-9-]`, capped at 64 characters.
    `requestId` is written by an agent and becomes a filename, so this is a
    path-traversal sink; slugging makes traversal impossible _by construction_
    rather than by a check a later edit could drop. The writer's containment check
    is the second guard, not the first.
  - **Refuses a collision** rather than replacing an existing record (`--force` to
    replace), and returns `2`, keeping the documented exit contract.
  
  The record lives in `.planmo/proposals/` rather than the planning tree, which is
  generated, manifest-tracked and validated against a fixed document set. It is
  deliberately not `.planmo/adopt/`, which ADR-0024 reserves for the adoption
  scanner.
  
  `@planmo/agent-bridge` gains `proposalSlug`, `proposalRecordPath`,
  `renderProposalRecord` and `PROPOSALS_DIR` — all pure, so the naming rules are
  testable without a filesystem.

### Patch Changes

- Updated dependencies [5666d75]
  - @planmo/agent-bridge@1.3.0
  - @planmo/workflow@1.1.1
  - @planmo/trace@1.1.4

## 1.7.0

### Minor Changes

- 0d9d79f: `planmo next` — the command file PlanMo installs into every agent now works.
  
  Since 1.5.0, all 31 supported agents receive a `planmo-next` command whose body
  says _"Run `npx planmo next --print` and follow the directive it prints."_ That
  command did not exist. It does now.
  
  ```console
  $ npx planmo next --print
  Phase 03 — CLI foundation
  
  Next task  P03-01   MUST   TODO
    Implement the planmo CLI: init, status, adopt, generate, validate.
  
  Read before you start:
    planning/phases/phase-03.md
    planning/CONTEXT.md
    planning/STANDARDS.md
    planning/TRACKER.md
  
  Progress  7 of 28 tasks done · 21 ready
  
  Change only what this task requires, and add no adjacent edits.
  When you are done, run `npx planmo validate`.
  ```
  
  The selection is delegated to the task DAG that already existed in
  `@planmo/workflow` (`task-dag.ts`), so "next" is the lowest-id task that is ready.
  Because task ids are phase-major and zero-padded, that is also the earliest phase
  with work left — **phase gating falls out of the identifier scheme** rather than
  needing a second rule, which is what the fixed width was made load-bearing for.
  
  `BLOCKED` is never ready, so a blocked task is stepped over and then reported in a
  `Blocked (n):` section — never silently skipped. A row in `tasks.csv` that cannot
  be read is reported as a warning rather than dropped, and a phase whose document
  is missing simply omits its title instead of failing the brief.
  
  `@planmo/workflow` gains `parseTaskList` / `composeNextBrief` / `phaseDocPath` /
  `phaseTitleFromDoc` (all pure) and a declared dependency on `@planmo/shared` for
  the RFC 4180 CSV reader — so a task title containing a comma does not split the
  row. `planmo next` itself is a thin adapter, the same shape as `validate` over
  `@planmo/trace`: read the documents, hand them to the engine, print what it
  returns. Nothing about the selection lives in the CLI.
  
  Flags: `--dir <path>`, `--print` (the default — print and write nothing; it exists
  because the installed command file passes it), and `--json` for agents and CI.
  Exit codes: `0` ok, `1` a workspace that exists but has no planning tree yet,
  `3` no workspace at all.

### Patch Changes

- Updated dependencies [0d9d79f]
  - @planmo/workflow@1.1.0
  - @planmo/trace@1.1.3

## 1.6.0

### Minor Changes

- 2356d99: Support 31 coding agents, up from 6 — and support the two formats and two layouts
  they actually use.
  
  `planmo agent list` now covers Amazon Q Developer, Amp, Augment, Claude Code,
  Cline, CodeBuddy, Codex, Command Code, Continue, Copilot, Crush, Cursor, Factory
  Droid, Gemini CLI, Goose, Grok CLI, iFlow, Junie, Kilo Code, Kimi Code CLI, Kiro,
  opencode, OpenHands, Qwen Code, Roo Code, Tabnine, Trae, Windsurf, Zed, Hermes and
  a `generic` fallback.
  
  Every row records the official documentation URL it was read from, so a format can
  be re-checked against the source rather than a memory of it. The full table is in
  `docs/02-architecture/agent-command-files.md`.
  
  Two things were needed beyond more rows:
  
  **A second file format.** Gemini CLI, Tabnine and iFlow take **TOML** commands
  (`description` + a required `prompt`), not markdown. The body is emitted as a TOML
  literal multi-line string so markdown backticks and backslashes survive verbatim.
  
  **Detection moved into the table.** Markers used to be a separate map in
  `detect.ts`; they are now a field on each target, so adding an agent really is one
  row. `AGENTS.md` is deliberately shared by `amp`, `codex` and `openhands`, and
  detection reports all three rather than guessing which one is meant.
  
  `.agents/skills/` is the cross-client convention from the Agent Skills standard
  (agentskills.io), not any one vendor's directory — several agents read it in
  addition to their own, so six rows point at it. Installing for two of those is
  idempotent rather than a double write, and a test pins that this is the only
  shared directory.
  
  Deliberately absent: **aider**, which has no user-defined command mechanism (its
  closest equivalent is the user's own `CONVENTIONS.md`, which PlanMo will not
  write). `docs/02-architecture/agent-command-files.md` records that and the other
  known gaps rather than shipping a row that cannot work.

### Patch Changes

- Updated dependencies [2356d99]
  - @planmo/agent-bridge@1.2.0
  - @planmo/workflow@1.0.3
  - @planmo/trace@1.1.2

## 1.5.0

### Minor Changes

- 1b370fc: `planmo agent init` now detects your coding agent and asks you, instead of needing
  `--agent` typed out.
  
  ```console
  $ planmo agent init
  
  Detected in this project:
    opencode (already installed) — .opencode/, .opencode/commands/planmo-next.md
    claude-code (detected) — CLAUDE.md
  
  ◆  Which agent(s) should PlanMo install commands for?
  │  ◼ opencode        .opencode/commands
  │  ◻ claude-code     .claude/skills
  │  ◻ codex           .agents/skills
  │  ◻ copilot         .github/skills
  │  ◻ hermes          ~/.hermes/skills (global)
  │  ◻ generic         .planmo/agents/commands
  └
  ◆  Install 1 command set(s) now? (Y/n)
  ```
  
  Detection reads **filesystem markers only** — never the network, never an
  environment variable — so it is identical on every run, and the evidence is shown
  next to each agent so a wrong guess is visible and can be unticked. Markers:
  `.opencode/`, `.claude/` or `CLAUDE.md`, `.codex/` or `AGENTS.md`,
  `.github/copilot-instructions.md`, and `~/.hermes/` for Hermes. A file PlanMo has
  already installed is the strongest signal and is reported as `already installed`.
  `PLANMO_HOME` overrides the home directory used for the Hermes marker, so
  detection stays deterministic in CI and sandboxes.
  
  Interactive selection is offered only on a real terminal. Everywhere else the
  behaviour is unchanged and scriptable:
  
  - `--agent <id>` (still the documented flag, comma-separated for several) skips
    detection and every prompt.
  - `--yes` never prompts: detection decides, or the command errors telling you to
    pass `--agent`.
  - With no terminal, no flag and markers present, detection decides and says so.
  - A **global** target (`hermes`) is never auto-installed: it writes outside the
    project, so it needs the explicit `--global`. In the guided flow it asks first.
  
  The guided flow adds one runtime dependency, `@clack/prompts`, for arrow-key
  select and multi-select. The existing `WizardIO` is extended with
  `select`/`multiSelect`/`confirm` rather than growing a second prompt mechanism,
  and those three return `undefined` on cancel so every caller must decide what
  cancelling means — here, writing nothing.

## 1.4.0

### Minor Changes

- 47fc9e8: Add `planmo agent init` — install PlanMo command files into your own coding agent.
  
  PlanMo never holds an LLM key. The agent you already run does the AI; PlanMo
  installs the commands that tell it what to do, exactly as GitHub's spec-kit does.
  
  ```
  $ planmo agent init --agent opencode
  ✓ wrote .opencode/commands/planmo-next.md
  ✓ wrote .opencode/commands/planmo-status.md
  ✓ wrote .opencode/commands/planmo-propose.md
  Installed for opencode. Invoke in your agent with:
    /planmo-next
    /planmo-status
    /planmo-propose
  ```
  
  Supported targets, each with its own documented layout: `opencode`
  (`.opencode/commands/<name>.md`), `claude-code` (`.claude/skills/<name>/SKILL.md`),
  `codex` (`.agents/skills/<name>/SKILL.md`, invoked `$planmo-next`), `copilot`
  (`.github/skills/<name>/SKILL.md`), `generic` (`.planmo/agents/commands/`), and
  `hermes` (`~/.hermes/skills/`, global — refused unless `--global` is passed,
  because generation never writes outside the project root without consent).
  
  The templates tell the agent to **run the CLI** — `npx planmo next --print`,
  `npx planmo validate` — rather than write plan documents itself, so PlanMo still
  owns every generated byte and the output stays deterministic.
  
  Refresh safety works like spec-kit's upgrade: a file PlanMo wrote and you have not
  touched is simply current, so re-running is a clean no-op; a file whose bytes
  differ is yours and is reported as a collision unless `--force` is passed.
  
  `@planmo/agent-bridge` gains the target table, the templates and the renderer
  (`agent-targets.ts`, `agent-templates.ts`, `agent-files.ts`) as data, so adding an
  agent is one row rather than an architecture change. The CLI gains a runtime
  dependency on `@planmo/agent-bridge`, `@planmo/adapters` and `@planmo/workflow`,
  and the package boundary graph is extended to allow them.

### Patch Changes

- Updated dependencies [47fc9e8]
  - @planmo/agent-bridge@1.1.0
  - @planmo/workflow@1.0.2
  - @planmo/trace@1.1.1

## 1.3.4

### Patch Changes

- Updated dependencies [0c86cf5]
  - @planmo/generator@1.1.2

## 1.3.3

### Patch Changes

- Updated dependencies [2cef618]
  - @planmo/generator@1.1.1

## 1.3.2

### Patch Changes

- Updated dependencies [47d5859]
  - @planmo/shared@1.1.0
  - @planmo/generator@1.1.0
  - @planmo/trace@1.1.0
  - @planmo/core@1.0.3
  - @planmo/packs@1.0.1
  - @planmo/scanner@1.0.3
  - @planmo/schema@1.0.3

## 1.3.1

### Patch Changes

- Updated dependencies [1cc0cf5]
  - @planmo/generator@1.0.1

## 1.3.0

### Minor Changes

- 7797153: Add `planmo validate`, and fix `tasks.csv` so a generated workspace passes it.
  
  `validate` checks a workspace's canonical documents and their cross-document
  invariants and exits `1` when the report contains an error, so it can gate CI. It
  is a thin adapter over `@planmo/trace`'s validator — no validation logic in the
  CLI. Diagnostics carry stable codes (`VLD-001` phase gap, `VLD-002` blocked task
  with no row, `VLD-003` handoff next-phase, `VLD-004` document fails schema parse)
  and an actionable remediation line.
  
  Fixed: the generated `planning/tasks.csv` had six columns
  (`id,phase,title,status,depends_on,acceptance`) while the validator requires
  exactly five (`id,phase,title,status,priority`), so a freshly generated workspace
  failed its own validator with `VLD-004`. Dependencies and acceptance criteria now
  live in `REQUIREMENTS-TRACEABILITY.md` and the phase documents, where they are not
  constrained to a fixed column count.
  
  Publishing is now tokenless: all twelve packages exist on the registry and carry a
  trusted publisher, so the `NPM_TOKEN` fallback is gone from the release workflow.
  Adding a brand-new package will need a bootstrap token again.

## 1.2.0

### Minor Changes

- 72c9457: `planmo init` now produces the full planning workspace, and user-owned documents
  survive regeneration.
  
  `init` previously wrote the plan spine only (roadmap, tracker, phase docs, handoff
  template, standards, context). It now also emits the documents an agent needs to
  work the plan:
  
  - `planning/README.md`, `MASTER-PLAN.md`, `REQUIREMENTS-TRACEABILITY.md` and the
    canonical `tasks.csv`
  - `planning/architecture/{ARCHITECTURE,DOMAIN-MODEL,SECURITY-PRIVACY,STATE-MACHINES}.md`
  - `planning/compliance/POLICY-REGISTER.md`
  - `planning/design/{DESIGN-BRIEF,DESIGN-SYSTEM}.md`
  - `planning/prompts/{README,phase-prompt}.md`
  - `planning/requirements/PRODUCT-REQUIREMENTS.md`
  - `planning/testing/TEST-STRATEGY.md`
  
  A standard-depth project now generates 30 documents (was 12).
  
  Ownership is per document, not per folder. Documents derived from the project model
  are regenerated; documents that accumulate decisions (`DECISIONS.md`,
  `OPEN-QUESTIONS.md`, `RISKS.md`, `prompts/`) are written once and then belong to the
  user.
  
  Fixed: seeded documents were rewritten on every `generate`, silently discarding user
  edits. `compileWorkspace` now writes only what the preview marks writable, so a
  `seeded` file that already exists is never touched again.

## 1.1.1

### Patch Changes

- 106b470: Publish the seven remaining workspace packages, so all twelve are on npm.
  
  `planmo@1.1.0` shipped depending on `@planmo/generator` and `@planmo/packs`, which were
  still private — `npm install planmo@1.1.0` failed with a 404 resolving
  `@planmo/generator`. Every package in the CLI's runtime closure is now published, so the
  CLI installs again.
  
  The seven were bumped to `1.0.0` directly rather than through a changeset: a `major`
  changeset on a `0.x` package cascades patch bumps to every dependent and would have
  shipped the whole release as `1.0.1`.

## 1.1.0

### Minor Changes

- 73cdd31: Add `planmo generate`, and make `planmo init` produce the planning workspace.
  
  `init` previously wrote only the three `.planmo/` documents, leaving a workspace with
  nothing for an agent to work from. It now also compiles the planning tree
  (`planning/ROADMAP.md`, `TRACKER.md`, `STANDARDS.md`, `CONTEXT.md`, `handoffs/TEMPLATE.md`
  and `phases/phase-NN.md`) through the same generator that powers regeneration, and records
  every artifact in `.planmo/manifest.json` with ownership and lineage.
  
  New command: `planmo generate [--dir <path>] [--dry-run] [--force]` recompiles the planning
  documents from the canonical project model. Manifest-owned files are refreshed without
  `--force`; unmanaged files are never overwritten.

## 1.0.2

### Patch Changes

- 5473462: Add a README to every published package and fill in npm metadata (repository,
  homepage, bugs, keywords), and enable npm provenance attestation.
  
  The published tarballs previously contained only `dist/`, `package.json` and
  `LICENSE`, so the npm pages rendered empty with no usage information. No runtime
  change.
- Updated dependencies [5473462]
  - @planmo/shared@1.0.2
  - @planmo/schema@1.0.2
  - @planmo/core@1.0.2
  - @planmo/scanner@1.0.2

## 1.0.1

### Patch Changes

- 15dcca6: Validate npm Trusted Publishing (OIDC) for the v1 release line.
  
  No functional change: this release exists to prove the release workflow publishes
  with no npm token, via OIDC (`id-token: write`) and the trusted-publisher
  configuration on each package. A real publish is required because npm only
  validates a trusted-publisher configuration once it sees an authenticated publish
  from the configured repository and workflow.
- Updated dependencies [15dcca6]
  - @planmo/shared@1.0.1
  - @planmo/schema@1.0.1
  - @planmo/core@1.0.1
  - @planmo/scanner@1.0.1

## 1.0.0

### Major Changes

- 5ac4068: Phase 12 (release candidate prep): upgrade/migration validation E2E, representative pilots on the real CLI, and new-user docs — hardening evidence, no behavioural regressions.
  
  - `@planmo/schema`: `upgrade-migration-e2e.test.ts` (NEW, 24 tests) migrates every chain-covered legacy fixture (project/state/handoff v0 → v1) to the current schema with strict-parse + round-trip stability + `extensions` preservation; asserts v1-only kinds (lockfile, manifest, pack, design profile, trace graph, work packet) keep golden fixtures parseable (incl. pre-Phase 11 lockfiles and legacy ownership aliases) and reject future/unknown versions; records the downgrade policy: migration is upgrade-only (no engine-supported downgrade), v0 → v1 is additive and pure, legacy rollback is legacy-only (original v0 file always untouched).
  - `@planmo/core` / `@planmo/scanner` / `@planmo/cli`: exercised end-to-end by `scripts/e2e-phase12-pilots.mjs` (8 pilots, 63/63 checks) driving the real built CLI — greenfield init + HEALTHY status, dry-run writes nothing, collision exit 2 + `--force`, brownfield `adopt --dry-run` confined to `.planmo/adopt/` with `rewritesApplicationCode: false` on a hostile fixture, `--depth high-assurance` validation, exit-code surface 0/1/2/3, byte-identical determinism across runs. No code changes in this phase — hardening is evidence + docs only.
  - Docs: `docs/10-engineering/pilots.md` (NEW — pilot report, findings incl. the documented-vs-real CLI surface mismatch), `docs/03-cli/examples.md` (NEW — new-user walkthrough matching the actual v1 surface), `docs/09-testing/release-test-gates.md` (Phase 12 evidence section).

### Patch Changes

- Updated dependencies [5ac4068]
  - @planmo/schema@1.0.0
  - @planmo/core@1.0.0
  - @planmo/scanner@1.0.0
