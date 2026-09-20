import type { MotionProfile } from '@planmo/schema';
import type { DtcToken, DtcTokenEngine, TokenValidationDiagnostic, TokenValue } from './contracts.js';

/**
 * DTCG token engine (P07-02).
 *
 * Canonical tokens use the DTCG token model (ADR-0003); framework outputs
 * (Tailwind/CSS/shadcn) are adapters. This engine owns the canonical core:
 * alias resolution, validation (missing refs, cycles, invalid unit/value
 * combos, duplicates) and deterministic DTCG JSON emission. PURE.
 */

const ALIAS_RE = /^\{([^}]+)\}$/;

/** Collect every token name in a set in deterministic order. */
export function names(tokens: readonly DtcToken[]): string[] {
  return [...new Set(tokens.map((t) => t.name))].sort();
}

/** True when the value is a `{alias}` reference. */
export function isAlias(value: TokenValue): value is string {
  return typeof value === 'string' && ALIAS_RE.test(value);
}

export function aliasTarget(value: string): string {
  const m = ALIAS_RE.exec(value);
  return m?.[1] ?? '';
}

/** Find a token by exact name or alias reference; undefined when unknown. */
export function findToken(
  name: string,
  tokens: readonly DtcToken[],
): DtcToken | undefined {
  return tokens.find((t) => t.name === name);
}

export const dtcTokenEngine: DtcTokenEngine = {
  resolve(nameOrRef, tokens) {
    const target = isAlias(nameOrRef) ? aliasTarget(nameOrRef) : nameOrRef;
    return findToken(target, tokens);
  },

  validate(tokens, context) {
    const diagnostics: TokenValidationDiagnostic[] = [];
    const byName = new Map<string, DtcToken>();
    for (const token of tokens) {
      if (byName.has(token.name)) {
        diagnostics.push({
          code: 'duplicate-name',
          token: token.name,
          message: `duplicate token name "${token.name}"`,
        });
      }
      byName.set(token.name, token);
    }

    for (const token of tokens) {
      const issue = validateValue(token.$value);
      if (issue) {
        diagnostics.push({ code: 'invalid-value', token: token.name, message: issue });
      }
      if (typeof token.$value === 'string' && isAlias(token.$value)) {
        const target = aliasTarget(token.$value);
        if (!byName.has(target)) {
          diagnostics.push({
            code: 'missing-reference',
            token: token.name,
            message: `token "${token.name}" references missing token "{${target}}"`,
          });
        }
      }
    }

    // Cycle detection: walk alias chains; any revisit = cycle.
    for (const token of tokens) {
      if (typeof token.$value !== 'string' || !isAlias(token.$value)) continue;
      const visited = new Set<string>([token.name]);
      let current: DtcToken | undefined = token;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const value = current?.$value;
        if (typeof value !== 'string' || !isAlias(value)) break;
        const target = aliasTarget(value);
        const next = byName.get(target);
        if (!next) break; // already reported as missing-reference
        if (visited.has(next.name)) {
          diagnostics.push({
            code: 'cycle',
            token: token.name,
            message: `alias cycle detected via "{${target}}" starting at "${token.name}"`,
          });
          break;
        }
        visited.add(next.name);
        current = next;
      }
    }

    // Motion profile cross-check: reduced-motion tokens must exist when the
    // profile demands it (see accessibility-and-motion.md).
    if (context.motion === 'cinematic' && !byName.has('motion.cinematic')) {
      diagnostics.push({
        code: 'invalid-value',
        token: 'motion.cinematic',
        message: 'cinematic motion profile requires a motion.cinematic token',
      });
    }
    if (context.motion === 'expressive' && !byName.has('motion.express')) {
      diagnostics.push({
        code: 'invalid-value',
        token: 'motion.express',
        message: 'expressive motion profile requires a motion.express token',
      });
    }

    return [...diagnostics].sort((a, b) =>
      a.token === b.token ? a.code.localeCompare(b.code) : a.token.localeCompare(b.token),
    );
  },

  emit(tokens) {
    const sorted = [...tokens].sort((a, b) => a.name.localeCompare(b.name));
    const doc: Record<string, unknown> = {
      $schema: 'https://design-tokens.github.io/community-group/format/',
    };
    for (const token of sorted) {
      const { name, $type, $value } = token;
      const entry: Record<string, unknown> = {};
      if ($type !== undefined) entry.$type = $type;
      entry.$value = $value;
      setPath(doc, name, entry);
    }
    return `${JSON.stringify(doc, null, 2)}\n`;
  },
};

/** Insert a dotted-path token into the DTCG document (nested groups). */
function setPath(doc: Record<string, unknown>, path: string, entry: Record<string, unknown>): void {
  const parts = path.split('.');
  let cursor = doc;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const part = parts[i] ?? '';
    const existing = cursor[part];
    if (existing === undefined || typeof existing !== 'object' || Array.isArray(existing)) {
      const next: Record<string, unknown> = {};
      cursor[part] = next;
      cursor = next;
    } else {
      cursor = existing as Record<string, unknown>;
    }
  }
  const last = parts[parts.length - 1] ?? '';
  cursor[last] = entry;
}

/** Value-shape validation: warn on impossible units/values. */
function validateValue(value: TokenValue): string | undefined {
  if (typeof value === 'string') {
    // Dimension-like with a number: reject missing unit except 0.
    if (/^\d+(\.\d+)?$/.test(value) && value !== '0') {
      return `dimension "${value}" must carry a unit (e.g. "16px" or "0")`;
    }
    if (/^\{\}$/.test(value)) return 'empty alias reference';
    return undefined;
  }
  if (typeof value === 'number') {
    if (Number.isNaN(value)) return 'NaN is not a valid token value';
    return undefined;
  }
  return undefined;
}