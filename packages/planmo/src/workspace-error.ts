import { ProjectNotFoundError } from '@planmo/core';

/**
 * No usable workspace at `root` — the `.planmo/` marker is absent, or
 * `project.yml` is unreadable or invalid.
 *
 * Extends `ProjectNotFoundError` so the CLI's single `instanceof` check maps
 * every adapter's "no workspace here" answer to exit 3. Throwing a plain `Error`
 * from an adapter loses the type, and the CLI then reports exit 1 — the wrong
 * answer for "there is no workspace here at all", which callers branch on.
 *
 * The message is the one every adapter already used, so nothing observable
 * changes except the exit code becoming correct.
 */
export class WorkspaceNotFoundError extends ProjectNotFoundError {
  constructor(root: string) {
    super(root);
    this.message = `no readable .planmo/project.yml in ${root}`;
  }
}
