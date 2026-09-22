import { describe, expect, it } from 'vitest';
import type { SymbolReference } from '../contracts.js';
import { symbolIndex } from './symbol-index.js';

async function indexOf(files: Record<string, string>): Promise<readonly SymbolReference[]> {
  return symbolIndex.index(new Map(Object.entries(files)));
}

function find(refs: readonly SymbolReference[], symbol: string): SymbolReference {
  const found = refs.find((r) => r.symbol === symbol);
  expect(found, `expected a reference for symbol "${symbol}"`).toBeDefined();
  return found!;
}

describe('symbolIndex.index() — JS/TS', () => {
  it('indexes default, named, aliased and namespace imports', async () => {
    const refs = await indexOf({
      'src/app.ts': [
        "import express from 'express';",
        "import { readFile, writeFile as wf } from 'node:fs';",
        "import * as net from 'node:net';",
        "import defaultThing, { other } from './mod.js';",
      ].join('\n'),
    });
    expect(refs).toContainEqual({
      symbol: 'express',
      kind: 'import',
      file: 'src/app.ts',
      line: 1,
      target: 'express',
    });
    expect(refs).toContainEqual({
      symbol: 'readFile',
      kind: 'import',
      file: 'src/app.ts',
      line: 2,
      target: 'node:fs',
    });
    expect(refs).toContainEqual({
      symbol: 'wf',
      kind: 'import',
      file: 'src/app.ts',
      line: 2,
      target: 'node:fs',
    });
    expect(refs).toContainEqual({
      symbol: 'net',
      kind: 'import',
      file: 'src/app.ts',
      line: 3,
      target: 'node:net',
    });
    expect(refs).toContainEqual({
      symbol: 'defaultThing',
      kind: 'import',
      file: 'src/app.ts',
      line: 4,
      target: './mod.js',
    });
    expect(refs).toContainEqual({
      symbol: 'other',
      kind: 'import',
      file: 'src/app.ts',
      line: 4,
      target: './mod.js',
    });
  });

  it('counts type-only imports as imports', async () => {
    const refs = await indexOf({
      'src/types.ts':
        "import type { User, Order as Invoice } from './models.js';\nimport { type Role } from './roles.js';",
    });
    expect(refs).toContainEqual({
      symbol: 'User',
      kind: 'import',
      file: 'src/types.ts',
      line: 1,
      target: './models.js',
    });
    expect(refs).toContainEqual({
      symbol: 'Invoice',
      kind: 'import',
      file: 'src/types.ts',
      line: 1,
      target: './models.js',
    });
    expect(refs).toContainEqual({
      symbol: 'Role',
      kind: 'import',
      file: 'src/types.ts',
      line: 2,
      target: './roles.js',
    });
  });

  it('emits side-effect imports as references', async () => {
    const refs = await indexOf({
      'src/polyfill.ts': "import './polyfills/setup.js';\nimport 'dotenv/config';",
    });
    expect(refs).toContainEqual({
      symbol: './polyfills/setup.js',
      kind: 'reference',
      file: 'src/polyfill.ts',
      line: 1,
      target: './polyfills/setup.js',
    });
    expect(refs).toContainEqual({
      symbol: 'dotenv/config',
      kind: 'reference',
      file: 'src/polyfill.ts',
      line: 2,
      target: 'dotenv/config',
    });
  });

  it('handles multi-line import statements (line = statement start)', async () => {
    const refs = await indexOf({
      'src/multi.ts': "import {\n  alpha,\n  beta as b,\n} from './lib.js';\nconst after = 1;",
    });
    expect(refs).toContainEqual({
      symbol: 'alpha',
      kind: 'import',
      file: 'src/multi.ts',
      line: 1,
      target: './lib.js',
    });
    expect(refs).toContainEqual({
      symbol: 'b',
      kind: 'import',
      file: 'src/multi.ts',
      line: 1,
      target: './lib.js',
    });
    expect(refs.some((r) => r.symbol === 'after')).toBe(false);
  });

  it('indexes require() forms', async () => {
    const refs = await indexOf({
      'src/legacy.js': [
        "const fs = require('node:fs');",
        "const cache = require('./cache.js').cache;",
        "require('./side-effects.js');",
        "require('./side-effects.js').run;",
      ].join('\n'),
    });
    expect(refs).toContainEqual({
      symbol: 'fs',
      kind: 'require',
      file: 'src/legacy.js',
      line: 1,
      target: 'node:fs',
    });
    expect(refs).toContainEqual({
      symbol: 'cache',
      kind: 'require',
      file: 'src/legacy.js',
      line: 2,
      target: './cache.js',
    });
    expect(refs).toContainEqual({
      symbol: './side-effects.js',
      kind: 'reference',
      file: 'src/legacy.js',
      line: 3,
      target: './side-effects.js',
    });
    expect(refs).toContainEqual({
      symbol: './side-effects.js',
      kind: 'reference',
      file: 'src/legacy.js',
      line: 4,
      target: './side-effects.js',
    });
  });

  it('indexes export declarations', async () => {
    const refs = await indexOf({
      'src/exports.ts': [
        'export const VERSION = 1;',
        'export function run(): void {}',
        'export class Service {}',
        'export interface Shape { x: number }',
        'export type Id = string;',
        'export enum Mode { A, B }',
        'export default function main() {}',
        'export default config;',
        'export async function load() {}',
      ].join('\n'),
    });
    expect(find(refs, 'VERSION')).toEqual({
      symbol: 'VERSION',
      kind: 'export',
      file: 'src/exports.ts',
      line: 1,
      target: null,
    });
    expect(find(refs, 'run')).toEqual({
      symbol: 'run',
      kind: 'export',
      file: 'src/exports.ts',
      line: 2,
      target: null,
    });
    expect(find(refs, 'Service')).toEqual({
      symbol: 'Service',
      kind: 'export',
      file: 'src/exports.ts',
      line: 3,
      target: null,
    });
    expect(find(refs, 'Shape')).toEqual({
      symbol: 'Shape',
      kind: 'export',
      file: 'src/exports.ts',
      line: 4,
      target: null,
    });
    expect(find(refs, 'Id')).toEqual({
      symbol: 'Id',
      kind: 'export',
      file: 'src/exports.ts',
      line: 5,
      target: null,
    });
    expect(find(refs, 'Mode')).toEqual({
      symbol: 'Mode',
      kind: 'export',
      file: 'src/exports.ts',
      line: 6,
      target: null,
    });
    expect(find(refs, 'main')).toEqual({
      symbol: 'main',
      kind: 'export',
      file: 'src/exports.ts',
      line: 7,
      target: null,
    });
    expect(find(refs, 'default')).toEqual({
      symbol: 'default',
      kind: 'export',
      file: 'src/exports.ts',
      line: 8,
      target: null,
    });
    expect(find(refs, 'load')).toEqual({
      symbol: 'load',
      kind: 'export',
      file: 'src/exports.ts',
      line: 9,
      target: null,
    });
  });

  it('indexes local export braces and re-exports', async () => {
    const refs = await indexOf({
      'src/barrel.ts': [
        "export { a, b as c } from './a.js';",
        "export * from './b.js';",
        "export * as widgets from './widgets.js';",
        "export { localOne, localTwo as renamed } from './locals.js';",
        'export const localThree = 3;',
        'export { localThree };',
      ].join('\n'),
    });
    expect(refs).toContainEqual({
      symbol: 'a',
      kind: 'export',
      file: 'src/barrel.ts',
      line: 1,
      target: './a.js',
    });
    expect(refs).toContainEqual({
      symbol: 'c',
      kind: 'export',
      file: 'src/barrel.ts',
      line: 1,
      target: './a.js',
    });
    expect(refs).toContainEqual({
      symbol: '*',
      kind: 'export',
      file: 'src/barrel.ts',
      line: 2,
      target: './b.js',
    });
    expect(refs).toContainEqual({
      symbol: 'widgets',
      kind: 'export',
      file: 'src/barrel.ts',
      line: 3,
      target: './widgets.js',
    });
    expect(refs).toContainEqual({
      symbol: 'localOne',
      kind: 'export',
      file: 'src/barrel.ts',
      line: 4,
      target: './locals.js',
    });
    expect(refs).toContainEqual({
      symbol: 'renamed',
      kind: 'export',
      file: 'src/barrel.ts',
      line: 4,
      target: './locals.js',
    });
    expect(refs).toContainEqual({
      symbol: 'localThree',
      kind: 'export',
      file: 'src/barrel.ts',
      line: 6,
      target: null,
    });
  });

  it('handles multi-line re-export with trailing from on the next line', async () => {
    const refs = await indexOf({
      'src/trailing.ts': ['export {', '  one,', '  two as second,', "} from './dep.js';"].join(
        '\n',
      ),
    });
    expect(refs).toContainEqual({
      symbol: 'one',
      kind: 'export',
      file: 'src/trailing.ts',
      line: 1,
      target: './dep.js',
    });
    expect(refs).toContainEqual({
      symbol: 'second',
      kind: 'export',
      file: 'src/trailing.ts',
      line: 1,
      target: './dep.js',
    });
  });

  it('skips comment lines but not commented statements', async () => {
    const refs = await indexOf({
      'src/comments.ts': [
        '// import ghost from "ghost-pkg";',
        '/* export const shadow = 1; */',
        "import real from './real.js'; // trailing comment",
      ].join('\n'),
    });
    expect(refs.some((r) => r.symbol === 'ghost')).toBe(false);
    expect(refs.some((r) => r.symbol === 'shadow')).toBe(false);
    expect(refs).toContainEqual({
      symbol: 'real',
      kind: 'import',
      file: 'src/comments.ts',
      line: 3,
      target: './real.js',
    });
  });
});

