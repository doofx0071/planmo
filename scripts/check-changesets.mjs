/**
 * Fail when a changed, publishable package carries no changeset.
 *
 * Why this exists: a changeset on the entry package does NOT republish its
 * dependencies. So changing a dependency's source without a changeset of its own
 * ships a stale dependency to the registry — the entry package resolves the
 * previously published version — while every local test and the whole CI gate
 * still pass, because they all run against workspace source. That exact mistake
 * put a broken `planmo@1.3.0` on npm.
 *
 * Usage:  node scripts/check-changesets.mjs [--base=<git-ref>]
 * Base defaults to $CHANGESET_BASE, then origin/main. If the base cannot be
 * resolved (shallow clone, detached CI checkout) the check is skipped, not failed.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const baseArg = process.argv.slice(2).find((a) => a.startsWith('--base='));
const base = baseArg
  ? baseArg.slice('--base='.length)
  : (process.env.CHANGESET_BASE ?? 'origin/main');

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

let changed;
try {
  changed = git(['diff', '--name-only', `${base}...HEAD`]).split('\n').filter(Boolean);
} catch {
  console.log(`changeset check: cannot diff against '${base}' — skipping`);
  process.exit(0);
}

/** Publishable = has a package.json and is not private. */
function readPkg(dir) {
  return JSON.parse(readFileSync(join('packages', dir, 'package.json'), 'utf8'));
}

const packageDirs = existsSync('packages')
  ? readdirSync('packages', { withFileTypes: true })
      .filter((e) => e.isDirectory() && existsSync(join('packages', e.name, 'package.json')))
      .map((e) => e.name)
  : [];

// A change to a test file alone does not change shipped behaviour.
const changedPackages = new Set();
for (const file of changed) {
  const match = /^packages\/([^/]+)\//.exec(file);
  if (match === null) continue;
  if (/\.test\.tsx?$/.test(file)) continue;
  changedPackages.add(match[1]);
}

const changesetFiles = existsSync('.changeset')
  ? readdirSync('.changeset').filter((f) => f.endsWith('.md') && f.toLowerCase() !== 'readme.md')
  : [];

const covered = new Set();
for (const file of changesetFiles) {
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(readFileSync(join('.changeset', file), 'utf8'));
  if (frontmatter === null) continue;
  for (const match of frontmatter[1].matchAll(/['"]([^'"]+)['"]\s*:/g)) {
    covered.add(match[1]);
  }
}

const missing = [];
for (const dir of [...changedPackages].sort()) {
  const pkg = readPkg(dir);
  if (pkg.private === true) continue; // never published, no changeset needed
  if (covered.has(pkg.name)) continue;
  missing.push(`${pkg.name} (packages/${dir})`);
}

if (missing.length > 0) {
  console.error('changeset check: changed publishable package(s) with no changeset:');
  for (const entry of missing) console.error(`  - ${entry}`);
  console.error('');
  console.error('Add one with `pnpm changeset`. A changeset on the entry package does');
  console.error('not republish its dependencies, so each changed package needs its own.');
  process.exit(1);
}

console.log(
  `changeset check: OK (${changedPackages.size} changed package(s), all covered by a changeset)`,
);
