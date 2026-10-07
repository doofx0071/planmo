# Contributing to PlanMo

Use GitHub Flow:

1. branch from an updated `main`;
2. implement one coherent tracked change;
3. add/update tests;
4. update docs;
5. add a changeset if the change is user-visible (`pnpm changeset`);
6. open a PR and pass CI;
7. squash merge.

Conventional Commit examples:

- `feat(cli): add interactive init wizard`
- `fix(generator): reject paths outside project root`
- `sec(scanner): isolate repository prompt instructions`
- `test(packs): cover deterministic resolution order`

A task is done only after the applicable acceptance criteria, tests, docs and
security review are complete.

## Toolchain

- Node.js **>= 24** (CI runs 24.x on ubuntu, macOS and Windows).
- pnpm **10.33.0** (pinned via `packageManager`).
- Full gate: `pnpm check` — build → typecheck → test → lint → format:check →
  boundary-check → smoke. Run it before opening a PR.

## Credentials

Never put a credential in this repository. The tracked `.npmrc` here only sets
`engine-strict=true`. npm tokens belong in your user-level `~/.npmrc`, which is
outside the repository.

Publishing does not need a token at all: releases run from CI through npm Trusted
Publishing (OIDC). See `docs/10-engineering/versioning-and-releases.md`.

## Trademark note

"PlanMo" is a trademark of the PlanMo maintainers, protected by policy and usage
rather than by the MIT license. The MIT license grants copyright permission only,
not trademark rights: do not use the PlanMo name or logo to promote a derivative
work without permission. Rename derivatives (for example "X, a fork of PlanMo")
and reserve the PlanMo name for unmodified upstream distributions. See
`docs/11-research/licensing.md`.
