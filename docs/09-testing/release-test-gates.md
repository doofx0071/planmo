# Release Test Gates

## Per-PR minimum
- targeted unit/integration tests;
- lint + format-check + typecheck;
- relevant negative-path tests;
- deterministic snapshot/golden updates reviewed explicitly.

## CLI/filesystem changes
Must additionally test:
- Windows + Linux path semantics;
- path traversal rejection;
- symlink/junction handling;
- collisions/ownership;
- dry-run parity with actual write;
- interruption/retry safety where relevant.

## Schema/persisted-format changes
Must additionally test:
- old fixture -> migration -> new schema;
- invalid/unknown versions;
- round-trip serialization;
- downgrade/rollback policy documented.

## Pack/resolution changes
Must additionally test:
- dependency cycles;
- conflicts;
- incompatible versions;
- deterministic ordering;
- tampered checksum/provenance cases.

## Scanner/adoption changes
Must additionally test malicious repositories containing:
- prompt-injection text;
- symlink escape attempts;
- huge/noisy trees;
- malformed package/config files;
- misleading stack indicators;
- binary/generated/vendor directories.

## Before release candidate
- full unit/integration suite;
- golden repositories;
- property/fuzz tests on parsers/resolvers/path normalization;
- supported OS matrix;
- supported Node LTS matrix;
- clean-install E2E;
- upgrade/migration E2E;
- npm pack/install smoke test;
- security audit and dependency review.

## Before 1.0
All Phase 12 gates plus successful representative pilots.
