# Refactoring & Technical Debt

## Debt record

Each accepted debt item should contain:
- `id`
- `title`
- `introduced_by`
- `reason`
- `impact`
- `risk`
- `affected_paths`
- `target_phase_or_version`
- `linked_requirements`
- `linked_tests`
- `status`

## Phase close review

Before a phase closes:
1. inspect changed code for maintainability regression;
2. fix local regressions;
3. record justified remaining debt;
4. ensure no critical debt is hidden behind `DONE`.

## Proposed command

`planmo quality`

Initial versions should output findings, not a single score.
