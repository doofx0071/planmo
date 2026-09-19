# 2026 Source Notes (research baseline)

All freshness-sensitive facts below were checked **2026-09-19** against the listed authoritative sources. Anything a later phase pins exactly must be re-verified at pin time.

## Official-source verification (retrieved 2026-09-19)

| Assumption | Verified value | Source |
|---|---|---|
| Node.js baseline | **24 LTS** active LTS line "Krypton", latest `v24.11.0` (released 2025-10-28); current (non-LTS) line `v26.9.0` (2026-09-16) | `https://nodejs.org/dist/index.json` |
| pnpm | `12.4.2` (registry modified 2026-09-18) | `https://registry.npmjs.org/pnpm` |
| TypeScript | `7.0.2` (registry modified 2026-09-19) — native-compiler major line; verify toolchain migration details before Phase 01 pinning | `https://registry.npmjs.org/typescript` |
| Vitest | `5.0.1` (registry modified 2026-09-15) | `https://registry.npmjs.org/vitest` |
| Zod | `4.6.5` (registry modified 2026-09-13) — v4 line | `https://registry.npmjs.org/zod` |
| @clack/prompts | `1.8.1` (registry modified 2026-09-13) | `https://registry.npmjs.org/@clack%2Fprompts` |
| DTCG design tokens | Spec reached **first stable version 2025.10** (2025-10-28 announcement) — supports "DTCG-compatible" canonical tokens | `https://www.designtokens.org/` |
| shadcn registry | Registry distributes components, hooks, pages, config, rules, other files; works with **any framework, not limited to React** | `https://ui.shadcn.com/docs/registry` |
| OpenCode CLI | Open-source agent (MIT); terminal TUI + desktop + IDE; non-interactive `opencode run`; headless `opencode serve` (HTTP, basic auth); custom agents with explicit permission model | `https://opencode.ai`, `https://opencode.ai/docs/cli/`, `https://github.com/anomalyco/opencode` |
| Claude Code | Terminal/IDE/desktop; non-interactive `claude -p` + Agent SDK; native installers (curl, Homebrew, WinGet `Anthropic.ClaudeCode`); **npm install of `@anthropic-ai/claude-code` is deprecated** | `https://docs.anthropic.com/claude-code`, `https://docs.anthropic.com/en/docs/claude-code/cli-reference` |
| Codex CLI | Verified but **not targeted in v1** (maintainer decision 2026-09-19); Apache-2.0; `@openai/codex` `0.155.1` (2026-09-19) | `https://github.com/openai/codex` |

## GitHub Spec Kit

- https://github.com/github/spec-kit
- https://github.com/github/spec-kit/blob/main/docs/index.md
- https://github.com/github/spec-kit/blob/main/DEVELOPMENT.md
- https://github.com/github/spec-kit/blob/main/presets/README.md

Useful patterns:
- CLI + coding-agent integration split;
- reusable templates/process assets;
- presets/workflows/extensions;
- existing-project adoption.

PlanMo differentiates through project-wide governance, design engine, risk-adaptive generation, phase handoffs, traceability, deterministic compiler boundary.

## shadcn registry

- https://ui.shadcn.com/docs/registry
- https://ui.shadcn.com/docs/registry/getting-started
- https://ui.shadcn.com/docs/registry/namespace
- https://ui.shadcn.com/docs/directory

Useful:
- registries distribute more than UI components;
- namespace/multiple source support;
- GitHub registries;
- third-party code requires review.

## Design Tokens

- https://www.designtokens.org/
- https://www.w3.org/community/design-tokens/

DTCG-format specification is stable (2025.10). PlanMo uses DTCG-compatible design tokens as canonical design state.

## Toolchain

Phase 01 must verify exact current versions from official docs before pinning. Planning baseline confirmed current on 2026-09-19:
- Node.js 24 LTS (v24.11.0);
- TypeScript 7.0.2 (native-compiler major — confirm tooling compatibility);
- pnpm 12.4.2;
- Vitest 5.0.1;
- Zod 4.6.5;
- @clack/prompts 1.8.1.