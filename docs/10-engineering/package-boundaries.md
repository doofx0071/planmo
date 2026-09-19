# Package Boundaries

Enforced by `scripts/check-boundaries.mjs` (run via `pnpm boundary-check`, wired into CI).

## Rules

1. **Naming** — every package under `packages/` must be named `@planmo/<dirname>`.
2. **No escaping relative imports** — cross-package code must import the package
   specifier (`@planmo/core`), never a relative path that leaves the package
   directory (e.g. `../../core/src`). Relative imports may only reach files
   inside the package itself.
3. **Declared edges only** — an `@planmo/<pkg>` import is only allowed when the
   edge is declared in the `ALLOWED` graph in `scripts/check-boundaries.mjs`.
   The graph covers future packages; their edges are reserved for their owning
   phases.

## Dependency graph (Phase 01 state)

| Package | May import |
|---|---|
| `@planmo/shared` | — (leaf) |
| `@planmo/schema` | shared |
| `@planmo/core` | shared, schema |
| `@planmo/cli` | shared, schema, core |
| `@planmo/packs` *(future, P04)* | core, shared, schema |
| `@planmo/generator` *(future, P05)* | core, shared, schema, packs |
| `@planmo/scanner` *(future, P10)* | core, shared, schema |
| `@planmo/workflow` *(future, P08)* | core, shared |
| `@planmo/trace` *(future, P09)* | core, shared |
| `@planmo/design-engine` *(future, P07)* | core, shared, schema |
| `@planmo/agent-bridge` *(future, P06)* | core, shared, schema, adapters |
| `@planmo/adapters` *(future, P06)* | core, shared |
| `@planmo/testing-fixtures` *(future)* | — (leaf; test-only) |

## Principles

- **Layering, not microservices** — packages are in-repo modules, not
  independently deployed services. Boundaries exist to keep the compiler core
  and filesystem safety logic from being entangled with adapters and packs.
- **Core isolation** — ecosystem adapters (agents, registries, CI vendors) must
  never be imported by the deterministic core; adapters depend on core, never
  the reverse.
- **Testing fixtures** are never a runtime dependency of product packages.

## Changing the graph

Adding a package or edge requires: (1) the package directory, (2) its `@planmo/*`
name, (3) an entry in `ALLOWED` in the boundary script, (4) a PR that includes
evidence the boundary script passes (`pnpm boundary-check`).