describe('symbolIndex.index() — python', () => {
  it('indexes import forms', async () => {
    const refs = await indexOf({
      'src/app.py': [
        'import os',
        'import os.path',
        'import requests as http',
        'import a, b.c',
        'from json import dumps, loads as parse',
      ].join('\n'),
    });
    expect(refs).toContainEqual({
      symbol: 'os',
      kind: 'import',
      file: 'src/app.py',
      line: 1,
      target: null,
    });
    expect(refs).toContainEqual({
      symbol: 'os',
      kind: 'import',
      file: 'src/app.py',
      line: 2,
      target: null,
    });
    expect(refs).toContainEqual({
      symbol: 'http',
      kind: 'import',
      file: 'src/app.py',
      line: 3,
      target: null,
    });
    expect(refs).toContainEqual({
      symbol: 'a',
      kind: 'import',
      file: 'src/app.py',
      line: 4,
      target: null,
    });
    expect(refs).toContainEqual({
      symbol: 'b',
      kind: 'import',
      file: 'src/app.py',
      line: 4,
      target: null,
    });
    expect(refs).toContainEqual({
      symbol: 'dumps',
      kind: 'import',
      file: 'src/app.py',
      line: 5,
      target: null,
    });
    expect(refs).toContainEqual({
      symbol: 'parse',
      kind: 'import',
      file: 'src/app.py',
      line: 5,
      target: null,
    });
  });

  it('indexes from-imports: relative, starred and parenthesized', async () => {
    const refs = await indexOf({
      'src/mod.py': [
        'from . import utils',
        'from .models import User as Account',
        'from collections import *',
        'from typing import (',
        '  List,',
        '  Dict as Mapping,',
        ')',
        '# import ignored_comment',
      ].join('\n'),
    });
    expect(refs).toContainEqual({
      symbol: 'utils',
      kind: 'import',
      file: 'src/mod.py',
      line: 1,
      target: null,
    });
    expect(refs).toContainEqual({
      symbol: 'Account',
      kind: 'import',
      file: 'src/mod.py',
      line: 2,
      target: null,
    });
    expect(refs).toContainEqual({
      symbol: '*',
      kind: 'import',
      file: 'src/mod.py',
      line: 3,
      target: null,
    });
    expect(refs).toContainEqual({
      symbol: 'List',
      kind: 'import',
      file: 'src/mod.py',
      line: 4,
      target: null,
    });
    expect(refs).toContainEqual({
      symbol: 'Mapping',
      kind: 'import',
      file: 'src/mod.py',
      line: 4,
      target: null,
    });
    expect(refs.some((r) => r.symbol === 'ignored_comment')).toBe(false);
  });
});

