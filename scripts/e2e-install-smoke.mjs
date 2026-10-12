#!/usr/bin/env node
/**
 * Stage 3 — isolated npm-tarball install smoke test.
 *
 * Proves the published artifacts are self-contained: every workspace package is
 * packed into a tarball, then `planmo` and its internal dependencies are installed
 * into a clean temporary project FROM THOSE TARBALLS ONLY. Nothing resolves
 * through the monorepo's workspace symlinks, so an undeclared or missing runtime
 * dependency shows up here and nowhere else.
 *
 * Nothing is published. The temp project is created under the OS temp dir and
 * removed at the end.
 *
 * Usage: node scripts/e2e-install-smoke.mjs
 * Exit 0 = the installed CLI works standalone. Exit 1 = a check failed.
 */
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packagesDir = join(root, 'packages');

let failures = 0;
function check(label, ok, detail = '') {
  const status = ok ? 'PASS' : 'FAIL';
  if (!ok) failures++;
  console.log(`  ${status}  ${label}${detail && !ok ? ` — ${detail}` : ''}`);
  return ok;
}

/** Run a shell command in a directory, returning stdout. Throws on nonzero exit. */
function run(command, cwd) {
  return execSync(command, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

/** Every non-private workspace package: name + directory. */
async function workspacePackages() {
  const out = [];
  for (const dir of await readdir(packagesDir)) {
    let manifest;
    try {
      manifest = JSON.parse(await readFile(join(packagesDir, dir, 'package.json'), 'utf8'));
    } catch {
      continue;
    }
    if (manifest.private === true) continue;
    out.push({ dir, name: manifest.name, version: manifest.version });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

async function main() {
  console.log('e2e-install-smoke: packing workspace packages');

  // Build first so the tarballs carry a fresh dist/ (skipped when CI built already).
  if (!existsSync(join(packagesDir, 'planmo', 'dist', 'bin.js'))) {
    run('pnpm -r --if-present run build', root);
  }

  const packages = await workspacePackages();
  const tmp = await mkdtemp(join(tmpdir(), 'planmo-install-smoke-'));
  const tgzDir = join(tmp, 'tgz');
  const project = join(tmp, 'project');

  try {
    await mkdir(tgzDir, { recursive: true });
    await mkdir(project, { recursive: true });

    // 1. Pack each package (pnpm rewrites `workspace:*` to the real version).
    const tarballs = new Map();
    for (const pkg of packages) {
      run(`pnpm pack --pack-destination "${tgzDir}"`, join(packagesDir, pkg.dir));
      const file = `${pkg.name.replace('@', '').replace('/', '-')}-${pkg.version}.tgz`;
      tarballs.set(pkg.name, join(tgzDir, file));
    }
    console.log(`  packed ${tarballs.size} tarball(s)`);

    // 2. A project whose dependencies are all local tarballs — no registry
    //    resolution of @planmo/*, and no workspace symlinks.
    const deps = {};
    for (const [name, path] of tarballs) deps[name] = `file:${path.replace(/\\/g, '/')}`;
    await writeFile(
      join(project, 'package.json'),
      `${JSON.stringify({ name: 'planmo-install-smoke', private: true, version: '0.0.0', dependencies: deps }, null, 2)}\n`,
      'utf8',
    );

    console.log('  installing from tarballs (isolated)');
    run('npm install --no-audit --no-fund --ignore-scripts --loglevel=error', project);

    // 3. The install must be real directories, not links back into the monorepo.
    const coreStat = await stat(join(project, 'node_modules', '@planmo', 'core'));
    check(
      '@planmo/core installed as a real directory (no workspace symlink)',
      coreStat.isDirectory(),
    );

    // 4. Drive the installed binary exactly as a user would.
    const bin = join(project, 'node_modules', 'planmo', 'dist', 'bin.js');
    const version = run(`node "${bin}" --version`, project).trim();
    const cliVersion = JSON.parse(
      await readFile(join(packagesDir, 'planmo', 'package.json'), 'utf8'),
    ).version;
    check('installed CLI reports its version', version === `planmo ${cliVersion}`, version);

    const help = run(`node "${bin}" --help`, project);
    for (const command of ['init', 'generate', 'next', 'validate', 'doctor', 'agent']) {
      check(`--help lists "${command}"`, help.includes(`planmo ${command}`));
    }

    // 5. A representative lifecycle, run entirely against the installed copy.
    const fixture = join(tmp, 'fixture');
    await mkdir(fixture, { recursive: true });
    const initOut = run(`node "${bin}" init "${fixture}" --yes`, project);
    check('init created a workspace', initOut.includes('.planmo'), initOut.split('\n')[0]);

    const statusOut = run(`node "${bin}" status --dir "${fixture}"`, project);
    check('status reports HEALTHY', statusOut.includes('HEALTHY'), statusOut.trim());

    const validateOut = run(`node "${bin}" validate --dir "${fixture}"`, project);
    check('validate passes', validateOut.includes('OK'), validateOut.trim());

    const nextOut = run(`node "${bin}" next --print --dir "${fixture}"`, project);
    check(
      'next prints a task brief',
      /Next task\s+P\d\d-\d\d/.test(nextOut),
      nextOut.split('\n')[0],
    );

    const doctorOut = run(`node "${bin}" doctor --dir "${fixture}"`, project);
    check('doctor runs', /doctor: (OK|WARN)/.test(doctorOut), doctorOut.trim().split('\n').pop());

    // 6. Runtime assets the CLI expects must be present in the installed tree.
    const installedFiles = await readdir(join(project, 'node_modules', 'planmo', 'dist'));
    check('CLI dist is populated', installedFiles.length > 10, `${installedFiles.length} files`);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }

  console.log(
    failures === 0
      ? 'e2e-install-smoke: OK (isolated tarball install works)'
      : `e2e-install-smoke: ${failures} check(s) FAILED`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(`e2e-install-smoke: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
