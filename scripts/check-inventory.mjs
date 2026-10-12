#!/usr/bin/env node
/**
 * Package inventory and dependency-graph audit (Stage 3).
 *
 * `check-boundaries.mjs` proves the *import* graph obeys the declared graph. This
 * checks the other half: that each package's manifest actually declares what its
 * source imports, that its entry points resolve, that the internal graph is
 * acyclic, and that the README's package table matches the workspace. These are
 * the failures that only show up when the monorepo is published and installed
 * standalone — exactly what the workspace symlinks hide.
 *
 * Exit 0 = the inventory is consistent. Exit 1 = one or more violations.
 */
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packagesDir = join(root, 'packages');

const violations = [];
function fail(message) {
  violations.push(message);
}

/** name -> { dir, manifest } for every workspace package. */
const packages = new Map();
for (const dir of readdirSync(packagesDir)) {
  const manifestPath = join(packagesDir, dir, 'package.json');
  if (!existsSync(manifestPath)) continue;
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  packages.set(manifest.name, { dir, manifest });
}

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|mts)$/.test(entry)) out.push(p);
  }
  return out;
}

for (const [name, { dir, manifest }] of packages) {
  const declared = new Set([
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.devDependencies ?? {}),
  ]);
  const runtime = new Set(Object.keys(manifest.dependencies ?? {}));

  // 1. Every @planmo/* import in src must be a declared dependency. A test may
  //    import a devDependency, but shipped source must not rely on one.
  for (const file of walk(join(packagesDir, dir, 'src'))) {
    const source = readFileSync(file, 'utf8');
    const isTest = /\.test\.ts$/.test(file);
    for (const match of source.matchAll(/from\s+['"](@planmo\/[\w-]+)['"]/g)) {
      const dep = match[1];
      if (dep === name) continue;
      if (!declared.has(dep)) {
        fail(
          `${name}: src imports "${dep}" but does not declare it (${file.replace(root + sep, '')})`,
        );
      } else if (!isTest && !runtime.has(dep)) {
        fail(`${name}: shipped source imports "${dep}" declared only as a devDependency`);
      }
    }
  }

  // 2. Entry points must resolve to real files (after a build).
  const targets = [];
  if (typeof manifest.main === 'string') targets.push(manifest.main);
  if (typeof manifest.types === 'string') targets.push(manifest.types);
  for (const value of Object.values(manifest.exports ?? {})) {
    if (typeof value === 'string') targets.push(value);
    else if (value && typeof value === 'object') {
      for (const v of Object.values(value)) if (typeof v === 'string') targets.push(v);
    }
  }
  for (const value of Object.values(manifest.bin ?? {})) {
    if (typeof value === 'string') targets.push(value);
  }
  for (const target of targets) {
    if (!existsSync(join(packagesDir, dir, target))) {
      fail(`${name}: entry point "${target}" does not exist (run a build, or fix the path)`);
    }
  }

  // 3. `files` must include everything the entry points need.
  const files = manifest.files;
  if (Array.isArray(files)) {
    const needsDist = targets.some((t) => t.startsWith('./dist/') || t.startsWith('dist/'));
    if (needsDist && !files.includes('dist')) {
      fail(`${name}: entry points live in dist/ but "files" does not include "dist"`);
    }
  }
}

// 4. The internal dependency graph must be acyclic.
const edges = new Map();
for (const [name, { manifest }] of packages) {
  edges.set(
    name,
    Object.keys(manifest.dependencies ?? {}).filter((dep) => packages.has(dep)),
  );
}
const state = new Map(); // name -> 'visiting' | 'done'
const stack = [];
function visit(name) {
  if (state.get(name) === 'done') return;
  if (state.get(name) === 'visiting') {
    fail(`circular internal dependency: ${[...stack, name].join(' -> ')}`);
    return;
  }
  state.set(name, 'visiting');
  stack.push(name);
  for (const dep of edges.get(name) ?? []) visit(dep);
  stack.pop();
  state.set(name, 'done');
}
for (const name of packages.keys()) visit(name);

// 5. The README package table must list exactly the workspace packages.
const readme = readFileSync(join(root, 'README.md'), 'utf8');
const documented = new Set();
for (const line of readme.split('\n')) {
  if (!line.trimStart().startsWith('|')) continue;
  for (const match of line.matchAll(/`(@planmo\/[\w-]+|planmo)`/g)) documented.add(match[1]);
}
for (const name of packages.keys()) {
  if (!documented.has(name)) fail(`README package table is missing "${name}"`);
}
for (const name of documented) {
  if (!packages.has(name))
    fail(`README package table lists "${name}", which is not in the workspace`);
}

if (violations.length > 0) {
  console.error('inventory violations:');
  for (const violation of violations) console.error(`  - ${violation}`);
  console.error(`\npackage inventory: ${violations.length} violation(s)`);
  process.exit(1);
}
console.log(`package inventory: OK (${packages.size} packages)`);
