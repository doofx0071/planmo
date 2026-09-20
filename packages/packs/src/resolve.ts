import { SemVerString } from '@planmo/schema';
import type { LoadedPack } from './loader.js';

/**
 * Deterministic pack resolution (P04-02).
 *
 * Given a catalog of loaded packs and a set of requested refs, resolves the
 * transitive closure of `requires`, detects conflicts, and returns packs in
 * a deterministic topological order (dependencies first; ties broken by
 * ref/version). Identical inputs ALWAYS produce byte-identical outputs.
 */

export interface ResolutionDiagnostic {
  /** Machine-readable code, e.g. "missing-requires". */
  code: 'unknown-ref' | 'missing-requires' | 'cycle' | 'capability-conflict' | 'duplicate-ref';
  /** Pack ref(s) involved. */
  refs: string[];
  /** Human-readable, actionable message. */
  message: string;
}

export interface ResolutionResult {
  /** Resolved packs in topological (dependency-first) order. */
  packs: LoadedPack[];
  /** Ordered refs of `packs`. */
  order: string[];
  /** Diagnostics; empty = clean resolution. */
  diagnostics: ResolutionDiagnostic[];
  /** True when the resolution is usable (no fatal errors). */
  ok: boolean;
}

/** Deterministic semver compare: returns <0, 0, >0. Pre-release sorts below release. */
export function compareSemVer(a: string, b: string): number {
  const parse = (v: string) => {
    const [core] = v.split('+');
    const [ver, pre] = (core ?? v).split('-');
    const parts = ver!.split('.').map((n) => Number(n));
    return { parts, pre: pre ?? null };
  };
  const A = parse(a);
  const B = parse(b);
  for (let i = 0; i < 3; i++) {
    const d = (A.parts[i] ?? 0) - (B.parts[i] ?? 0);
    if (d !== 0) return d;
  }
  if (A.pre === null && B.pre === null) return 0;
  if (A.pre === null) return 1;
  if (B.pre === null) return -1;
  return A.pre < B.pre ? -1 : A.pre > B.pre ? 1 : 0;
}

function isValidSemVer(v: string): boolean {
  return SemVerString.safeParse(v).success;
}

/**
 * Resolve a catalog + requested refs deterministically.
 * `catalog` may contain multiple versions of the same ref; the highest
 * valid version wins (deterministic tie-break on version, then ref).
 */
