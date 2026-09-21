// Package boundary enforcement for the PlanMo monorepo.
//
// Rules (see docs/10-engineering/package-boundaries.md):
// 1. Every package under packages/ must be named @planmo/<dirname>.
// 2. Cross-package imports must use the @planmo/* package specifier —
//    never relative imports that escape the package directory.
// 3. An import of @planmo/<pkg> is only allowed if the edge is declared
//    in ALLOWED below (the graph covers future packages too).
//
// Exit code 0 = boundaries hold. Failures print one line per violation.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packagesDir = join(root, 'packages');

// Declared dependency graph. Keys and values are package directory names.
// Edges for packages that do not exist yet are reserved for their owning phases.
const ALLOWED = {
  shared: [],
  schema: ['shared'],
  core: ['shared', 'schema'],
  cli: ['shared', 'schema', 'core', 'trace', 'scanner'],
  packs: ['core', 'shared', 'schema'],
  generator: ['core', 'shared', 'schema', 'packs'],
  scanner: ['core', 'shared', 'schema'],
  workflow: ['core', 'shared', 'schema', 'agent-bridge'],
  trace: ['core', 'shared', 'schema', 'workflow'],
  'design-engine': ['core', 'shared', 'schema'],
  'agent-bridge': ['core', 'shared', 'schema', 'adapters'],
  adapters: ['core', 'shared'],
  'testing-fixtures': [],
};

function err(msg) {
  console.error(`boundary violation: ${msg}`);
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) {
      walk(p, out);
    } else if (/\.(ts|tsx|mts)$/.test(entry)) {
      out.push(p);
    }
  }
  return out;
}

let violations = 0;

for (const pkgDir of readdirSync(packagesDir)) {
  const pkgPath = join(packagesDir, pkgDir);
  if (!statSync(pkgPath).isDirectory()) continue;
  if (!(pkgDir in ALLOWED)) {
    err(`packages/${pkgDir} is not declared in the boundary graph`);
    violations++;
    continue;
  }

  const pkgJson = JSON.parse(readFileSync(join(pkgPath, 'package.json'), 'utf8'));
  const expectedName = `@planmo/${pkgDir}`;
  if (pkgJson.name !== expectedName) {
    err(`packages/${pkgDir}: package name is "${pkgJson.name}", expected "${expectedName}"`);
    violations++;
  }

  const pkgRoot = resolve(pkgPath);
  for (const file of walk(join(pkgPath, 'src'))) {
    const source = readFileSync(file, 'utf8');
    const rel = relative(root, file).split(sep).join('/');

    const relativeMatches = source.matchAll(/from\s+['"](\.[^'"]+)['"]/g);
    for (const m of relativeMatches) {
      const target = resolve(dirname(file), m[1]);
      if (!target.startsWith(pkgRoot + sep)) {
        err(`${rel}: relative import escapes package boundary -> ${m[1]}`);
        violations++;
      }
    }

    const pkgMatches = source.matchAll(/from\s+['"]((?:@planmo|@\w+\/[\w-]+)\/[\w-]+)['"]/g);
    for (const m of pkgMatches) {
      const spec = m[1];
      if (!spec.startsWith('@planmo/')) {
        // External packages are fine; only @planmo/* edges are governed here.
        continue;
      }
      const target = spec.slice('@planmo/'.length);
      if (!(target in ALLOWED)) {
        err(`${rel}: import of unknown package "${spec}"`);
        violations++;
        continue;
      }
      if (target === pkgDir) {
        err(`${rel}: package imports itself ("${spec}")`);
        violations++;
        continue;
      }
      if (!ALLOWED[pkgDir].includes(target)) {
        err(
          `${rel}: forbidden edge ${pkgDir} -> ${target} (allowed: ${ALLOWED[pkgDir].join(', ') || 'none'})`,
        );
        violations++;
      }
    }
  }
}

if (violations > 0) {
  console.error(`\npackage boundaries: ${violations} violation(s)`);
  process.exit(1);
}
console.log('package boundaries: OK');
