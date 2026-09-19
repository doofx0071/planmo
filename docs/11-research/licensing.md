# Licensing Decision Criteria

Task: P00-05. Decision criteria are locked here; the **final license selection is deferred** to the v1 release gate (Phase 12, see OPEN-QUESTIONS #2). The repository is private until then, so no license is published yet.

## Criteria (must hold for the chosen license)

1. **Permissive** — maximize adoption by companies, AI-agent tooling vendors, and contributors; no copyleft obligations for consumers of a CLI tool.
2. **Dependency compatibility** — compatible with the v1 dependency baseline (Zod, @clack/prompts, Vitest, pnpm toolchain, etc. — all permissive).
3. **Clear patent terms** — explicit patent grant/termination language preferred for tools that companies integrate.
4. **Low legal/administrative overhead** — solo-maintainer friendly: short license text, no per-file headers required, standard SPDX identifier.
5. **Ecosystem norm** — the dominant license in the Node.js CLI/tooling space (MIT first, Apache-2.0 common for larger tooling).
6. **Trademark separation** — the name "PlanMo" / npm `planmo` is protected by policy and usage, not by the license; a trademark note belongs in CONTRIBUTING at public release, not in the license text.

## Candidate assessment (2026-09-19)

| License | Meets criteria | Notes |
|---|---|---|
| MIT | 1,2,4,5 fully; 3 implicit (no explicit patent grant) | Default recommendation for v1 |
| Apache-2.0 | All, incl. explicit patent grant + contribution terms | Choose if corporate contributors/PCI users require patent explicitness |
| MPL-2.0 | 1 partially (file-level copyleft) | Unnecessary for a CLI; rejected |
| AGPL/GPL | Fails 1 | Rejected |

## Decision

- Record criteria above; final pick deferred to Phase 12 go/no-go.
- Default recommendation: **MIT**, revisited only if a concrete contribution/integration need favors Apache-2.0.
- At first public release: add LICENSE, SPDX identifiers in manifests, and a trademark note in CONTRIBUTING.md.