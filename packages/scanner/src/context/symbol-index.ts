import type { SymbolIndexEngine, SymbolReference } from '../contracts.js';

/**
 * Symbol/reference index (P10-07, CHG-001).
 *
 * Parser-lite over TEXT ONLY (pure, deterministic): JS/TS static
 * import/export/require lines, python import/from-import lines and go import
 * lines (single and grouped). Emits `{symbol, kind, file, line, target|null}`
 * sorted by symbol asc, then file asc, then line asc.
 *
 * Conventions (documented so tests and consumers share the semantics):
 * - type-only imports (`import type …`, `{ type A }`) count as imports;
 * - `* as ns` emits the namespace alias; `import x` emits the default binding;
 * - named braces emit each local binding (aliases emit the alias);
 * - `require('x')` bound to a variable emits `kind: 'require'` with the
 *   variable (or member for `require('x').y`); bare side-effect
 *   imports/requires emit `kind: 'reference'` with the module specifier;
 * - `export { a, b as c }` emits the exported names (alias c); re-exports
 *   carry the `from` module as target; `export * from` emits symbol `'*'`;
 * - `export const x = …` / `export function f` / `export default …` emit the
 *   declared name (anonymous default emits `'default'`);
 * - python names: first segment for `import a.b`, alias for `as`, `'*'` for
 *   star imports; targets are null (module resolution needs the interpreter);
 * - go: symbol is the last path segment (or alias / `.` / `_`), target is the
 *   exact import path — go module paths are statically resolvable.
 * - single-line comment lines (`//`, block-comment openers) are skipped.
 *
 * Known parser-lite blind spots (acceptable per the contract): dynamic
 * `import()` calls, destructured `require()` bindings, and block comments
 * spanning multiple lines are not modeled.
 */

type Ref = SymbolReference;

const JS_EXTENSIONS = new Set(['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.mts', '.cts']);
const PYTHON_EXTENSIONS = new Set(['.py']);
const GO_EXTENSIONS = new Set(['.go']);

const IDENTIFIER = '[A-Za-z_$][A-Za-z0-9_$]*';

function compareAsc(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function extensionOf(path: string): string {
  const slash = path.lastIndexOf('/');
  const dot = path.lastIndexOf('.');
  return dot > slash ? path.slice(dot).toLowerCase() : '';
}

export const symbolIndex: SymbolIndexEngine = Object.freeze({
  name: 'symbol-index',
  async index(files: ReadonlyMap<string, string>): Promise<readonly SymbolReference[]> {
    const refs: Ref[] = [];
    for (const [path, text] of files) {
      const ext = extensionOf(path);
      if (JS_EXTENSIONS.has(ext)) indexJsFile(path, text, refs);
      else if (PYTHON_EXTENSIONS.has(ext)) indexPythonFile(path, text, refs);
      else if (GO_EXTENSIONS.has(ext)) indexGoFile(path, text, refs);
    }
    refs.sort(
      (a, b) => compareAsc(a.symbol, b.symbol) || compareAsc(a.file, b.file) || a.line - b.line,
    );
    return refs;
  },
});

// ---------------------------------------------------------------------------
// JS/TS
// ---------------------------------------------------------------------------

function isCommentLine(line: string): boolean {
  return /^(\/\/|\/\*|\*)/.test(line.trim());
}

function isCompleteJsStatement(stmt: string): boolean {
  let braces = 0;
  for (const ch of stmt) {
    if (ch === '{') braces++;
    else if (ch === '}') braces--;
  }
  if (braces > 0) return false;
  return /(?:from\s+['"][^'"]+['"]|;|})\s*$/.test(stmt.trim());
}

/** `export { … }` may continue with `from '…'` on the very next line. */
function continuesWithFrom(stmt: string, nextLine: string): boolean {
  return /}\s*$/.test(stmt.trim()) && /^from\b/.test(nextLine.trim());
}

function indexJsFile(path: string, text: string, out: Ref[]): void {
  const lines = text.split('\n');
  let i = 0;
  while (i < lines.length) {
    const trimmed = lines[i]!.trim();
    if (trimmed === '' || isCommentLine(lines[i]!)) {
      i++;
      continue;
    }
    if (/^(import|export)\b/.test(trimmed)) {
      let stmt = lines[i]!;
      const startLine = i + 1;
      let j = i + 1;
      while (j < lines.length) {
        if (continuesWithFrom(stmt, lines[j]!)) {
          stmt += '\n' + lines[j]!;
          j++;
          continue;
        }
        // `…} from` with the quoted specifier on the next line
        if (/from\s*$/.test(stmt.trim())) {
          stmt += '\n' + lines[j]!;
          j++;
          continue;
        }
        if (parseJsStatement(path, stmt, startLine).length > 0) break;
        if (isCompleteJsStatement(stmt)) break;
        stmt += '\n' + lines[j]!;
        j++;
      }
      for (const ref of parseJsStatement(path, stmt, startLine)) out.push(ref);
      i = j;
      continue;
    }
    parseJsRequireLine(path, lines[i]!, i + 1, out);
    i++;
  }
}

