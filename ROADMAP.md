# PlanMo Roadmap

PlanMo **v1 is released** (`planmo@1.x` on npm). The thirteen-phase build — from
product research through the CLI, packs, planning compiler, agent bridge, design
engine, workflow engine, trace/validate/doctor, repository adoption, ecosystem and
final hardening — is complete.

This file tracks what comes **after** v1. It is a direction, not a commitment.

## Near term

- **Expose the engines through the CLI.** Done. The CLI wires `plan`, `generate`,
  `diff`, `validate`, `doctor`, `next`, `task`, `trace`, `handoff`, `pack` and
  `agent` alongside `init`, `status` and `adopt`, and `planmo --help` lists exactly
  the implemented commands.
- **Working `repository`/`homepage` links.** The packages point at
  `github.com/doofx0071/planmo`, which is still private, so those links 404 for
  anonymous visitors.
- **npm provenance attestations.** Blocked while the source repository is private;
  npm rejects a provenance publish for a private repo. One line per package once
  the repo is public.
- **Branch protection on `main`.** Requires a public repository (or GitHub Pro).

## Later

- **Semantic retrieval adapter.** The v1 context engine is a deterministic lexical
  baseline; its blind spot (ranking by id order rather than query relevance) is
  measured in `scripts/eval-context-retrieval.mjs`. Embeddings or a hosted/graph
  service belong behind an optional adapter, never in the deterministic core.
- **Direct LLM adapters.** v1 is deliberately agent-adapter-first and needs no API
  key. Direct provider calls are an open question.
- **Remote pack publishing and a hosted registry.** v1 packs are declarative and
  local; remote content requires trust metadata, checksums and pinning first.
- **GitHub integration depth.** Export prototype exists; deeper integration is
  unspecified.
- **Agent support matrix.** The exact supported CLI surfaces and versions of each
  external agent need pinning as those tools move.
- **Telemetry.** Undecided; the default is off.

## How this repository is run

Changes land through short-lived branches and squash-merged PRs. Releases are
Changesets-driven and published from CI via npm Trusted Publishing (OIDC) — no
npm token is stored. See [CONTRIBUTING.md](CONTRIBUTING.md) and
[`docs/10-engineering/versioning-and-releases.md`](docs/10-engineering/versioning-and-releases.md).
