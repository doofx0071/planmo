# ADR-0029 — User-level AI setup and consent-gated suggestions

Status: Accepted
Date: 2026-10-13

## Context

PlanMo's direct AI path currently resolves API keys from environment variables. Users asked for a first-run setup flow, model selection, account/plan authentication options, and whole-codebase recommendations. Persisting provider secrets in a plaintext user `auth.json` would expose credentials to any process that can read the profile, while putting them in a project `.planmo/` directory would also risk committing them. Sending a repository to a model is a separate privacy decision from configuring a provider.

PlanMo is CLI-first, deterministic outside explicit AI commands, and treats existing repositories as untrusted input. `generate` must not gain a model call, and scanned repository text must never gain authority over PlanMo policy.

## Decision

1. Add `planmo setup` for provider, credential method, and model configuration; `planmo provider list` for the actual supported runtime presets; `planmo auth status|remove` for credential lifecycle; `planmo model` for later model changes; and `planmo suggest` for advisory repository recommendations.
2. Store only non-secret preferences and opaque credential references in a versioned, strict user-level PlanMo config file. Its profile shape is `schemaVersion: 1`, a list of `{ id, providerId, modelId, baseUrl, credentialRef }`, and `defaultProfileId`; it has no open-ended extension map or `apiKey` field. Validate custom endpoints as HTTPS or loopback HTTP and reject URL userinfo, query, and fragment. Use `%LOCALAPPDATA%/PlanMo` on Windows, `~/Library/Application Support/PlanMo` on macOS, and `${XDG_CONFIG_HOME:-~/.config}/planmo` on Linux; permit `PLANMO_CONFIG_DIR` for portable installs and tests. Project `.planmo/` state never contains user AI credentials.
3. Store API keys only through an OS credential manager using optional `@napi-rs/keyring@2.1.1`. On Linux explicitly require the Secret Service backend; do not accept its default fallback to the in-memory kernel keyutils store. If the native binding or secure backend is unavailable, use a provider environment variable or fail with a clear message—never fall back to plaintext. The Windows and macOS backend mappings are documented by the package but still require platform-matrix verification.
4. Never read or import another CLI's credential files, browser session, OAuth token, or account state. The first release supports API keys and custom OpenAI-compatible endpoints only. Add OAuth/account-plan login only for a specifically selected provider whose official terms and docs authorize a third-party CLI flow; do not implement generic OAuth.
5. The first-release provider picker exposes PlanMo's eight tested presets and custom endpoint only. Model discovery calls only a model-list endpoint explicitly documented in the provider capability table and validates the response; otherwise the user enters a model id. Models.dev/OpenCode's 228-record catalog is a review source, not a runtime registry or support claim. Provider expansion is gated on the user's edited selection checklist and adapter tests.
6. `planmo suggest` is read-only and advisory. It uses PlanMo's safe scanner, excludes secret-bearing paths, redacts detected secrets, bounds context, labels repository text as untrusted, validates a strict report schema, and verifies every evidence path/line against the scanned files. A dry run makes no provider call. An interactive run displays coverage and asks before the first upload; non-TTY runs require explicit `--allow-upload`. It never executes model suggestions or rewrites application files. Report output goes to stdout unless the user opts into a new output file.
7. `planmo plan` may use the saved default profile after explicit CLI overrides; `planmo generate` remains deterministic and model-free. AI-authored data must pass the canonical schema before it can become a persisted PlanMo artifact.

## Consequences

- Provider settings can be shared across projects without putting secrets in a repository; environment variables continue to support CI/headless use.
- Secure-store availability differs by operating system. Linux Secret Service is mandatory for persisted keyring credentials; lack of a desktop/session keyring is reported, not hidden by an ephemeral or plaintext fallback.
- Provider catalog entries, model ids, agent integrations, and auth-plan routes remain separate concepts. A listed candidate is not advertised as usable until its transport/auth path is implemented and tested.
- Source upload is visible and per-run. Coverage and limitations must be reported honestly when scanner caps or token budgets omit files.
- Generic OAuth, importing existing OpenCode/Hermes credentials, automatic code fixes, and a live 228-provider registry are out of scope.

## Alternatives considered

- **Plaintext `auth.json` in the user directory.** Rejected: user-level scope does not make a plaintext secret store safe.
- **Only environment variables.** Rejected for the interactive setup experience; retained as the secure headless fallback.
- **Use another CLI's OAuth state.** Rejected: private file formats are not a supported credential API, and token reuse may violate provider terms.
- **Expose every Models.dev entry as supported.** Rejected: provider metadata does not prove protocol, auth, model discovery, or runtime compatibility.
- **Call a model during `generate`.** Rejected: it would break deterministic generation and ADR-0027.

## Related

- ADR-0011 — strict, versioned schemas
- ADR-0019 — deterministic planning compiler and generation manifest
- ADR-0026 — agent proposals are validated and recorded, never auto-applied
- ADR-0027 — AI authors the plan once; the compiler stays deterministic
- `docs/06-agent-engine/ai-boundary.md`
- `docs/08-security/secrets-and-privacy.md`
- `https://www.npmjs.com/package/@napi-rs/keyring`
