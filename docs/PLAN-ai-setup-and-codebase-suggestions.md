# Plan: Secure AI Setup and Codebase Suggestions

Status: approved for execution. Implement Phases 0–2 using the 8 existing presets plus custom; provider expansion remains gated on the user’s checklist selection, and OAuth remains provider-specific.

## Execution ledger

- Phase 0: complete — capability research, provider inventory, ADR-0029, and provider documentation are committed.
- Phase 1: in progress — strict profile schema, cross-platform user config, atomic persistence, OS keyring, masked secret input, provider inventory, setup wizard, and saved-profile `plan` runtime are implemented and reviewed; `auth` lifecycle and `model` selection remain.
- Phase 2: pending — privacy-safe scanner context, validated advisory report, consent-gated `planmo suggest`, and credential-free end-to-end coverage remain.
- Phase 3: gated — do not implement provider/catalog expansion until the user edits the checklist; prechecked boxes are review shortlist, not implementation approval.

## Goal

Add a secure user-level AI setup and model-selection workflow, then a read-only `planmo suggest` command that produces evidence-backed, privacy-aware recommendations for an existing codebase without changing its files.

## Current context / assumptions

- Target repository: `C:\Users\Damascus\Videos\clel\planmo`, PlanMo v1 monorepo, Node `>=24`, pnpm. Follow its `AGENTS.md`, especially deterministic generation, untrusted-repository, secret-leakage, no-overwrite, schema-validation, and Changesets rules.
- Provider inventory verified from source and live pickers: `packages/ai/src/providers.ts` defines 8 PlanMo runtime presets; `packages/agent-bridge/src/agent-targets.ts` defines 32 coding-agent integrations. Hermes `model` showed 39 provider/profile entries (including one generic direct-API profile), then separate Local models and Custom endpoint options; it was cancelled at the choice prompt and reported “No change.” OpenCode `auth login` showed Popular and searchable Services sections plus a separate MCP section (one visible Supabase entry); it was cancelled before selecting an integration or entering credentials. The live Models.dev API returned 228 provider records. This catalog count is not a count of verified PlanMo adapters or authorized OAuth flows; entries include gateways, regional/plan variants, cloud services, and local runtimes. The Phase 3 checklist distinguishes current PlanMo presets from catalog candidates and auth-plan options.
- `planmo plan` is the existing direct-model path. ADR-0027 requires its result to be validated and pinned once in `.planmo/plan.yml`; `generate` must remain deterministic and must never call a model.
- `packages/scanner` already provides a capped, deterministic, symlink-safe scanner, repository context map, symbol index, lexical context, stack detection, and immutable prompt-injection classification. Its default excludes cover dependency/build directories and `.planmo`, but not secret-bearing filenames such as `.env`; `docs/08-security/secrets-and-privacy.md` says `.env` values must not be intentionally ingested.
- A prior `.hermes/plans/2026-10-10-planmo-plan-ai-planning-engine.md` proposed environment-only credentials. This request deliberately revisits that choice. Preserve the stronger invariants: never write secrets into project files, plans, logs, or reports; never harvest credentials from OpenCode, Hermes, Claude Code, Codex, or any other tool’s private store.
- `PLANMO_HOME` already affects global-agent detection in `packages/planmo/src/detect.ts`; do not silently redefine its meaning. Use a separate `PLANMO_CONFIG_DIR` override for AI settings and tests.
- `planmo suggest` should work in any repository, with or without a `.planmo/` workspace. It is advisory only: it does not edit app code, apply a plan, or run project scripts.

## Research findings and recommendations

1. **Command names:** use `planmo setup` for the complete first-run flow (provider, authentication method, model, optional connectivity test). Use `planmo auth status|remove` for credential lifecycle and `planmo model` to change the default later. Do not add `planmo connect` as a duplicate in v1: “connect” describes only authentication, while setup also chooses a model. OpenCode’s `/connect` followed by `/models` is a useful split; Hermes’s `hermes model` wizard and `hermes auth` commands show the broader setup/lifecycle pattern.
2. **Credential storage:** keep provider/model/endpoint preferences in a user-level config directory; keep API keys and OAuth tokens in the OS credential manager (Windows Credential Manager, macOS Keychain, Linux Secret Service). Do not create a plaintext `auth.json` or put keys in `.planmo/`. Environment variables remain a supported CI/headless fallback. If no secure keyring is available, fail with instructions to use the provider environment variable rather than silently falling back to plaintext storage. Use a cross-platform keyring library only after a Node 24 + Windows/macOS/Linux compatibility spike.
3. **OAuth is provider-specific:** OAuth cannot be safely made generic by guessing endpoints or reusing another CLI’s tokens. MVP supports API keys and user-specified OpenAI-compatible endpoints; add OAuth only for providers whose official docs permit a third-party CLI flow, with user-agent/PKCE or device flow as that provider supports. Do not import OAuth files from other products.
4. **Provider inventory and selection:** `@planmo/ai` has 8 runtime presets; `@planmo/agent-bridge` has 32 coding-agent integrations. Hermes exposed 39 provider/profile entries plus local/custom choices. The live Models.dev API used by OpenCode returned 228 catalog records, while OpenCode’s docs describe 75+ provider support; neither number means PlanMo has those integrations or that each entry allows OAuth. The Phase 3 checklist prechecks current PlanMo presets and marks external catalog/profile/auth candidates for review; the user can uncheck exclusions before implementation. Separate API-key, OAuth, subscription-plan, gateway, and local routes; authenticate only through each provider’s documented, permitted flow. Add a runtime-supported status only after a real adapter, auth method, and tests exist. Use provider-declared, schema-validated model-list endpoints when available and always allow manual model IDs. Do not add a dynamic third-party registry in v1.
5. **Suggestions, not an “audit verdict”:** name the command `planmo suggest`, not `audit` (which implies pass/fail/security completeness) or `review` (which often means a diff review). Cover product/feature opportunities only when grounded in repository docs; mark them as ideas, not defects. A report must distinguish observations, risks, improvements, and feature ideas.
6. **“All files” needs an honest contract:** inventory every path the safe scanner can enumerate, then classify eligible text files, redact/exclude secrets, and feed eligible source/config/docs to the model in bounded batches. Report inventory count, model-submitted count, excluded/redacted count, truncation, token estimate, and actual provider usage separately. Never claim “all code analyzed” when a budget or scanner cap omitted content. Show the exact preview and obtain consent before source leaves the machine.
7. **Read-only by default:** `planmo suggest --dry-run` scans locally and prints a coverage/cost preview without credentials or network calls. A normal interactive run asks for per-run source-upload consent. A non-TTY run requires explicit `--allow-upload`. Output goes to stdout by default; `--output` is opt-in and refuses overwrite. No generated suggestion is executable or automatically applied.