export function resolvePacks(catalog: LoadedPack[], requestedRefs: string[]): ResolutionResult {
  const diagnostics: ResolutionDiagnostic[] = [];

  // Group by ref; pick highest valid version per ref.
  const byRef = new Map<string, LoadedPack>();
  for (const pack of catalog) {
    const ref = pack.document.ref;
    const existing = byRef.get(ref);
    if (!existing) {
      byRef.set(ref, pack);
      continue;
    }
    const existingValid = isValidSemVer(existing.document.version);
    const nextValid = isValidSemVer(pack.document.version);
    if (!existingValid && nextValid) {
      byRef.set(ref, pack);
      continue;
    }
    if (
      existingValid &&
      nextValid &&
      compareSemVer(pack.document.version, existing.document.version) > 0
    ) {
      byRef.set(ref, pack);
      continue;
    }
    diagnostics.push({
      code: 'duplicate-ref',
      refs: [ref],
      message: `pack ${ref} appears ${existing.document.version} and ${pack.document.version}; keeping ${byRef.get(ref)!.document.version}`,
    });
  }

  // Resolve closure with three-color DFS for cycle detection. Deterministic:
  // walk requested refs in caller order, each pack's `requires` in declared order.
  const visiting = new Set<string>();
  const path: string[] = [];
  const done = new Set<string>();
  const resolved = new Map<string, LoadedPack>();
  const cycleSet = new Set<string>(); // refs known to participate in a cycle
  const missing = new Set<string>();

  function visit(ref: string): void {
    if (done.has(ref)) return;
    const pack = byRef.get(ref);
    if (!pack) {
      if (!missing.has(ref)) {
        missing.add(ref);
        diagnostics.push({
          code: 'unknown-ref',
          refs: [ref],
          message: `requested or required pack "${ref}" is not in the catalog`,
        });
      }
      return;
    }
    if (visiting.has(ref)) {
      // Found a cycle: everything from `ref` to the top of the path.
      const start = path.indexOf(ref);
      const cycle = [...path.slice(start), ref];
      const key = cycle.join('->');
      if (!cycleSet.has(key)) {
        cycleSet.add(key);
        for (const c of cycle) cycleSet.add(c);
        diagnostics.push({
          code: 'cycle',
          refs: [...cycle],
          message: `pack dependency cycle detected: ${cycle.join(' -> ')}`,
        });
      }
      return;
    }
    visiting.add(ref);
    path.push(ref);
    for (const req of pack.document.requires) {
      visit(req);
    }
    path.pop();
    visiting.delete(ref);
    done.add(ref);
    if (!cycleSet.has(ref)) {
      resolved.set(ref, pack);
    }
  }

  for (const ref of requestedRefs) {
    visit(ref);
  }

  // Capability conflicts: two different packs providing the SAME capability
  // with different content → compatibility conflict (actionable).
  const capabilityOwners = new Map<string, LoadedPack[]>();
  for (const pack of resolved.values()) {
    for (const cap of pack.document.provides) {
      const owners = capabilityOwners.get(cap) ?? [];
      owners.push(pack);
      capabilityOwners.set(cap, owners);
    }
  }
  for (const [cap, owners] of [...capabilityOwners.entries()].sort()) {
    const uniqueDigests = new Set(owners.map((o) => o.integritySha256));
    if (owners.length > 1 && uniqueDigests.size > 1) {
      diagnostics.push({
        code: 'capability-conflict',
        refs: owners.map((o) => `${o.document.ref}@${o.document.version}`),
        message: `capability "${cap}" provided by multiple distinct packs: ${owners
          .map((o) => `${o.document.ref}@${o.document.version}`)
          .join(', ')}`,
      });
    }
  }

  // Missing requires inside the resolved closure (requested+requires).
  for (const pack of resolved.values()) {
    for (const req of pack.document.requires) {
      if (!byRef.has(req)) {
        diagnostics.push({
          code: 'missing-requires',
          refs: [pack.document.ref, req],
          message: `pack ${pack.document.ref} requires "${req}" which is not in the catalog`,
        });
      }
    }
  }

  // Topological order (Kahn with deterministic min-heap by ref).
  const indegree = new Map<string, number>();
  const dependents = new Map<string, string[]>();
  for (const ref of resolved.keys()) {
    indegree.set(ref, 0);
    dependents.set(ref, []);
  }
  for (const pack of resolved.values()) {
    for (const req of pack.document.requires) {
      if (resolved.has(req)) {
        indegree.set(pack.document.ref, (indegree.get(pack.document.ref) ?? 0) + 1);
        const list = dependents.get(req) ?? [];
        list.push(pack.document.ref);
        dependents.set(req, list);
      }
    }
  }
  const ready: string[] = [...indegree.entries()]
    .filter(([, d]) => d === 0)
    .map(([r]) => r)
    .sort();
  const order: string[] = [];
  while (ready.length > 0) {
    const ref = ready.shift()!;
    order.push(ref);
    const deps = (dependents.get(ref) ?? []).sort();
    for (const dep of deps) {
      const d = (indegree.get(dep) ?? 0) - 1;
      indegree.set(dep, d);
      if (d === 0) {
        ready.push(dep);
        ready.sort();
      }
    }
  }
  // Cycle members never reach indegree 0 — append sorted by ref (total order;
  // caller decides whether the result is usable).
  for (const ref of [...resolved.keys()].sort()) {
    if (!order.includes(ref)) {
      order.push(ref);
    }
  }

  const packs = order
    .map((ref) => resolved.get(ref)!)
    .filter((p): p is LoadedPack => p !== undefined);
  const ok = diagnostics.every(
    (d) =>
      d.code !== 'cycle' &&
      d.code !== 'capability-conflict' &&
      d.code !== 'unknown-ref' &&
      d.code !== 'missing-requires',
  );

  return { packs, order, diagnostics, ok };
}

/**
 * Deterministic fingerprint of a resolution: refs, versions, and integrity
 * digests in topological order. Identical inputs → identical fingerprint.
 */
export function resolutionFingerprint(result: ResolutionResult): string {
  return result.packs
    .map((p) => `${p.document.ref}@${p.document.version}#${p.integritySha256}`)
    .join(';');
}
