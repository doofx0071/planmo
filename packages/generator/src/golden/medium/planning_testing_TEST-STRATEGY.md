# Test Strategy — fixture-app

## Gate

The gate that must pass before a phase is done:

- unit tests
- typecheck
- lint
- format:check

## Levels

| Level | Covers | Runs on |
|---|---|---|
| Unit | Pure logic, domain invariants, edge cases | Every commit |
| Integration | Module boundaries, persistence, I/O seams | Every commit |
| End-to-end | The real entry point, as a user drives it | Before merge |
| Negative / security | Malformed input, traversal, overwrite refusal | Before merge |
| Golden / fixture | Byte-stable output for known inputs | Every commit |
| Cross-platform | Path and filesystem behaviour on each supported OS | CI matrix |

## Rules

- A bug is fixed by a test that fails first.
- Tests assert behaviour, not implementation detail.
- Generated output is asserted byte-for-byte, not by shape.
- A test that cannot fail is deleted.

## Tooling

- Test runner: vitest
- CI: _not declared_

## Evidence

Every phase handoff records the exact command run and its result. A phase
with no recorded evidence is not complete.
