# ADR-0021: Frontend Design Engine — DTCG Tokens, Design Packs, Registry Trust

- **Status:** Accepted
- **Date:** 2026-09-21
- **Phase:** 07 (frontend design engine)
- **Extends:** ADR-0003 (DTCG design tokens), REQ-DESIGN-001..003

## Context

PlanMo plans frontends, not just backends. "Frontend design choices are
structured profiles/tokens, not vague prose" is a product invariant. Phase 07
implements the deterministic design engine behind that invariant: canonical
token generation, curated style packs, framework-agnostic registry adapters
carrying trust metadata, generated design guidance, and accessibility/motion
validation that overrides visual style.

## Decision

### Package boundary

A new package `@planmo/design-engine` depends only on `core`, `shared`, and
`schema` (no packs, no adapters, no agent bridge). It is pure and
deterministic: no filesystem, no CLI execution, no network, no randomness.
All renderers sort every array they emit.

### DTCG canonical tokens (P07-02)

Design tokens are stored and emitted in the DTCG (Design Tokens Community
Group) shape: dot-named tokens (`color.surface.canvas`), `$type`, `$value`,
and `{alias}` references. The token engine resolves aliases, detects missing
references, cycles, invalid values, and duplicate names, and emits
byte-deterministic DTCG JSON (sorted). `$value = "{color.text.primary}"` — a
correct alias (not an IP color match) — is the required way to reference
another token; raw literal reuse is rejected. Rules come from the DTCG spec
and `docs/05-design-engine/tokens.md`.

### Design packs (P07-03)

Eight initial design packs, one per canonical style id (minimal, editorial,
neobrutalism, soft-product, dense-dashboard, developer-tool, luxury,
playful). Each pack is declarative data: style metadata, DTCG tokens
(min 10), style-specific anti-patterns (min 3), responsive rules, and
accessibility notes. Packs never execute code. Token validity is enforced
by the same engine that emits canonical output, so a pack that fails token
validation can never generate artifacts.

### Registry adapter with trust metadata (P07-04)

Third-party component registries (shadcn-style) are resolved through a
framework-agnostic adapter that records source, item, version, and
integrity. **Trust metadata is mandatory**: every resolved item carries a
trust classification (official/verified/community/untrusted) and a
`requiresReview` decision. Community and untrusted sources are ALWAYS forced
to `requiresReview: true` — it cannot be disabled by the caller or by style.
`file://` URLs and malformed item paths are rejected. Every item round-trips
through `RegistryItemSchema` so schema invariants hold on every resolve.
High-assurance adoption of a community item requires explicit human review
recorded outside the engine.

### Generated design guidance (P07-05)

The docs generator renders deterministic markdown design guidance from a
profile + packs + tokens: profile summary, token table, anti-patterns
(universal + pack-specific, de-duplicated and sorted), responsive rules,
accessibility requirements, motion profile, and — when token validation
finds problems — a validation-warnings section. Guidance is generated, not
hand-written, and is traceable to the profile and packs that produced it.

### Accessibility overrides style (P07-06)

Accessibility outranks visual style and cannot be disabled by a pack. The
validator applies WCAG 2.2 AA floors by default (AAA when the profile says
so): exact relative-luminance/contrast-ratio math for 6-digit hex literals
(AA 4.5:1 normal / 3:1 large; AAA 7:1 / 4.5:1), reduced motion required
(WCAG 2.3.3), touch-target warning on compact density (WCAG 2.5.8),
reduced-motion availability, and rejection of any `a11y.*` token declaring a
skip. Backend-only profiles (valid state) validate clean. Diagnostics are
sorted by severity then code; `pass` is true only when no error exists.

### Anti-pattern policies + structured design standards (P07-07, CHG-001)

Universal anti-patterns (purposeless animation, hover-only actions, hidden
state changes, autoplay without pause) and style-specific anti-patterns are
carried as declarative policy. Design standards are structured
`StandardRule`s (class `language` pending a `design` class in the canonical
schema — flagged for Phase 09 standards work) with stable dot-prefixed ids,
global-default precedence, and references into `docs/05-design-engine/*`.
Rules cover DTCG canonicality, accessibility-outranks-style, source-vs-style
separation, motion profile constraints, reduced motion, touch targets,
keyboard navigation, focus visibility, contrast floors, semantics, and
mobile-first responsive.

## Consequences

- Frontend planning is deterministic and validated before artifact
  generation; style choices cannot silently violate accessibility.
- Community registry items always carry review burden; no silent adoption.
- Eight style packs give the CLI (Phase 08) an out-of-the-box design
  catalog without hand-authoring prose.
- `design` standard class remains a follow-up when standards injection
  (Phase 09) wires `appliesTo` refinement.