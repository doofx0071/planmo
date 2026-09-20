/**
 * PlanMo core error taxonomy.
 *
 * Every failure in the deterministic core is a typed, named error so the CLI
 * and agent adapters can render precise diagnostics and so tests assert on
 * failure MODE, not on string content.
 */

/** Base class for all PlanMo core errors. */
export class PlanMoError extends Error {
  constructor(
    message: string,
    readonly exitCode = 1,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/** A path resolved outside the project root (path traversal). */
export class PathTraversalError extends PlanMoError {
  constructor(
    readonly path: string,
    readonly root: string,
  ) {
    super(`path escapes project root: "${path}" is not inside "${root}"`, 1);
  }
}

/** A symlink (or symlinked ancestor) resolves outside the project root. */
export class UnsafeSymlinkError extends PlanMoError {
  constructor(
    readonly path: string,
    readonly resolvedTo: string,
  ) {
    super(`unsafe symlink: "${path}" resolves to "${resolvedTo}" outside the project root`, 1);
  }
}

/** A write would silently overwrite an unmanaged existing file. */
export class FileCollisionError extends PlanMoError {
  constructor(readonly path: string) {
    super(`refusing to overwrite unmanaged file: "${path}"`, 2);
  }
}

/** A write target is not missing but points through a broken symlink. */
export class BrokenSymlinkError extends PlanMoError {
  constructor(readonly path: string) {
    super(`broken symlink at write target: "${path}"`, 1);
  }
}

/** A project root could not be located for the requested operation. */
export class ProjectNotFoundError extends PlanMoError {
  constructor(readonly startDir: string) {
    super(
      `no PlanMo project found from "${startDir}" (no .planmo/ directory walks up); run 'planmo init' first`,
      3,
    );
  }
}

/** A required workspace document is missing or unreadable. */
export class MissingDocumentError extends PlanMoError {
  constructor(
    readonly doc: string,
    readonly root: string,
  ) {
    super(`missing workspace document: ${doc} (in "${root}")`, 4);
  }
}

/** A workspace document failed schema validation. */
export class InvalidDocumentError extends PlanMoError {
  constructor(
    readonly doc: string,
    readonly issues: ReadonlyArray<string>,
  ) {
    super(`invalid workspace document: ${doc}\n${issues.map((i) => `  - ${i}`).join('\n')}`, 5);
  }
}

/** The writer is asked to commit a plan that was never computed. */
export class NoPlanError extends PlanMoError {
  constructor() {
    super('no change plan computed; call plan() before apply()', 6);
  }
}
