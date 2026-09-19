# Git and Pull Request Workflow

GitHub Flow:
- protected/releasable `main`;
- no ordinary direct feature pushes;
- CI-gated PRs.

PRs include:
- task/requirement IDs;
- tests/evidence;
- docs;
- security note for high-risk areas;
- changeset for public behavior/package changes.

Recommended checks:
lint, typecheck, unit/integration, golden, E2E, dependency/security, cross-platform core matrix.
