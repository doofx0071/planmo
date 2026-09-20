# Change Engine

Substantial post-plan changes should enter PlanMo explicitly instead of silently rewriting the roadmap.

## Workflow

`planmo change new <slug>`

Creates:
- proposal
- rationale
- requirement deltas
- impact analysis
- risk delta
- task delta
- test delta
- decision

After review:

`planmo change apply CHG-...`

updates canonical planning artifacts and records provenance.

Finally:

`planmo change archive CHG-...`

preserves the accepted change package.

## Requirement delta syntax

Each change explicitly distinguishes:
- ADDED
- MODIFIED
- REMOVED

This makes planning evolution reviewable and reversible.