describe('symbolIndex.index() — go', () => {
  it('indexes single imports with base-name and alias symbols', async () => {
    const refs = await indexOf({
      'main.go': [
        'import "fmt"',
        'import "net/http"',
        'import r "math/rand"',
        'import . "github.com/example/dot"',
        'import _ "github.com/example/blank"',
      ].join('\n'),
    });
    expect(refs).toContainEqual({
      symbol: 'fmt',
      kind: 'import',
      file: 'main.go',
      line: 1,
      target: 'fmt',
    });
    expect(refs).toContainEqual({
      symbol: 'http',
      kind: 'import',
      file: 'main.go',
      line: 2,
      target: 'net/http',
    });
    expect(refs).toContainEqual({
      symbol: 'r',
      kind: 'import',
      file: 'main.go',
      line: 3,
      target: 'math/rand',
    });
    expect(refs).toContainEqual({
      symbol: '.',
      kind: 'import',
      file: 'main.go',
      line: 4,
      target: 'github.com/example/dot',
    });
    expect(refs).toContainEqual({
      symbol: '_',
      kind: 'import',
      file: 'main.go',
      line: 5,
      target: 'github.com/example/blank',
    });
  });

  it('indexes grouped multi-line imports', async () => {
    const refs = await indexOf({
      'server.go': [
        'import (',
        '\t"strings"',
        '\t"os"',
        '\tlog "log/slog"',
        ')',
        'import ( "bytes" )',
      ].join('\n'),
    });
    expect(refs).toContainEqual({
      symbol: 'strings',
      kind: 'import',
      file: 'server.go',
      line: 1,
      target: 'strings',
    });
    expect(refs).toContainEqual({
      symbol: 'os',
      kind: 'import',
      file: 'server.go',
      line: 1,
      target: 'os',
    });
    expect(refs).toContainEqual({
      symbol: 'log',
      kind: 'import',
      file: 'server.go',
      line: 1,
      target: 'log/slog',
    });
    expect(refs).toContainEqual({
      symbol: 'bytes',
      kind: 'import',
      file: 'server.go',
      line: 6,
      target: 'bytes',
    });
  });

  it('skips go comments', async () => {
    const refs = await indexOf({ 'x.go': '// import "ghost"\nimport "fmt"' });
    expect(refs.some((r) => r.symbol === 'ghost')).toBe(false);
    expect(refs).toHaveLength(1);
  });
});

