# Threat Model

## Assets
- user repo contents;
- generated instructions/prompts;
- PlanMo state/manifest;
- project requirements/decisions;
- secrets accidentally in repos;
- remote pack metadata/content;
- agent integration configuration.

## Trust boundaries
1. user input -> CLI
2. existing repo -> scanner
3. AI model -> structured proposal
4. remote pack/catalog -> resolver
5. generator -> filesystem
6. adapter -> coding agent

## Priority threats

### T-001 Path traversal
Malicious output escapes root.
Control: canonical validation + rejection + tests.

### T-002 Symlink escape
Repo symlink redirects writes outside root.
Control: explicit symlink policy, lstat/canonical checks.

### T-003 Existing-repo prompt injection
Repo prose attempts to alter AI behavior or exfiltrate secrets.
Control: scanned content is data; deterministic parsing preferred; no automatic command execution.

### T-004 Pack arbitrary execution
Control: declarative v1 packs, no hooks.

### T-005 AI config injection
Control: strict structured schemas; generator controls writes.

### T-006 Silent overwrite
Control: manifest ownership, diff/dry-run, conflict state.

### T-007 Remote supply-chain mutation
Control: version/ref pinning, integrity/provenance, explicit update.

### T-008 Shell injection
Control: argv process APIs, avoid shell interpolation.

### T-009 Secret leakage
Control: redaction/minimum context/no raw-content telemetry by default.

### T-010 State corruption
Control: schema validation, consistency checks, recovery/doctor.

### T-011 Cross-project cache contamination
Control: project-scoped cache; no global sensitive-content cache.

### T-012 Malicious UI registry
Control: trust metadata, review warnings, explicit high-assurance approval.
