---
'planmo': minor
---

`planmo init` now produces the full planning workspace, and user-owned documents
survive regeneration.

`init` previously wrote the plan spine only (roadmap, tracker, phase docs, handoff
template, standards, context). It now also emits the documents an agent needs to
work the plan:

- `planning/README.md`, `MASTER-PLAN.md`, `REQUIREMENTS-TRACEABILITY.md` and the
  canonical `tasks.csv`
- `planning/architecture/{ARCHITECTURE,DOMAIN-MODEL,SECURITY-PRIVACY,STATE-MACHINES}.md`
- `planning/compliance/POLICY-REGISTER.md`
- `planning/design/{DESIGN-BRIEF,DESIGN-SYSTEM}.md`
- `planning/prompts/{README,phase-prompt}.md`
- `planning/requirements/PRODUCT-REQUIREMENTS.md`
- `planning/testing/TEST-STRATEGY.md`

A standard-depth project now generates 30 documents (was 12).

Ownership is per document, not per folder. Documents derived from the project model
are regenerated; documents that accumulate decisions (`DECISIONS.md`,
`OPEN-QUESTIONS.md`, `RISKS.md`, `prompts/`) are written once and then belong to the
user.

Fixed: seeded documents were rewritten on every `generate`, silently discarding user
edits. `compileWorkspace` now writes only what the preview marks writable, so a
`seeded` file that already exists is never touched again.
