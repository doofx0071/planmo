# Changesets

This repository uses [Changesets](https://github.com/changesets/changesets) to manage versioning and release notes.

## Adding a changeset

Run `pnpm changeset` and answer the prompts. Commit the generated markdown file under `.changeset/` together with the change it describes.

- Every PR that changes package behavior should include a changeset.
- All PlanMo packages are `private` during the 0.x development phase; versioning is recorded but nothing is published yet (see `docs/10-engineering/versioning-and-releases.md`).
- Pre-1.0 breaking changes to persisted `.planmo` schemas must still be described in the changeset body and `CHANGELOG.md`.

## Release process

No publishing until the release scaffolding phase (see roadmap Phase 11). `pnpm changeset version` and `pnpm changeset publish` will be wired into CI at that point.
