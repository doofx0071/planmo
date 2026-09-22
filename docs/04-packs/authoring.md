# Authoring Packs

Packs are declarative in v1 (ADR-0004): a `pack.yml` manifest plus structured
content. A pack may contribute metadata, questions, defaults, requirements,
rules, templates/fragments, design tokens, agent instructions, and validation
constraints — it may **never** execute arbitrary code.

A pack is loaded and validated by `@planmo/packs` (`loadPack`, P04-01), and
resolved deterministically with locking (ADR-0018, P04-04).

## Categories

Every pack has exactly one `category`, chosen from `PACK_CATEGORIES` in
`@planmo/schema`:

| Category     | What it contributes                                   |
| ------------ | ----------------------------------------------------- |
| `stack`      | Technology-stack conventions, defaults, fragments     |
| `domain`     | Domain knowledge, terminology, rules                  |
| `risk`       | Risk assessments, guardrails                          |
| `design`     | Design profiles/tokens (ADR-0021)                     |
| `agent`      | Agent instructions, workflow guidance                 |
| `workflow`   | Orchestration steps, gate rules                       |
| `standards`  | Structured standard rules (validated content shape)   |
| `policy`     | Engineering policy entries (validated content shape)  |
| `context`    | Context/memory policy declarations (validated shape)  |

`standards`, `policy`, and `context` are the CHG-001 policy categories: the
loader validates their `content` against a strict per-category schema. Other
categories own their content validation in their phase; the loader only
requires their content to be executable-free and schema-valid.

## Required `pack.yml` fields

`PackSchema` is a strict, versioned object schema (ADR-0011): unknown keys
are rejected, and every pack document carries `schemaVersion` (currently
always `1`).

| Field         | Type             | Required | Notes                                              |
| ------------- | ---------------- | -------- | -------------------------------------------------- |
| `schemaVersion` | `1`            | yes      | Literal `1`; future major versions are rejected at load time |
| `ref`         | string           | yes      | Canonical pack ref, e.g. `stack/nextjs`, `design/minimal` |
| `name`        | non-empty string | yes      | Human-readable name                                |
| `version`     | SemVer string    | yes      | e.g. `1.2.0`, `0.3.1-beta.1`                       |
| `category`    | enum             | yes      | One of the categories above                        |
| `description` | non-empty string | yes      | What the pack contributes                          |
| `provides`    | string[]         | no       | Capability refs this pack contributes (default `[]`) |
| `requires`    | pack ref[]       | no       | Pack refs this pack depends on (default `[]`)      |
| `content`     | object           | no       | Declarative structured data (default `{}`)         |
| `provenance`  | object           | no       | Required for remote packs (REQ-TRUST-001); local packs may omit |
| `extensions`  | object           | no       | Optional user extension data, preserved verbatim   |

Minimal example:

```yaml
schemaVersion: 1
ref: stack/nextjs
name: Next.js stack
version: 1.4.0
category: stack
description: Conventions and defaults for Next.js projects.
```

## `provides` and `requires`

- **`provides`** lists capability refs (non-empty strings, conventionally
  namespaced, e.g. `design.minimal`, `standard.payments`) that this pack
  contributes to the resolved graph.
- **`requires`** lists pack refs (e.g. `stack/nextjs`) this pack depends on.
  The resolver (P04-04, ADR-0018) resolves the full dependency closure,
  detects conflicts, and locks the result by version + integrity; cycles are
  rejected. Do not hand-roll resolution — declare `requires` and let the
  resolver produce the lockfile.

```yaml
schemaVersion: 1
ref: standards/payments
name: Payments standards
version: 1.2.0
category: standards
description: Standard rules for payment-domain work.
provides:
  - standard.payments
requires:
  - stack/nodejs
```

## SemVer and compatibility

Version fields are SemVer (ADR-0006). Compatibility is enforced at
resolution time (docs/04-packs/versioning.md, ADR-0018):

- Remote packs are pinned by version/ref and integrity metadata; there are
  no automatic incompatible major upgrades.
- A pack must declare compatibility with PlanMo core and its schema version
  where applicable; the resolved lockfile records the chosen versions.
- Bump `version` strictly per SemVer: breaking changes require a major bump;
  new backwards-compatible capabilities a minor; fixes a patch.
- Do not silently change a published pack's meaning at the same version —
  that breaks the integrity pin and the trust contract (REQ-TRUST-001).

## Executable constructs are rejected at any depth

Packs are pure data. The loader scans **every** key in `content` recursively
— this is not a top-level check — and rejects the pack if any of the
following keys is present at any depth (fail closed, ADR-0004,
REQ-TRUST-002):

