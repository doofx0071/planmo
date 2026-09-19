# Security Policy and Engineering Baseline

PlanMo reads developer repositories and writes files that influence AI coding agents. Treat repository content, AI output, remote packs, registries, paths, and Git text as untrusted.

## V1 non-negotiables
- no automatic execution of repository scripts during scan;
- no arbitrary executable hooks in third-party packs;
- normalize and validate every output path;
- reject root escape and unsafe symlink behavior;
- dry-run/diff for generation affecting existing files;
- ownership manifest for PlanMo-managed files;
- structured AI output validated against schemas;
- secrets excluded from generated prompts/logs/fixtures/telemetry;
- remote source/ref/integrity metadata recorded.

See `docs/08-security/threat-model.md`.
