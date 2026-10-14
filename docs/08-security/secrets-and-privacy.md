# Secrets and Privacy

Repositories may accidentally contain secrets.

Rules:
- do not intentionally ingest `.env` values by default;
- scanner may identify presence/names without reading values;
- no raw repo content in telemetry by default;
- redact common credential patterns from diagnostics;
- use synthetic fixtures;
- AI adapters minimize context sent externally;
- API keys and OAuth tokens are stored only in the OS keyring, keyed by PlanMo
  profile; a provider-named environment variable is the CI/headless fallback and
  takes precedence when nonblank;
- the user-level AI `config.json` stores only non-secret preferences and opaque
  credential references, never a secret value, and secrets are never written to
  `.planmo/`, a plan, a log, or a suggestion report;
- when no secure keyring backend is available, fail with instructions to set the
  provider environment variable; never fall back to plaintext storage;
- `planmo suggest` gates every path through `isSuggestionExcludedPath` before any
  content read, so `.env` and its variants (except `.example`/`.sample`/`.template`),
  `.npmrc`, credential directories, and private keys/certificates are never read;
- redaction of detected secret patterns is deterministic defense-in-depth and
  cannot guarantee it finds every secret, so coverage and truncation are reported
  rather than claimed complete;
- repository content leaves the machine only after per-run consent (an interactive
  prompt, or explicit `--allow-upload` for non-TTY), and only redacted context is sent;
- direct-provider privacy implications are documented here and in ADR-0029.
