# 2026 Source Notes

Checked: 2026-09-19.

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

PlanMo uses DTCG-compatible design tokens as canonical design state.

## Toolchain
Phase 01 must verify exact current versions from official docs before pinning. Planning baseline:
- Node.js 24 LTS line;
- current compatible stable TypeScript;
- pnpm;
- Vitest;
- Zod;
- Clack prompts.