`hooks`, `scripts`, `commands`, `exec`, `install`, `postinstall`,
`preinstall`, `run`, `shell`, `lifecycle`, `template-engine`, `code`

Rejected example:

```yaml
# REJECTED — 'scripts' is a forbidden key, found at content.templates[0].scripts
schemaVersion: 1
ref: stack/boom
name: Boom
version: 1.0.0
category: stack
description: Never publish this.
content:
  templates:
    - name: scaffold
      scripts:
        - rm -rf node_modules
```

The rejection applies to the key's presence anywhere in `content`, even
inside nested arrays/objects, regardless of value — there are no benign
uses in v1. If the key would appear as authored *data*, restructure it
under a permitted key.

## Remote provenance (REQ-TRUST-001)

Remote packs are untrusted input (ADR-0004) and must expose provenance —
source, version, integrity, and trust metadata — before they are usable:

```yaml
schemaVersion: 1
ref: stack/nextjs
name: Next.js stack
version: 1.4.0
category: stack
description: Conventions and defaults for Next.js projects.
provenance:
  source: registry        # 'local' | 'registry' | 'git'
  url: https://registry.example.com/packs/stack/nextjs
  author: acme-corp
  publishedAt: "2026-08-01T00:00:00Z"
  license: MIT
  integrity:
    algorithm: sha256
    digest: 9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08
  trustLevel: third-party
```

Trust rules:

- `verified-source` is **reserved** for a future signing/curation design
  (ADR-0021); it is not assignable to remote sources today. Remote sources
  may only declare `third-party`.
- **`third-party` ⇒ review before use.** Third-party packs enter the
  resolved graph only with explicit user acceptance; they are never part of
  the deterministic builtin set.
- The trust classifier (`@planmo/packs`, P11-01), not the schema alone,
  enforces the declared trust level.
- `integrity` (sha256/sha512 over the resolved content) pins the exact bytes
  in the lockfile (ADR-0018). Fingerprints and secrets must never be placed
  in a pack or its provenance.
- Requirement traceability: REQ-TRUST-001 (provenance), REQ-TRUST-002 (no
  implicit execution), REQ-TRUST-003 (future SBOM/signature).

## Content shapes: standards, policy, context

For the three policy categories the loader validates `content` against a
strict shape (`PackContentShapeSchema`). Other categories keep `content` as
open structured data.

### `standards`

`content.standards` is an array of rules with a stable `id`, a `class`, a
`precedence` tier, and an actionable `rule` statement:

```yaml
schemaVersion: 1
ref: standards/payments
name: Payments standards
version: 1.2.0
category: standards
description: Standard rules for payment-domain work.
provides:
  - standard.payments
requires:
  - stack/nodejs
content:
  standards:
    - id: payments.pci-scope
      class: security
      precedence: domain
      rule: Never log raw cardholder data.
      appliesTo:
        domain: [payments]
        risk: [medium, high]
      rationale: Reduces PCI DSS scope.
      references: [docs/13-standards-quality/standards-engine.md]
```

### `policy`

`content.policies` is an array of engineering policy entries scoped to
`project`, `package`, `stack`, or `global`:

```yaml
schemaVersion: 1
ref: policy/quality
name: Engineering quality policy
version: 1.0.0
category: policy
description: Refactoring and quality policy (CHG-001).
content:
  policies:
    - id: qlt.refactor-inscope
      scope: package
      rule: Perform small justified refactors inside scope; track larger debt.
      rationale: Engineering quality (CHG-001).
      precedence: project
      references: [AGENTS.md]
```

### `context`

`content` declares context compilation policy and memory persistence rules
(declarations only — v1 has no storage engine):

```yaml
schemaVersion: 1
ref: context/memory-policy
name: Context & memory policy
version: 1.0.0
category: context
description: Declares context budgets and memory persistence rules.
content:
  context:
    tokenBudget:
      tokens: 24000
    progressiveDisclosure: true
    defaultPacketBudget:
      tokens: 8000
  memory:
    allowedScopes: [project, phase]
    requireProvenance: true
    redactSecrets: true
```

Any content that would violate these shapes fails load with a descriptive
`PackLoadError` listing the offending paths.

## Package-boundary rule

Packs are **data, not code**: they never import `@planmo/*` or any other
package, and a pack directory must not contain executable entry points. Code
that *reads* packs lives in `@planmo/packs` and may depend only on the
declared graph (`core`, `shared`, `schema`) — see
docs/10-engineering/package-boundaries.md and `scripts/check-boundaries.mjs`.
Cross-package imports must use the `@planmo/<pkg>` specifier, never relative
paths escaping the package directory. Package boundaries are enforced by
CI; a violation fails the check.