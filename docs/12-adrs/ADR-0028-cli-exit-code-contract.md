# ADR-0028 — The CLI exit-code contract is 0/1/2/3, and a broken workspace is an error

Status: Accepted
Date: 2026-10-12

## Context

`planmo --help` and the README document four exit codes: `0` ok, `1` error,
`2` collision refused, `3` no project found. Most handlers honoured that mapping —
`err instanceof ProjectNotFoundError ? 3 : 1` — but four did not:
`generate`, `diff`, `validate` and `doctor` returned a bare `3` on **any** error.

The effect was that a workspace that exists but cannot be read (a corrupt
`.planmo/project.yml`, an unreadable manifest) exited `3`, the same code as "there
is no `.planmo/` here at all". A script or CI job could not tell "you are in the
wrong directory" from "this workspace is broken", which are opposite problems with
opposite fixes. `docs/03-cli/exit-codes.md` made it worse by documenting a proposed
0–9 band that nothing implements.

## Decision

**The shipped exit contract is `0` ok · `1` error · `2` collision refused · `3` no
project found. Every handler maps `ProjectNotFoundError` (and its
`WorkspaceNotFoundError` subclass) to `3` and any other failure to `1`.**

- A missing workspace — no `.planmo/` at or above the target directory — is `3`.
- A workspace that exists but is broken (schema-invalid config, unreadable
  manifest, a runtime failure) is `1`.
- The proposed 0–9 band stays reserved and unimplemented; `docs/03-cli/exit-codes.md`
  records it as such so the numbers are not reused by accident.

## Consequences

**Good.**

- The two failures are distinguishable, which is the whole point of an exit code.
- The mapping is uniform: one expression, applied in every handler, with no
  per-command special cases to remember.
- The documented contract, the help text and the code now agree.

**Costs and constraints.**

- This is a behaviour change for the four handlers: a broken workspace now exits
  `1` where it previously exited `3`. It is a *correction* toward the already
  documented contract rather than a new contract, so no migration is required; a
  consumer that treated `3` as "any failure" should test for non-zero instead.
- `3` remains the catch-all for "cannot read the workspace it was given" in the
  sense of a missing root, so a caller still should not read `3` as a proof that no
  `.planmo/` exists anywhere.

## Alternatives considered

- **Keep `3` as a catch-all for these four commands.** Rejected: it is exactly the
  ambiguity this ADR removes, and it contradicts the documented contract the other
  ten handlers already follow.
- **Adopt the proposed 0–9 band now.** Rejected: it is a breaking change to a
  published CLI, it is not implemented, and no caller needs the extra resolution
  yet. Introducing it later is additive.
- **Return `2` for a broken workspace.** Rejected: `2` means "a collision was
  refused", and reusing it would create the same ambiguity in the other direction.

## Related

- ADR-0011 — strict, versioned schemas
- `docs/03-cli/exit-codes.md`
- `docs/10-engineering/agent-audit.md` (F-05)