Research sources inspected:

- [OpenCode Providers](https://opencode.ai/docs/providers/) and [OpenCode CLI](https://opencode.ai/docs/cli/): OpenCode documents 75+ LLM providers through AI SDK + Models.dev, `/connect`, user-level provider credentials, `/models`, provider configuration, and local OpenAI-compatible endpoints. This is external prior art, not a PlanMo capability claim.
- [Models.dev provider API](https://models.dev/api.json): live metadata catalog returned 228 provider records when checked. It is a discovery list, not a guarantee of runtime compatibility, provider-approved OAuth, or PlanMo support.
- Interactive checks performed without authentication: `hermes model --no-browser` showed 39 provider/profile options and returned “No change” after cancellation; `opencode auth login` was cancelled at the searchable integration picker before selecting a provider or entering credentials.
- [OpenCode Agents](https://opencode.ai/docs/agents/): the Plan agent is permission-restricted for analysis/suggestions without edits.
- [Hermes model configuration](https://hermes-agent.nousresearch.com/docs/user-guide/configuring-models), [Hermes CLI commands](https://hermes-agent.nousresearch.com/docs/reference/cli-commands), and [Hermes configuration](https://hermes-agent.nousresearch.com/docs/user-guide/configuration): provider/model wizard, OAuth/API-key setup, credential lifecycle, and user-level auth/config separation.
- [Aider API keys](https://aider.chat/docs/config/api-keys.html) and [Aider Repository Map](https://aider.chat/docs/repomap.html): environment/config-based API keys and a token-budgeted whole-repo symbol map rather than dumping every source line into one prompt.
- [Continue configuration and secrets](https://docs.continue.dev/guides/configuring-models-rules-tools): global/workspace model config and secret placeholders; PlanMo should avoid putting secrets in a repository-local `.env`.
- [Claude Code authentication](https://docs.anthropic.com/en/docs/claude-code/iam): browser login, API-key environment fallback, and explicit logout; the available auth methods differ by provider/account type.
- [RFC 8252: OAuth 2.0 for Native Apps](https://datatracker.ietf.org/doc/html/rfc8252) and [RFC 8628: Device Authorization Grant](https://datatracker.ietf.org/doc/html/rfc8628): standards to follow for any later provider-approved native CLI flow.

## Architecture / proposed approach

Add a user-scoped settings store and credential-store adapter at the CLI boundary; preserve environment-variable support and pass resolved credentials into the existing `@planmo/ai` HTTP provider without exposing them to project state. Add `planmo suggest` as a separate read-only pipeline over `@planmo/scanner` and `@planmo/ai`: safe inventory, secret filtering, token-budgeted batches, explicit upload consent, strict report validation, and verified path/line evidence. Keep model output out of `generate`, never execute repository or model-suggested commands, and write nothing unless the user explicitly supplies `--output`.

## Proposed user experience and report contract

```text
planmo setup
planmo provider list
planmo auth status
planmo model
planmo suggest --dry-run
planmo suggest --focus architecture,frontend,backend,security
planmo suggest --output .planmo/reviews/initial-review.md --allow-upload
```

`--allow-upload` is required only for unattended/non-TTY runs; an interactive run asks before the first provider request. `--dry-run` never calls the provider. `planmo setup` must say which provider/model is selected and whether the credential is in the OS keyring or supplied by an environment variable, but must never display the secret.

Suggested strict versioned report shape (the exact schema belongs in `@planmo/schema`):

```json
{
  "schemaVersion": 1,
  "provider": { "id": "openai", "model": "<selected-model-id>" },
  "summary": "<short, evidence-based overview>",
  "coverage": {
    "inventoriedFiles": 0,
    "eligibleFiles": 0,
    "submittedFiles": 0,
    "excludedFiles": 0,
    "redactedFiles": 0,
    "omittedFiles": 0,
    "estimatedInputTokens": 0,
    "actualInputTokens": 0,
    "truncated": false
  },
  "limitations": [],
  "suggestions": [
    {
      "id": "SUG-001",
      "kind": "risk",
      "category": "security",
      "title": "<specific, non-alarmist title>",
      "rationale": "<why the evidence matters>",
      "recommendation": "<specific next step, not an automatic patch>",
      "impact": "high",
      "effort": "small",
      "confidence": 0.82,
      "evidence": [
        { "path": "src/example.ts", "startLine": 10, "endLine": 18 }
      ]
    }
  ]
}
```

`kind` values: `observation`, `risk`, `improvement`, `feature-idea`. `category` values: `product`, `architecture`, `frontend`, `backend`, `data`, `design`, `accessibility`, `security`, `reliability`, `performance`, `testing`, `documentation`, `developer-experience`. Every suggestion must include at least one real, relative evidence reference; validate the path and line range against the safe scan before rendering it. Do not persist quoted source snippets in the report.

## Step-by-step tasks

Each code task uses TDD in this order: add the named failing test; run its exact command and confirm the named assertion fails (not a TypeScript/import/setup error); implement the smallest change; rerun the same command and confirm exit 0; stage only the paths named by the task and commit. Suggested messages are included. If a task grows beyond 5 minutes, split it before implementation. No live provider credentials or network are used by normal tests.

### Phase 0 — decisions and research gate

1. **Record the changed product/security decision** (2–5 min). Create `docs/12-adrs/ADR-0029-ai-setup-and-codebase-suggestions.md`. Record: `setup`/`auth`/`model`/`suggest` names; user-level settings vs project state; the shift from the earlier environment-only provider plan to OS-keyring persistence; environment fallback; no importing another product’s credentials; per-run source-upload consent; read-only suggestions; `generate` remains model-free. Explicitly defer generic OAuth and require a named, officially supported provider before adding any OAuth adapter. Verify with `pnpm exec prettier --check docs/12-adrs/ADR-0029-ai-setup-and-codebase-suggestions.md` (expected: “All matched files use Prettier code style!”). Commit: `docs(ai): decide provider setup and suggestion safety`.
2. **Publish the provider capability matrix** (2–5 min). Create `docs/06-agent-engine/provider-setup.md` with separate sections for: (a) the 8 current `@planmo/ai` runtime presets; (b) 32 `@planmo/agent-bridge` coding-agent targets; (c) 39 Hermes model-picker provider/profile entries plus local/custom choices; and (d) the 228 Models.dev provider records in the editable Phase 3 checklist. Label (c) and (d) as external candidate/profile inventories, not PlanMo support. For each user-selected candidate record official endpoint/docs, protocol, API-key/OAuth/account-plan/IAM/local auth route, model-list support, and runtime-test status; flag unknowns as `not verified`. Verify source tests with `pnpm vitest run packages/ai/src/providers.test.ts` and `pnpm vitest run packages/agent-bridge/src/agent-targets.test.ts`; expected: both pass and the matrix distinguishes provider IDs, agent targets, model IDs, and auth plans. Verify docs with `pnpm exec prettier --check docs/06-agent-engine/provider-setup.md`; commit: `docs(ai): document provider and agent capability counts`.
3. **Resolve the keyring package before adding it** (2–5 min research spike). Verified `@napi-rs/keyring@2.1.1` (`engines.node >=10`, zero runtime dependencies) exposes synchronous `Entry.setPassword/getPassword/deletePassword` and wraps keyring-rs. Its official docs map Windows to Credential Manager and macOS to Keychain; this Windows host cannot prove those other platforms. On Linux it tries Secret Service and otherwise silently falls back to kernel keyutils, which is memory-only and does not survive reboot. Require `new Entry(service, account, { linux: { store: 'secret-service' } })` so unavailable Secret Service fails closed; never accept keyutils or plaintext fallback. Add as an optional dependency and keep environment-variable fallback when the binding/store is unavailable. Record this and the upstream API/maintenance evidence in ADR-0029.

### Phase 1 — secure setup and model selection

4. **Define the non-secret user profile schema** (2–5 min). Freeze this strict shape before its readers: `{ schemaVersion: 1, profiles: [{ id: UUID, providerId: slug, modelId: non-empty string, baseUrl: string | null, credentialRef: UUID | null }], defaultProfileId: UUID | null }`. UUID identity is case-insensitive and compared in canonical lowercase form: profile ids and non-null `credentialRef` values are unique (`null` may repeat), and a non-null default must reference an existing profile using the same identity. Impose no arbitrary profile-count cap. `custom` requires a safe base URL; named providers use `baseUrl: null`. Allow HTTPS, or HTTP only for loopback; reject raw backslashes before URL parsing because WHATWG normalization can change authority parsing, and reject URL userinfo, query, and fragment so endpoint strings cannot carry credentials. Omit an open-ended `extensions` field in this credential-related user config. Test first in `packages/schema/src/ai-user-config.test.ts`: valid versioned profile parses; unknown keys and an `apiKey` field are rejected; the profile carries only an opaque credential reference. Then add `packages/schema/src/ai-user-config.ts` and export it from `packages/schema/src/index.ts`. Verify with `pnpm vitest run packages/schema/src/ai-user-config.test.ts` (RED: the named schema tests fail; GREEN: `Test Files 1 passed (1)`). Commit: `feat(schema): define user AI profiles`.
5. **Resolve the user config directory** (2–5 min). Add `packages/planmo/src/user-config-path.ts` and `packages/planmo/src/user-config-path.test.ts`. A nonblank `PLANMO_CONFIG_DIR` overrides the path for tests/portable installs; blank/whitespace values use platform defaults. Defaults are `%LOCALAPPDATA%\\PlanMo` on Windows only when `LOCALAPPDATA` is absolute (otherwise use the home fallback), `~/Library/Application Support/PlanMo` on macOS, and `${XDG_CONFIG_HOME:-~/.config}/planmo` on Linux (only an absolute XDG path is accepted). Keep `PLANMO_HOME` unchanged. Test all OS path branches through injected platform/env inputs. Verify with `pnpm vitest run packages/planmo/src/user-config-path.test.ts`; commit: `feat(cli): resolve cross-platform user config path`.
6. **Persist profiles atomically without secrets** (2–5 min). Test `packages/planmo/src/user-config.test.ts`: write/read profile round-trip; malformed config fails closed without overwrite; an `apiKey` property never serializes; symlinked `config.json` is refused without replacing the link or target; use temp `PLANMO_CONFIG_DIR`; atomic temp-file + rename. On POSIX, new config directories/files use modes `0700`/`0600`; preserve existing user-selected directory permissions. Writes are atomic per operation, not serialized across processes, so concurrent read-modify-write operations are last-writer-wins; do not claim merge semantics. Then add `packages/planmo/src/user-config.ts`. Verify with `pnpm vitest run packages/planmo/src/user-config.test.ts`; commit: `feat(cli): persist non-secret AI profiles`.
7. **Add credential-store abstraction and keyring adapter** (2–5 min per slice). Test in `packages/planmo/src/credential-store.test.ts` using an injected fake backend: `get/set/remove/has`, environment-variable fallback, missing/locked-keyring behavior, and proof that values never appear in logs/errors. Implement `packages/planmo/src/credential-store.ts` and `packages/planmo/src/keyring-credential-store.ts`; add the selected optional dependency to `packages/planmo/package.json`. Store API keys or OAuth token bundles only in the OS keyring, keyed by PlanMo profile/provider; never place values in `config.json`, `.planmo/`, or project files. Verify with `pnpm vitest run packages/planmo/src/credential-store.test.ts`; commit: `feat(cli): add OS-backed credential store`.
8. **Add a masked secret prompt** (2–5 min). Add a `password` method to `WizardIO` in `packages/planmo/src/cli-io.ts`; first inspect the installed `@clack/prompts` declarations for the actual password API instead of guessing. Add `packages/planmo/src/cli-io.test.ts` with an injected prompt double; assert the entered secret is returned to the caller but absent from captured output. Verify with `pnpm vitest run packages/planmo/src/cli-io.test.ts`; commit: `feat(cli): prompt for credentials without echo`.
9. **Implement the `setup` wizard** (2–5 min). Test `packages/planmo/src/commands/setup.test.ts`: choosing a current provider, entering a model id, storing the key through the fake keyring, and printing only masked status; non-TTY without flags exits 1 with `Run planmo setup interactively or configure <PROVIDER_API_KEY>`. Add `packages/planmo/src/commands/setup.ts`. `planmo setup --provider <id> --model <id>` is non-interactive only when its environment/keyring credential already exists; never accept `--api-key <secret>` (argv/history/process-list leak). Verify with `pnpm vitest run packages/planmo/src/commands/setup.test.ts`; commit: `feat(cli): add AI setup wizard`.
10. **Wire setup into the CLI and expose the actual provider inventory** (2–5 min). Update `packages/planmo/src/index.ts`, `packages/planmo/src/usage.ts`, and `packages/planmo/src/index.test.ts`; add known flags and per-command help for `setup`. Add `packages/planmo/src/commands/provider.ts` and `packages/planmo/src/commands/provider.test.ts` for `planmo provider list`, using `PROVIDER_PRESETS`/`describeProviders` as the single source of truth. It must list exactly the 8 current runtime presets, label `custom` as an endpoint profile, and never mix in `AGENT_TARGETS` or catalog-only candidates. Test `setup --help` never reads/writes config and unknown flags exit 1. Verify with `pnpm vitest run packages/planmo/src/commands/provider.test.ts packages/planmo/src/index.test.ts`; expected: 8 preset ids are listed, no agent ids appear, and the router tests pass. Commit: `feat(cli): expose setup and provider inventory`.
11. **Add credential status/removal** (2–5 min). Add `packages/planmo/src/commands/auth.ts` and `auth.test.ts` for `planmo auth status` and `planmo auth remove <profile-id>`. Status may print the non-secret profile UUID, provider, model, default marker, and whether a credential is available; it must never print a key/token or opaque `credentialRef`, and it should use `has()` rather than retrieving a credential. Removal requires confirmation interactively; the confirmation must state whether a saved keyring credential will be removed and that environment variables are not changed. Non-TTY requires an explicit `--yes`. Write the config without the selected profile before best-effort keyring removal; if the removed profile was default, clear `defaultProfileId` rather than silently selecting another model. Never modify environment variables; warn generically if keyring cleanup fails. Register the `auth` subcommands and options in `index.ts`/`usage.ts`. Verify with `pnpm vitest run packages/planmo/src/commands/auth.test.ts packages/planmo/src/index.test.ts`; commit: `feat(cli): add AI auth status and removal`.
12. **Add provider-aware model selection** (2–5 min). Add `packages/ai/src/models.ts` and `packages/ai/src/models.test.ts`, then `packages/planmo/src/commands/model.ts` and `model.test.ts`. Query only a model-list endpoint declared by a provider preset; validate response shape/size and treat names as untrusted metadata. If unsupported/unavailable, prompt for a model id manually. Add `planmo model` to the router and help. Verify with `pnpm vitest run packages/ai/src/models.test.ts packages/planmo/src/commands/model.test.ts`; commit: `feat(cli): list and select provider models`.
13. **Use saved defaults in `planmo plan`** (2–5 min). Add `packages/planmo/src/commands/plan.test.ts` cases for precedence: explicit `--provider/--model/--base-url` > saved default profile; environment credential overrides keyring credential for that selected provider; if no profile exists, preserve today’s env auto-detection. Validate every explicit `--base-url` through the shared `AiEndpointUrlSchema` before resolving credentials or creating a provider; reject non-loopback HTTP, URL userinfo/query/fragment, and raw backslashes. Modify `packages/planmo/src/commands/plan.ts` to resolve the chosen credential and still pass it only to `createHttpProvider`. Verify with `pnpm vitest run packages/planmo/src/commands/plan.test.ts`; commit: `feat(cli): use the saved AI profile for plan`.

### Phase 2 — read-only `planmo suggest`

14. **Create a suggestion-specific secret policy** (2–5 min). Test `packages/scanner/src/security/suggest-policy.test.ts` for path exclusions (`.env*` except examples, `auth.json`, `.npmrc`, private keys/certificates, credential directories) and content redaction on synthetic API keys in otherwise valid source. Add `packages/scanner/src/security/suggest-policy.ts`. `.env` presence may be reported by path only; never read its value into the model prompt. Preserve line counts when replacing secret values so evidence ranges remain correct. Verify with `pnpm vitest run packages/scanner/src/security/suggest-policy.test.ts`; commit: `feat(scanner): filter and redact suggestion context`.
15. **Build deterministic repository context batches** (2–5 min). Test `packages/scanner/src/context/suggestion-context.test.ts` with `ConstructorReader` fixtures for complete path inventory, default excludes, symlink escape, binary/oversize skip, stable ordering, per-file redaction, token-budget batching, and coverage counts. Add `packages/scanner/src/context/suggestion-context.ts` using `safeScanner`, `contextMapEngine`, `symbolIndex`, and `lexicalContext`; do not execute package scripts. Start with a 32,000 estimated input-token budget per run and 8,000 per request, both configurable, and report truncation instead of silently dropping files. Verify with `pnpm vitest run packages/scanner/src/context/suggestion-context.test.ts`; commit: `feat(scanner): batch safe repo context for AI review`.
16. **Add the versioned suggestion report contract** (2–5 min). Add `packages/schema/src/suggestion-report.test.ts` first: reject unknown fields, absolute/traversal paths, invalid line ranges, confidence outside `[0,1]`, and missing evidence; accept each `kind`/`category`. Implement `packages/schema/src/suggestion-report.ts` and export from `packages/schema/src/index.ts`. Verify with `pnpm vitest run packages/schema/src/suggestion-report.test.ts`; commit: `feat(schema): define evidence-backed suggestion reports`.
17. **Build and test the AI prompt** (2–5 min). Add `packages/planmo/src/suggest-build.test.ts` for allowed categories, `kind` distinctions, no recommendations without evidence, prompt-injection text labelled untrusted, and explicit “do not generate patches or commands”. Add `packages/planmo/src/suggest-build.ts`. Keep source content separate from PlanMo system policy and never let a scanned file change tool permissions or output paths. Verify with `pnpm vitest run packages/planmo/src/suggest-build.test.ts`; commit: `feat(ai): define bounded suggestion prompt`.
18. **Implement suggestion orchestration and evidence verification** (2–5 min). Add `packages/planmo/src/suggest.test.ts` with an injected mock provider and virtual repo: valid report passes; malformed JSON/schema fails closed; invalid file/line evidence is rejected with diagnostics; provider timeout/auth errors write nothing; scanner coverage is reported accurately. Implement `packages/planmo/src/suggest.ts` using `ModelProvider.generate` in text mode followed by the canonical Zod report schema (do not trust wire-level JSON schema as the final gate). Verify with `pnpm vitest run packages/planmo/src/suggest.test.ts`; commit: `feat(ai): validate and verify suggestion reports`.
19. **Expose `planmo suggest` with consent and safe output** (2–5 min). Test `packages/planmo/src/commands/suggest.test.ts`: `--dry-run` makes zero provider calls; interactive flow asks before upload; non-TTY without `--allow-upload` exits 1; report defaults to stdout; `--json` emits parseable JSON; `--output` refuses overwrite and uses the managed writer; no `.planmo/plan.yml` or application file is touched. Implement `packages/planmo/src/commands/suggest.ts`, then wire flags/help in `packages/planmo/src/index.ts` and `packages/planmo/src/usage.ts`. Verify with `pnpm vitest run packages/planmo/src/commands/suggest.test.ts packages/planmo/src/index.test.ts`; commit: `feat(cli): add consent-gated planmo suggest`.
20. **Render a human-readable report** (2–5 min). Add `packages/planmo/src/suggest-render.test.ts` for deterministic ordering, coverage/limitations display, relative path + line-range references, and no raw source or secret rendering. Add `packages/planmo/src/suggest-render.ts`. Verify with `pnpm vitest run packages/planmo/src/suggest-render.test.ts`; commit: `feat(cli): render codebase suggestion reports`.
21. **Add a credential-free end-to-end test** (2–5 min). Add `scripts/e2e-ai-setup-suggest.mjs` and `e2e:ai` to root `package.json`; use a temp repository, temp `PLANMO_CONFIG_DIR`, fake keyring, and mock provider. Verify setup -> model selection -> `suggest --dry-run` -> mock suggest -> JSON/report; assert no network calls, no source files changed, and fake secrets absent from stdout/files. Expected output lines: `PASS setup`, `PASS model`, `PASS suggest dry-run (0 provider calls)`, `PASS mock report validated`, `PASS project unchanged`. Run `pnpm e2e:ai`; exit 0.
22. **Update product/security docs and release metadata** (2–5 min). Update `docs/03-cli/command-surface.md`, `docs/03-cli/examples.md`, `docs/06-agent-engine/ai-boundary.md`, `docs/08-security/secrets-and-privacy.md`, `docs/08-security/threat-model.md`, `docs/16-evals-trust/eval-engine.md`, `ROADMAP.md`, and `CHANGELOG.md`. Add `.changeset/ai-setup-codebase-suggestions.md` with `minor` bumps for the published packages actually changed. Make the docs say `suggest` is advisory/read-only, provider upload is opt-in, `generate` remains model-free, and coverage may be partial. Verify with `pnpm exec prettier --check <each changed .md>` and `pnpm changeset status`; commit: `docs(cli): document setup and codebase suggestions`.

### Phase 3 — expand inference providers beyond the current eight (scope gate)

#### Provider-selection checklist (edit before implementation)

Checkbox meaning: `[x]` means keep this provider/profile/auth route on the review shortlist; uncheck it to exclude it from the proposed scope. Keeping a row checked is not a promise to implement it or a claim that PlanMo supports it. Every surviving candidate still needs provider-doc, protocol, auth-permission, model-discovery, pricing/retention, and test verification before it can be advertised as supported.

##### Existing PlanMo presets not represented by the catalog (prechecked)

- [x] `tokenharbor` — Token Harbor (existing PlanMo preset; no exact Models.dev provider id observed)
- [x] `custom` — user-specified OpenAI-compatible endpoint (existing PlanMo preset; not a catalog provider)

##### OpenCode / Models.dev provider catalog (228 live records)

Names below are provider-catalog candidates from `https://models.dev/api.json`; the API returned 228 records during this research. All are checked only for user review; this is not a claim of 228 verified PlanMo adapters or OAuth logins. The six matching catalog entries are existing PlanMo presets; uncheck any entries or regional/plan variants you do not want evaluated.

- [x] `302ai` — 302.AI
- [x] `abacus` — Abacus
- [x] `abliteration-ai` — abliteration.ai
- [x] `above` — above.dev
- [x] `agentrouter` — AgentRouter
- [x] `agnes` — Agnes AI
- [x] `aiand` — ai&
- [x] `ai-router` — AI-ROUTER
- [x] `aimlapi` — AI/ML API
- [x] `ai21` — AI21 Labs
- [x] `aihubmix` — AIHubMix
- [x] `ainetcafe` — ainetcafe
- [x] `aixy` — Aixy
- [x] `aki-io` — AKI.IO
- [x] `alibaba` — Alibaba
- [x] `alibaba-cn` — Alibaba (China)
- [x] `alibaba-coding-plan` — Alibaba Coding Plan
- [x] `alibaba-coding-plan-cn` — Alibaba Coding Plan (China)
- [x] `alibaba-token-plan` — Alibaba Token Plan
- [x] `alibaba-token-plan-cn` — Alibaba Token Plan (China)
- [x] `amazon-bedrock` — Amazon Bedrock
- [x] `ambient` — Ambient
- [x] `amd` — AMD
- [x] `anthropic` — Anthropic — existing PlanMo preset
- [x] `anyapi` — AnyAPI
- [x] `arcee` — Arcee
- [x] `atomic-chat` — Atomic Chat
- [x] `auriko` — Auriko
- [x] `azure` — Azure
- [x] `azure-cognitive-services` — Azure Cognitive Services
- [x] `bailing` — Bailing
- [x] `baseten` — Baseten
- [x] `bee` — Bee by HEOSSI
- [x] `berget` — Berget.AI
- [x] `blueclaw` — Blue Claw
- [x] `bothub` — Bothub
- [x] `cerebras` — Cerebras
- [x] `hyper` — Charm Hyper
- [x] `chutes` — Chutes
- [x] `clarifai` — Clarifai
- [x] `claudinio` — Claudinio
- [x] `cline-pass` — ClinePass
- [x] `cloudferro-sherlock` — CloudFerro Sherlock
- [x] `cloudflare-ai-gateway` — Cloudflare AI Gateway
- [x] `cloudflare-workers-ai` — Cloudflare Workers AI
- [x] `cohere` — Cohere
- [x] `coralbricks` — CoralBricks
- [x] `wandb` — CoreWeave
- [x] `cortecs` — Cortecs
- [x] `crof` — CrofAI
- [x] `crossmodel` — CrossModel
- [x] `crusoe` — Crusoe
- [x] `drun` — D.Run (China)
- [x] `daoxe` — DaoXE
- [x] `databricks` — Databricks
- [x] `deepinfra` — Deep Infra
- [x] `deepseek` — DeepSeek — existing PlanMo preset
- [x] `llmgateway` — DevPass (LLM Gateway)
- [x] `digitalocean` — DigitalOcean
- [x] `dinference` — DInference
- [x] `ebcloud` — EBCloud
- [x] `echo` — Echo
- [x] `edenai` — Eden AI
- [x] `empiriolabs` — EmpirioLabs AI
- [x] `engy` — engy
- [x] `evroc` — evroc
- [x] `fastrouter` — FastRouter
- [x] `fireworks-ai` — Fireworks AI
- [x] `freemodel` — FreeModel
- [x] `friendli` — Friendli
- [x] `frogbot` — FrogBot
- [x] `github-copilot` — GitHub Copilot
- [x] `gitlab` — GitLab Duo
- [x] `gmicloud` — GMI Cloud
- [x] `google` — Google
- [x] `greenpt` — GreenPT
- [x] `groq` — Groq
- [x] `helicone` — Helicone
- [x] `hetzner` — Hetzner
- [x] `hpc-ai` — HPC-AI
- [x] `huggingface` — Hugging Face
- [x] `iflowcn` — iFlow
- [x] `impossibl` — Impossibl
- [x] `inception` — Inception
- [x] `inceptron` — Inceptron
- [x] `inco` — Inco
- [x] `infer` — Infer by Flow7
- [x] `inference` — Inference
- [x] `inferx` — InferX
- [x] `infomaniak` — Infomaniak
- [x] `io-net` — IO.NET
- [x] `iteracompute` — IteraCompute
- [x] `jalapeno` — Jalapeno Cloud
- [x] `jiekou` — Jiekou.AI
- [x] `kenari` — Kenari
- [x] `kilo` — Kilo Gateway
- [x] `kimi-code-plan-global` — Kimi For Coding (kimi.ai)
- [x] `kimi-code-plan-cn` — Kimi For Coding (kimi.com)
- [x] `klokintegration` — klokintegration.se
- [x] `kosmik` — Kosmik Compute
- [x] `kuae-cloud-coding-plan` — KUAE Cloud Coding Plan
- [x] `lilac` — Lilac
- [x] `llama` — Llama
- [x] `llmgateway-providers` — LLM Gateway
- [x] `llmtech` — LLM Tech
- [x] `llmtr` — LLMTR
- [x] `lmstudio` — LMStudio
- [x] `longcat` — LongCat
- [x] `lowrouter` — LowRouter
- [x] `lucidquery` — LucidQuery
- [x] `lynkr` — Lynkr
- [x] `meganova` — Meganova
- [x] `melious` — Melious
- [x] `merge-gateway` — Merge Gateway
- [x] `meta` — Meta
- [x] `minimax-cn` — MiniMax (minimax.cn)
- [x] `minimax` — MiniMax (minimax.io)
- [x] `minimax-cn-coding-plan` — MiniMax Token Plan (minimax.cn)
- [x] `minimax-coding-plan` — MiniMax Token Plan (minimax.io)
- [x] `mistral` — Mistral
- [x] `mixlayer` — Mixlayer
- [x] `moark` — Moark
- [x] `modal` — Modal
- [x] `model-oracle-ai` — Model Oracle AI
- [x] `modelis` — Modelis
- [x] `modelscope` — ModelScope
- [x] `moonshotai` — Moonshot AI — matches current `moonshot` preset
- [x] `moonshotai-cn` — Moonshot AI (China)
- [x] `morph` — Morph
- [x] `nan` — NaN
- [x] `nano-gpt` — NanoGPT
- [x] `nearai` — NEAR AI Cloud
- [x] `nebius` — Nebius Token Factory
- [x] `neon` — Neon
- [x] `neosmith` — NeoSmith
- [x] `neuralwatt` — Neuralwatt
- [x] `nova` — Nova
- [x] `novita-ai` — Novita AI
- [x] `nvidia` — Nvidia
- [x] `oci` — OCI Generative AI
- [x] `ofox` — Ofox
- [x] `ollama-cloud` — Ollama Cloud
- [x] `openai` — OpenAI — existing PlanMo preset
- [x] `opencode` — OpenCode
- [x] `opencode-go` — OpenCode Go
- [x] `openreason` — OpenReason
- [x] `openrouter` — OpenRouter — existing PlanMo preset
- [x] `opper` — Opper
- [x] `orcarouter` — OrcaRouter
- [x] `ovhcloud` — OVHcloud AI Endpoints
- [x] `pareto` — Pareto Inference
- [x] `pendra` — Pendra
- [x] `perplexity` — Perplexity
- [x] `perplexity-agent` — Perplexity Agent
- [x] `pioneer` — Pioneer
- [x] `poe` — Poe
- [x] `poolside` — Poolside
- [x] `prime` — Prime Inference
- [x] `privatemode-ai` — Privatemode AI
- [x] `qihang-ai` — QiHang
- [x] `qiniu-ai` — Qiniu
- [x] `qvac` — QVAC
- [x] `regolo-ai` — Regolo AI
- [x] `requesty` — Requesty
- [x] `routing-run` — routing.run
- [x] `runinfra` — RunInfra
- [x] `sakana` — Sakana AI
- [x] `salad-cloud` — SaladCloud AI Gateway
- [x] `sap-ai-core` — SAP AI Core
- [x] `sarvam` — Sarvam AI
- [x] `scaleway` — Scaleway
- [x] `scnet-token-plan` — SCNet Token Plan
- [x] `scx-ai` — SCX.ai
- [x] `sensenova` — SenseNova (China)
- [x] `siliconflow` — SiliconFlow
- [x] `siliconflow-cn` — SiliconFlow (China)
- [x] `snowflake-cortex` — Snowflake Cortex
- [x] `stackit` — STACKIT
- [x] `standardcompute` — Standard Compute
- [x] `stepfun` — StepFun (China)
- [x] `stepfun-ai` — StepFun (Global)
- [x] `stepfun-step-plan` — StepFun Step Plan (China)
- [x] `stepfun-ai-step-plan` — StepFun Step Plan (Global)
- [x] `subconscious` — Subconscious
- [x] `submodel` — submodel
- [x] `synthetic` — Synthetic
- [x] `tempr` — Tempr Gateway
- [x] `tencent-coding-plan` — Tencent Coding Plan (China)
- [x] `tencent-token-plan` — Tencent Token Plan
- [x] `tencent-tokenhub` — Tencent TokenHub
- [x] `tensorx` — TensorX
- [x] `the-grid-ai` — The Grid AI
- [x] `thinkingmachines` — Thinking Machines
- [x] `tinfoil` — Tinfoil
- [x] `togetherai` — Together AI
- [x] `tokengo` — TokenGo
- [x] `tokenrouter` — TokenRouter
- [x] `trustedrouter` — TrustedRouter
- [x] `umans-ai` — Umans AI
- [x] `umans-ai-coding-plan` — Umans AI Coding Plan
- [x] `unorouter` — UnoRouter
- [x] `upstage` — Upstage
- [x] `vancine` — Vancine
- [x] `venice` — Venice AI
- [x] `vercel` — Vercel AI Gateway
- [x] `google-vertex` — Vertex
- [x] `google-vertex-anthropic` — Vertex (Anthropic)
- [x] `vispark` — Vispark
- [x] `vivgrid` — Vivgrid
- [x] `volcengine` — Volcengine Ark
- [x] `volcengine-coding-plan` — Volcengine Ark Coding Plan
- [x] `vultr` — Vultr
- [x] `wafer.ai` — Wafer
- [x] `wallaby` — Wallaby
- [x] `watsonx` — watsonx.ai
- [x] `xai` — xAI — existing PlanMo preset
- [x] `xiaomi` — Xiaomi
- [x] `xiaomi-token-plan-cn` — Xiaomi Token Plan (China)
- [x] `xiaomi-token-plan-ams` — Xiaomi Token Plan (Europe)
- [x] `xiaomi-token-plan-sgp` — Xiaomi Token Plan (Singapore)
- [x] `xpersona` — Xpersona
- [x] `zai` — Z.AI
- [x] `zai-coding-plan` — Z.AI Coding Plan
- [x] `zeldoc` — Zeldoc
- [x] `zenifra` — Zenifra
- [x] `zenmux` — ZenMux
- [x] `zhipuai` — Zhipu AI
- [x] `zhipuai-coding-plan` — Zhipu AI Coding Plan

##### Additional Hermes model-picker choices/variants (checked for user review)

These were displayed by the Hermes picker; some overlap the catalog above. They are checked for review only, not implementation. Uncheck any that should be excluded. Their appearance in Hermes does not authorize PlanMo to reuse its login flow.

- [x] Nous Portal account (Hermes describes 300+ bundled models)
- [x] Mixture of Agents named presets/aggregator
- [x] Actual Computer hosted inference / local offline endpoint
- [x] CommandCode — OpenAI-compatible profile
- [x] CommandCode — Anthropic Messages profile
- [x] Ramp Router
- [x] Local model servers (LM Studio, Ollama, or user endpoint)
- [x] Custom direct API / custom endpoint profile

##### Account-plan and alternative-auth routes to evaluate separately

Each row is an observed Hermes picker description, checked for review only. It is not verified authorization for third-party OAuth. Uncheck routes you do not want considered; keep provider adapter and auth method separate, and implement only flows documented and permitted by the provider.

- [x] OpenAI ChatGPT/Codex subscription login (separate from direct API key)
- [x] Qwen Cloud/DashScope Coding Plan and Token Plan; Qwen CLI OAuth route
- [x] xAI SuperGrok/Premium+ OAuth route (separate from direct API key)
- [x] Tencent TokenHub / TokenPlan
- [x] GitHub Copilot token API / ACP process integration
- [x] Kimi Coding Plan; Moonshot global and China endpoints
- [x] MiniMax global / OAuth Coding Plan / China endpoints
- [x] OpenCode Zen pay-as-you-go / OpenCode Go subscription
- [x] AWS Bedrock IAM credentials (separate from API-key mode)
- [x] Anthropic Claude Code account integration (separate from API key)
- [x] Google Vertex AI ADC/service-account OAuth route (separate from AI Studio key)

23. **Turn the checklist into an approved provider scope** (2–5 min). Before implementation, ask the user to edit/uncheck the Phase 3 checklist. Create `docs/06-agent-engine/provider-catalog.md` from only selected rows, preserving the source provider ID and recording official API docs, protocol, auth methods (API key/OAuth/account plan/IAM/local), model-list support, endpoint/region, retention/pricing links, and status (`runtime-supported`, `catalog-only`, or `not-supported`). A provider catalog entry is never proof that PlanMo can call it or that third-party OAuth is permitted. Verify existing counts with `pnpm vitest run packages/ai/src/providers.test.ts packages/agent-bridge/src/agent-targets.test.ts`; expected: both suites pass and the documentation distinguishes provider IDs, agent integrations, model IDs, and auth plans.
24. **Implement compatible providers in small verified batches** (2–5 min per provider/batch). Extend `packages/ai/src/providers.ts` only for providers whose official API is compatible with the declared wire format; add one fixture/test per provider in `packages/ai/src/providers.test.ts` for id, endpoint, credential-env name, protocol, and model-list capability. A different API protocol requires a typed adapter and its own HTTP/error tests in `packages/ai/src/` before the registry may mark it `runtime-supported`. Verify each batch with `pnpm vitest run packages/ai/src/providers.test.ts packages/ai/src/http.test.ts`; expected: all supported-provider contract tests pass, and catalog-only rows are never selectable for inference.
25. **Keep discovery metadata distinct from runtime support** (2–5 min). Use a pinned/trust-reviewed Models.dev snapshot only if the user approves that dependency; do not download executable provider config or send repository data to that catalog. Update `packages/planmo/src/commands/provider.ts` so `planmo provider list` labels each row by status and reports the count of runtime-supported presets separately from candidate/agent counts. Test that the default setup picker includes runtime-supported rows only; commit: `feat(ai): expand verified provider catalog`.

### Phase 4 — provider-specific OAuth (separate release gate)

26. **Do not build generic OAuth.** After selecting a provider whose official docs authorize third-party CLI login, add one adapter under `packages/ai/src/auth/` and wire its commands in `packages/planmo/src/commands/auth.ts`. Use the provider’s documented external-browser/PKCE or device flow, state validation, least scopes, token refresh/revoke, and the OS keyring. Test with a local fake OAuth server; verify bad state, cancellation, expired/refresh failure, logout, and secret redaction. No other CLI’s auth files may be read. If no provider offers an allowed public flow, leave OAuth out and ship the API-key path.

## Tests / validation

- For every code task above, follow RED -> GREEN -> commit exactly as specified. A RED result must be the named assertion failing; a TypeScript/import error is not a valid red test.
- Unit tests use only `createMockProvider`, injected fetch, virtual readers, temp config directories, and fake keyring backends. No live key, real OAuth account, or network request belongs in normal CI.
- Security acceptance tests: `.env` values and common token patterns are absent from fake-provider input; secrets are absent from config, reports, stderr/stdout and errors; scanned prompt-injection text cannot change policy; invalid model evidence fails closed; no scanned project file changes after a normal suggest run.
- Run `pnpm vitest run <changed test paths>` after each slice. At the end run `pnpm check`, `pnpm e2e:ai`, and `pnpm e2e:install`; expected: each exit 0, all test files pass, mock E2E prints the five PASS lines above, and the npm-pack smoke still succeeds.
- Manual release matrix: Windows 11, macOS, Linux desktop with Secret Service, and headless Linux. Verify keyring persistence across process restart, explicit failure when the secure store is unavailable, and environment-variable fallback. Run an optional live provider smoke only after a user explicitly enables it and approves possible cost/data transfer.
- The current GitHub Actions quota is exhausted. During implementation, run the local gates and do not trigger GitHub Actions or publish until the user explicitly authorizes it.

## Risks, tradeoffs, and open questions

- **OAuth provider:** which provider should be first? Recommendation: ship API keys + custom/local endpoint first; implement OAuth only for a provider with an explicitly supported third-party CLI flow. Do not reuse another app’s token or assume a subscription login permits arbitrary API calls.
- **Keyring package:** native bindings can fail on Node/platform combinations or headless Linux. The compatibility spike is a blocker before committing the dependency. No plaintext fallback; environment variables remain the safe fallback.
- **Model listing:** `@planmo/ai` has no model catalog today. Token Harbor and OpenRouter can expose many underlying model IDs, while `custom` is one generic OpenAI-compatible route; these do not increase the number of native preset adapters. Recommendation: first support provider-declared model-list endpoints and manual model IDs, then decide whether a trusted catalog is warranted.
- **Catalog breadth vs implementation cost:** current PlanMo supports 8 runtime presets; Hermes showed 39 provider/profile entries; the live Models.dev catalog returned 228 provider records. The editable checklist separates these sources. Confirm which candidate boxes to keep before implementation; do not treat catalog rows, agents, model IDs, or subscription plans as equivalent provider adapters.
- **Privacy/cost:** suggestions send selected code to an external provider. Show provider/model, files and omissions, estimated tokens, and price only when verified metadata exists; require consent per run. Provider retention policies vary and must be linked, never promised by PlanMo.
- **“All files” claim:** scanner caps, secret exclusions, binaries, and budgets can prevent full content coverage. Report complete path inventory separately from content submitted; never label partial review complete.
- **Quality:** models can hallucinate or overstate feature gaps. Require evidence path/ranges, confidence, impact/effort, strict schema validation, and call results “suggestions”, not verified defects.
- **Existing decision drift:** current docs still describe direct provider calls as “optional later”, and the previous plan proposed env-only credentials. ADR-0029 plus the docs task must explicitly revise those statements without weakening “no secrets in repo/plan/logs” or “never read other tools’ credential stores”.
- **Persistence format:** keep profiles user-global initially; do not add project-scoped API keys or secret values. Decide later whether teams need a committed non-secret model preference file.
- **Concurrent settings writes:** config writes are atomic individually, but there is no cross-process read-modify-write lock; simultaneous settings changes are last-writer-wins. Do not promise merge behavior; defer locking until concurrent settings writers become a product requirement.
- **Duplicate profile tuples:** the schema allows distinct profile IDs to share provider/model/endpoint values. Setup matches the first exact tuple in config order; the current setup flow does not distinguish multiple accounts for that same tuple. Profile naming or explicit account selection is deferred.
- **Output persistence:** stdout is safest by default; `--output` is explicit and refuses overwrite. Do not auto-create `.planmo/` or overwrite `plan.yml` just to save a suggestion report.
