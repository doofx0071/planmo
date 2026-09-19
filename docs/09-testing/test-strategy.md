# Test Strategy

## Unit
Schemas, merge logic, graphs, paths, tokens, diagnostics.

## Integration
CLI+filesystem, resolver+compiler, compiler+generator, state+workflow, agent adapters.

## Golden fixtures
Complete expected generated repos.

## E2E
Invoke built CLI as users do.

## Security/negative
Malicious paths/symlinks/state/prompt-injection/conflicting packs.

## Property/fuzz
High-risk parsers, path handling, resolution invariants.

## Cross-platform
Windows, macOS, Linux.

Required CI categories:
- lint/format;
- typecheck;
- unit/integration;
- golden;
- CLI E2E;
- dependency/security.
