# Quality Engine

## Principle

Quality findings must be evidence-backed and actionable. Avoid opaque "87/100 code quality" claims.

## Finding categories

- excessive responsibility
- complexity/nesting
- duplication
- dependency violation
- circular dependency
- weak typing
- hidden side effects
- dead code
- missing tests
- public API documentation gap
- performance regression
- accessibility regression
- security regression

## Refactoring policy

Refactor locally when:
- the change is small and clearly improves correctness/testability/readability;
- it stays inside phase scope;
- tests can prove behavior preservation.

Create tracked debt/refactor work when:
- the refactor is substantial;
- multiple packages are affected;
- public contracts change;
- it would distract from the active phase;
- migration or architectural approval is required.

Do not refactor unrelated code for stylistic preference.

## Metrics

Thresholds are warnings/context, not universal laws:
- cyclomatic/cognitive complexity;
- file/function size;
- nesting;
- dependency fan-in/fan-out;
- duplication;
- test mutation survival;
- change coupling.

Stack packs may define different policies.
