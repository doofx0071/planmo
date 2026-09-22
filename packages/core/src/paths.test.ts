import { existsSync, realpathSync } from 'node:fs';
import { symlink } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';

/**
 * Create a directory link. On Windows use a junction (no admin required);
 * on POSIX a symlink. Returns true when the link was created.
 */
async function tryDirLink(target: string, linkPath: string): Promise<boolean> {
  try {
    const type = process.platform === 'win32' ? 'junction' : 'dir';
    await symlink(target, linkPath, type);
    return true;
  } catch {
    return false;
  }
}
import { describe, expect, it } from 'vitest';
import { PathTraversalError, ProjectNotFoundError, UnsafeSymlinkError } from './errors.js';
import {
  ensureNoSymlinkEscape,
  findProjectRoot,
  isInsideRoot,
  resolveInsideRoot,
} from './paths.js';
import { tempDir, tempRoot, tempWrite } from './test-utils.js';

describe('resolveInsideRoot', () => {
  it('resolves a plain relative target inside root', () => {
    const out = resolveInsideRoot('/proj', 'docs/a.md');
    expect(out).toBe(resolve('/proj/docs/a.md'));
  });

  it('normalises dot segments', () => {
    const out = resolveInsideRoot('/proj', './docs/../docs/a.md');
    expect(out).toBe(resolve('/proj/docs/a.md'));
  });

  it('rejects .. traversal escaping root', () => {
    expect(() => resolveInsideRoot('/proj', '../etc/passwd')).toThrow(PathTraversalError);
  });

  it('rejects deep .. traversal', () => {
    expect(() => resolveInsideRoot('/proj', 'a/../../etc/passwd')).toThrow(PathTraversalError);
  });

  it('rejects an absolute path outside root', () => {
    expect(() => resolveInsideRoot('/proj', '/etc/passwd')).toThrow(PathTraversalError);
  });

  it('rejects a sibling-root prefix attack (/proj-other)', () => {
    // String-prefix containment would wrongly accept this; path.relative must not.
    expect(() => resolveInsideRoot('/proj', '/proj-other/x')).toThrow(PathTraversalError);
  });

  it('allows a target inside a deeper sibling-named dir (/proj/../proj/x)', () => {
    const out = resolveInsideRoot('/proj', 'proj/../x');
    expect(out).toBe(resolve('/proj/x'));
  });
});

describe('isInsideRoot', () => {
  it('accepts files at and below root', () => {
    expect(isInsideRoot('/proj', '/proj/a')).toBe(true);
    expect(isInsideRoot('/proj', '/proj')).toBe(true);
  });

  it('rejects escapes and sibling-root prefixes', () => {
    expect(isInsideRoot('/proj', '/etc')).toBe(false);
    expect(isInsideRoot('/proj', '/proj-other')).toBe(false);
    expect(isInsideRoot('/proj', '/proj/../x')).toBe(false);
  });
});

describe('findProjectRoot', () => {
  it('walks up from a nested dir to the .planmo root', async () => {
    const root = await tempRoot();
    await tempWrite(root, '.planmo/state.yml', 'x');
    await tempDir(root, 'a/b/c');
    const found = await findProjectRoot(join(root, 'a', 'b', 'c'));
    if (process.platform === 'win32') {
      // Windows tmpdir may carry 8.3 short names (RUNNER~1 vs runneradmin)
      // that realpath expands inconsistently — compare the aliasing-invariant
      // tail (Temp\planmo-test-*) and anchor on the state.yml marker.
      const tail = (p: string) => p.split(sep).slice(-4).join(sep).toLowerCase();
      expect(tail(found)).toBe(tail(resolve(root)));
      expect(existsSync(join(found, '.planmo', 'state.yml'))).toBe(true);
    } else {
      // Canonicalize both sides (macOS /var -> /private/var via realpath).
      expect(realpathSync(found)).toBe(realpathSync(resolve(root)));
    }
  });

  it('throws ProjectNotFoundError when no .planmo exists above', async () => {
    const root = await tempRoot();
    await expect(findProjectRoot(root)).rejects.toThrow(ProjectNotFoundError);
  });
});

describe('ensureNoSymlinkEscape', () => {
  it('passes a real directory tree', async () => {
    const root = await tempRoot();
    await tempDir(root, '.planmo');
    const out = await ensureNoSymlinkEscape(root, join(root, '.planmo'));
    if (process.platform === 'win32') {
      // Engine output is canonical; Windows realpath expands 8.3 names
      // inconsistently — compare the aliasing-invariant tail instead.
      const tail = (p: string) => p.split(sep).slice(-5).join(sep).toLowerCase();
      expect(tail(out)).toBe(tail(resolve(join(root, '.planmo'))));
    } else {
      expect(realpathSync(out)).toBe(realpathSync(resolve(join(root, '.planmo'))));
    }
  });

  it('passes through a symlink that stays inside root', async () => {
    const root = await tempRoot();
    await tempDir(root, 'real');
    const link = join(root, 'link');
    if (!(await tryDirLink(resolve(join(root, 'real')), link))) {
      return; // symlinks unavailable on this platform — nothing to assert
    }
    await expect(ensureNoSymlinkEscape(root, join(link, 'file.txt'))).resolves.toBeTruthy();
  });

  it('rejects a symlinked directory escaping root', async () => {
    const root = await tempRoot();
    const outside = await tempRoot('planmo-outside-');
    const link = join(root, 'evil');
    if (!(await tryDirLink(outside, link))) {
      return; // symlinks unavailable on this platform — nothing to assert
    }
    await expect(ensureNoSymlinkEscape(root, join(link, 'file.txt'))).rejects.toThrow(
      UnsafeSymlinkError,
    );
  });

  it('rejects traversal even when the target path does not exist yet', async () => {
    const root = await tempRoot();
    await tempDir(root, '.planmo');
    await expect(ensureNoSymlinkEscape(root, join(root, '..', 'escape'))).rejects.toThrow(
      PathTraversalError,
    );
  });
});

describe('writer-level filesystem safety', () => {
  it('stops a write whose parent chain contains an escaping symlink', async () => {
    const root = await tempRoot();
    const outside = await tempRoot('planmo-outside-');
    await tempDir(root, 'src');
    const link = join(root, 'src', 'escape');
    if (!(await tryDirLink(outside, link))) {
      return;
    }
    const { ManagedWriter } = await import('./writer.js');
    const writer = new ManagedWriter(root, { contentDirs: [] });
    await expect(writer.plan([{ path: 'src/escape/new.txt', content: 'x' }])).rejects.toThrow(
      UnsafeSymlinkError,
    );
  });

  it('stops a write targeting a file symlink that escapes root', async () => {
    const root = await tempRoot();
    const outside = await tempRoot('planmo-outside-');
    await tempWrite(outside, 'secret.txt', 'do not write here');
    await tempDir(root, '.planmo');
    const link = join(root, '.planmo', 'project.yml');
    try {
      await symlink(resolve(join(outside, 'secret.txt')), link, 'file');
    } catch {
      return;
    }
    const { ManagedWriter } = await import('./writer.js');
    const writer = new ManagedWriter(root, { contentDirs: [] });
    await expect(writer.plan([{ path: '.planmo/project.yml', content: 'y' }])).rejects.toThrow(
      UnsafeSymlinkError,
    );
  });
});
