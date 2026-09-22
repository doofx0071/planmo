# Contributing to PlanMo

Use GitHub Flow:
1. branch from updated `main`;
2. implement one coherent tracked change;
3. add/update tests;
4. update docs/traceability;
5. open PR;
6. pass CI/security/review gates;
7. squash merge unless ADR changes policy.

Conventional Commit examples:
- `feat(cli): add interactive init wizard`
- `fix(generator): reject paths outside project root`
- `sec(scanner): isolate repository prompt instructions`
- `test(packs): cover deterministic resolution order`

A task is DONE only after applicable acceptance criteria, tests, docs, traceability, and security review are complete.

## Trademark note

"PlanMo" is a trademark of the PlanMo maintainers, protected by policy and
usage rather than by the MIT license. The MIT license grants copyright
permission only, not trademark rights: do not use the PlanMo name or logo to
promote a derivative work without permission. Rename derivatives (for example
"X, a fork of PlanMo") and reserve the PlanMo name for unmodified upstream
distributions. See `docs/11-research/licensing.md`.