function parseJsStatement(path: string, stmt: string, line: number): Ref[] {
  const s = stmt.trim().replace(/;\s*$/, '');
  if (s.startsWith('import')) return parseJsImport(path, s, line);
  if (s.startsWith('export')) return parseJsExport(path, s, line);
  return [];
}

function parseJsImport(path: string, s: string, line: number): Ref[] {
  const out: Ref[] = [];
  // type-only imports are counted as imports (contract)
  const body = s.replace(/^import\s+type\b/, 'import').trim();
  const fromMatch = /\bfrom\s+['"]([^'"]+)['"]/.exec(body);
  if (fromMatch === null) {
    // side-effect import: `import 'mod'`
    const side = /^import\s+['"]([^'"]+)['"]$/.exec(body);
    if (side !== null)
      out.push({ symbol: side[1]!, kind: 'reference', file: path, line, target: side[1]! });
    return out;
  }
  const spec = fromMatch[1]!;
  let clause = body
    .slice(0, fromMatch.index)
    .replace(/^import\s+/, '')
    .trim();
  const braces = /\{([^}]*)\}/.exec(clause);
  if (braces !== null) {
    splitNamedList(braces[1]!, path, line, 'import', spec, out);
    clause = clause.replace(braces[0], '').replace(/,\s*$/, '').trim();
  }
  if (clause === '') return out;
  const namespace = new RegExp(`\\*\\s*as\\s+(${IDENTIFIER})`).exec(clause);
  if (namespace !== null)
    out.push({ symbol: namespace[1]!, kind: 'import', file: path, line, target: spec });
  const withoutNamespace = clause
    .replace(new RegExp(`\\*\\s*as\\s+${IDENTIFIER}`), '')
    .replace(/,\s*$/, '')
    .trim();
  if (withoutNamespace !== '') {
    const def = new RegExp(`^(${IDENTIFIER})`).exec(withoutNamespace);
    if (def !== null) out.push({ symbol: def[1]!, kind: 'import', file: path, line, target: spec });
  }
  return out;
}

function parseJsExport(path: string, s: string, line: number): Ref[] {
  const out: Ref[] = [];
  const body = s.replace(/^export\s+/, '').trim();

  // re-export with a `from` specifier ([\s\S] crosses the multi-line body)
  const fromRe = /^(?:type\s+)?([\s\S]*?)\s+from\s+['"]([^'"]+)['"]$/.exec(body);
  if (fromRe !== null) {
    const spec = fromRe[2]!;
    const lhs = fromRe[1]!.trim();
    if (lhs === '*') {
      out.push({ symbol: '*', kind: 'export', file: path, line, target: spec });
      return out;
    }
    const namespace = new RegExp(`^\\*\\s*as\\s+(${IDENTIFIER})$`).exec(lhs);
    if (namespace !== null) {
      out.push({ symbol: namespace[1]!, kind: 'export', file: path, line, target: spec });
      return out;
    }
    const braces = /\{([^}]*)\}/.exec(lhs);
    if (braces !== null) splitNamedList(braces[1]!, path, line, 'export', spec, out);
    return out;
  }

  // local export braces: `export { a, b as c }` (only when the body STARTS with `{`,
  // so `export function f() {}` bodies never count)
  const braces = body.startsWith('{') ? /\{([^}]*)\}/.exec(body) : null;
  if (braces !== null && !body.startsWith('default')) {
    splitNamedList(braces[1]!, path, line, 'export', null, out);
    return out;
  }

  // declarations: `export const x = …`, `export function f() {}`, `export default class C`, …
  const decl = new RegExp(
    `^(?:default\\s+)?(?:abstract\\s+|async\\s+|declare\\s+)*(?:class|function|interface|type|enum|const|let|var|namespace|module)\\s+(${IDENTIFIER})`,
  ).exec(body);
  if (decl !== null) {
    out.push({ symbol: decl[1]!, kind: 'export', file: path, line, target: null });
    return out;
  }
  // anonymous default export (`export default foo;` / `export default function () {}`)
  if (body.startsWith('default'))
    out.push({ symbol: 'default', kind: 'export', file: path, line, target: null });
  return out;
}

/** Parse `{ a, b as c, type D }`-style lists; aliases and inline `type` resolve to the local name. */
function splitNamedList(
  raw: string,
  path: string,
  line: number,
  kind: 'import' | 'export',
  target: string | null,
  out: Ref[],
): void {
  for (const item of raw.split(',')) {
    const name = item.trim();
    if (name === '') continue;
    if (name === '*') {
      out.push({ symbol: '*', kind, file: path, line, target });
      continue;
    }
    const as = new RegExp(`\\bas\\s+(${IDENTIFIER})$`).exec(name);
    const symbol = as !== null ? as[1]! : name.replace(/^type\s+/, '').trim();
    if (symbol !== '') out.push({ symbol, kind, file: path, line, target });
  }
}

