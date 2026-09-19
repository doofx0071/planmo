# Initial Support Matrix

Task: P00-03. Verified: **2026-09-19** from official sources (see `2026-source-notes.md`).

## Coding agents targeted by the agent bridge (Phase 06)

| Agent | CLI surface observed | v1 target |
|---|---|---|
| Generic adapter (agent-neutral contract) | — | YES — always; canonical state is agent-neutral (REQ-AGENT-001/002) |
| OpenCode CLI | TUI (`opencode`), non-interactive (`opencode run`), headless server (`opencode serve`, HTTP + basic auth, `--port`/`--hostname`), custom agents (`opencode agent create`, explicit permission model: bash/read/edit/glob/grep/webfetch/task/todowrite/websearch/lsp/skill) | YES |
| Claude Code | Interactive (`claude`), non-interactive (`claude -p`, Agent SDK), `--allowedTools`, hooks/skills/plugins, exit 0/non-zero contract; installers: native (macOS/Linux curl), Homebrew, WinGet (`Anthropic.ClaudeCode`); **npm install of `@anthropic-ai/claude-code` is deprecated** | YES |
| Codex CLI | openai/codex — **not targeted in v1** (maintainer decision 2026-09-19); generic contract covers future addition without architecture change | NO |

Exact adapter fixtures (CLI versions, flag surfaces, skill/command install locations) are verified and pinned in Phase 06, not frozen here.

## Platforms

| Platform | Baseline |
|---|---|
| Windows 10/11 | Node.js 24 LTS, native (git-bash/MSYS and PowerShell both supported) |
| macOS | Intel + Apple Silicon |
| Linux | x86_64 + arm64 |

Node baseline: **24 LTS** (active LTS line "Krypton", latest `v24.11.0`, released 2025-10-28) — confirmed current as of 2026-09-19. Phase 01 CI matrix (P01-03) runs Windows/macOS/Linux.

## Initial design styles (Phase 07)

`minimal`, `editorial`, `neobrutalism`, `soft-product`, `dense-dashboard`, `developer-tool`, `luxury`, `playful` (8 styles; see `planning/MASTER-PLAN.md` and `docs/05-design-engine/style-catalog.md`).

## Frontend sources (not styles)

UI/component registries are *sources*, separate from visual style (REQ-DESIGN-003). shadcn registry confirmed framework-agnostic (distributes components, hooks, pages, config, rules — not limited to React) as of 2026-09-19. Concrete framework/source support is decided in Phase 07.

## Distribution / package targets

- npm registry only in v1 (no native binaries): CLI package **`planmo`** (fallback `planmo-cli`), internals under **`@planmo/*`** (see ADR-0007).
- Node.js 24 LTS engines baseline; no Node < 20 support planned for v1.

See ADR-0008.