describe('symbolIndex.index() — ordering and scope', () => {
  it('sorts by symbol asc, then file asc, then line asc', async () => {
    const refs = await indexOf({
      'z-lib.ts': "import zed from 'z';\nimport alpha from 'a';",
      'a-lib.ts': "import alpha from 'a';",
    });
    const symbols = refs.map((r) => r.symbol);
    expect(symbols).toEqual(['alpha', 'alpha', 'zed']);
    expect(refs[0]).toMatchObject({ file: 'a-lib.ts' });
    expect(refs[1]).toMatchObject({ file: 'z-lib.ts' });
    expect(refs[2]).toMatchObject({ file: 'z-lib.ts', line: 1 });
  });

  it('ignores unknown extensions and empty inputs', async () => {
    const refs = await indexOf({ 'notes.txt': 'import evil from "evil"' });
    expect(refs).toHaveLength(0);
    expect(await symbolIndex.index(new Map())).toEqual([]);
  });

  it('is deterministic across repeated calls', async () => {
    const files: Record<string, string> = {
      'app.ts': "import x from './x.js';\nexport const y = 2;",
      'app.py': 'import os\nfrom json import loads',
      'app.go': 'import (\n "fmt"\n "os"\n)',
    };
    const a = await indexOf(files);
    const b = await indexOf(files);
    expect(a).toEqual(b);
  });
});