function parseJsRequireLine(path: string, line: string, lineNo: number, out: Ref[]): void {
  const t = line.trim();
  if (t === '' || isCommentLine(line)) return;
  // bound form: `const x = require('m')` or `const y = require('m').y`
  const bound = new RegExp(
    `^(?:const|let|var)\\s+(${IDENTIFIER})\\s*=\\s*require\\(\\s*['"]([^'"]+)['"]\\s*\\)(?:\\.(${IDENTIFIER}))?`,
  ).exec(t);
  if (bound !== null) {
    out.push({
      symbol: bound[3] !== undefined ? bound[3]! : bound[1]!,
      kind: 'require',
      file: path,
      line: lineNo,
      target: bound[2]!,
    });
    return;
  }
  // bare form: `require('m')` or `require('m').y` — a side-effect reference
  const bare = new RegExp(
    `^require\\(\\s*['"]([^'"]+)['"]\\s*\\)(?:\\.${IDENTIFIER})?\\s*;?$`,
  ).exec(t);
  if (bare !== null)
    out.push({ symbol: bare[1]!, kind: 'reference', file: path, line: lineNo, target: bare[1]! });
}

// ---------------------------------------------------------------------------
// Python
// ---------------------------------------------------------------------------

function emitPythonNames(names: readonly string[], path: string, line: number, out: Ref[]): void {
  for (const name of names) {
    if (name === '*') {
      out.push({ symbol: '*', kind: 'import', file: path, line, target: null });
      continue;
    }
    const as = /^[^\s]+\s+as\s+([A-Za-z_][A-Za-z0-9_]*)$/.exec(name);
    out.push({
      symbol: as !== null ? as[1]! : name,
      kind: 'import',
      file: path,
      line,
      target: null,
    });
  }
}

function indexPythonFile(path: string, text: string, out: Ref[]): void {
  const lines = text.split('\n');
  let pending: { start: number; names: string[] } | null = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const trimmed = line.trim();
    if (pending !== null) {
      for (const raw of trimmed.split(',')) {
        const name = raw.trim().replace(/\)$/, '');
        if (name !== '') pending.names.push(name);
      }
      if (trimmed.includes(')')) {
        emitPythonNames(pending.names, path, pending.start, out);
        pending = null;
      }
      continue;
    }
    if (trimmed === '' || trimmed.startsWith('#')) continue;
    // multi-line parenthesized from-import
    if (/^from\s+[^ ]+\s+import\s*\($/.test(trimmed)) {
      pending = { start: i + 1, names: [] };
      continue;
    }
    const fromMatch = /^from\s+([^ ]+)\s+import\s+(.+)$/.exec(trimmed);
    if (fromMatch !== null) {
      const list = fromMatch[2]!.trim();
      const inside = list.startsWith('(') && list.endsWith(')') ? list.slice(1, -1) : list;
      const names = inside
        .split(',')
        .map((raw) => raw.trim())
        .filter((raw) => raw !== '');
      emitPythonNames(names, path, i + 1, out);
      continue;
    }
    const importMatch = /^import\s+(.+)$/.exec(trimmed);
    if (importMatch !== null) {
      for (const raw of importMatch[1]!.split(',')) {
        const name = raw.trim();
        if (name === '') continue;
        const as = /^([^\s]+)\s+as\s+([A-Za-z_][A-Za-z0-9_]*)$/.exec(name);
        // `import a.b` binds `a`; `import a as z` binds `z`
        out.push({
          symbol: as !== null ? as[2]! : name.split('.')[0]!,
          kind: 'import',
          file: path,
          line: i + 1,
          target: null,
        });
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Go
// ---------------------------------------------------------------------------

function goBaseName(importPath: string): string {
  const base = importPath.split('/').pop()!;
  return base === '' ? importPath : base;
}

/** Token-scan fragments like `"path"`, `alias "path"`, `. "path"`, `_ "path"`. */
function emitGoTokens(text: string, path: string, line: number, out: Ref[]): void {
  const re = /(?:([\w.]+|[._])\s+)?['"]([^'"]+)['"]/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const alias = match[1] !== undefined ? match[1]! : '';
    const importPath = match[2]!;
    out.push({
      symbol: alias !== '' ? alias : goBaseName(importPath),
      kind: 'import',
      file: path,
      line,
      target: importPath,
    });
  }
}

function indexGoFile(path: string, text: string, out: Ref[]): void {
  const lines = text.split('\n');
  let i = 0;
  while (i < lines.length) {
    const trimmed = lines[i]!.trim();
    if (trimmed === '' || trimmed.startsWith('//')) {
      i++;
      continue;
    }
    if (/^import\s*\(/.test(trimmed)) {
      let buffer = trimmed;
      let j = i + 1;
      while (parenBalance(buffer) > 0 && j < lines.length) {
        buffer += '\n' + lines[j]!;
        j++;
      }
      emitGoTokens(buffer, path, i + 1, out);
      i = j;
      continue;
    }
    const single = /^import\s+(.+)$/.exec(trimmed);
    if (single !== null) emitGoTokens(single[1]!, path, i + 1, out);
    i++;
  }
}

function parenBalance(text: string): number {
  let balance = 0;
  for (const ch of text) {
    if (ch === '(') balance++;
    else if (ch === ')') balance--;
  }
  return balance;
}
