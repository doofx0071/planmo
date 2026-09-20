import { describe, expect, it } from 'vitest';
import { WorkPacketSchema } from '@planmo/schema';
import { createTaskDag } from './task-dag.js';
import { packetCompiler } from './packets.js';
import type { TaskNode } from './contracts.js';

/** Helper: build a TaskNode; dependencies key omitted when empty (eOPT). */
const task = (
  id: string,
  status: TaskNode['status'],
  dependencies?: readonly string[],
): TaskNode => (dependencies === undefined ? { id, status } : { id, status, dependencies });

describe('createTaskDag (P08-06)', () => {
  const dag = createTaskDag();

  describe('cycles', () => {
    it('detects a 3-node cycle and returns the involved task ids (sorted)', () => {
      const nodes = [task('a', 'TODO', ['b']), task('b', 'TODO', ['c']), task('c', 'TODO', ['a'])];
      expect(dag.cycles(nodes)).toEqual(['a', 'b', 'c']);
    });

    it('returns the same cycle ids regardless of input order', () => {
      const shuffled = [
        task('c', 'TODO', ['a']),
        task('a', 'TODO', ['b']),
        task('b', 'TODO', ['c']),
      ];
      expect(dag.cycles(shuffled)).toEqual(['a', 'b', 'c']);
    });

    it('returns empty for an acyclic graph', () => {
      const nodes = [task('a', 'TODO'), task('b', 'TODO', ['a']), task('c', 'TODO', ['b'])];
      expect(dag.cycles(nodes)).toEqual([]);
    });

    it('detects a self-loop', () => {
      expect(dag.cycles([task('a', 'TODO', ['a'])])).toEqual(['a']);
    });

    it('ignores missing dependency references (no synthetic cycle)', () => {
      const nodes = [task('a', 'TODO', ['ghost']), task('b', 'TODO', ['a'])];
      expect(dag.cycles(nodes)).toEqual([]);
    });
  });

  describe('ready', () => {
    it('returns only tasks whose dependencies are all DONE', () => {
      const nodes = [task('a', 'DONE'), task('b', 'TODO', ['a'])];
      expect(dag.ready(nodes)).toEqual(['b']);
    });

    it('never returns a BLOCKED or DONE task', () => {
      const nodes = [task('a', 'DONE'), task('b', 'BLOCKED', ['a']), task('c', 'DONE', ['a'])];
      expect(dag.ready(nodes)).toEqual([]);
    });

    it('never returns a task with a missing dependency', () => {
      const nodes = [task('a', 'TODO', ['ghost']), task('b', 'DONE')];
      expect(dag.ready(nodes)).toEqual([]);
    });

    it('treats IN_PROGRESS and REVIEW as eligible once deps are done', () => {
      const nodes = [
        task('a', 'DONE'),
        task('b', 'IN_PROGRESS', ['a']),
        task('c', 'REVIEW', ['a']),
      ];
      expect(dag.ready(nodes)).toEqual(['b', 'c']);
    });

    it('holds back tasks with unfinished dependencies', () => {
      const nodes = [
        task('a', 'TODO', ['root']),
        task('root', 'TODO', ['base']),
        task('base', 'BLOCKED'),
      ];
      expect(dag.ready(nodes)).toEqual([]);
    });
  });

  describe('ordered', () => {
    it('emits a valid topological order: every dependency precedes its dependent', () => {
      const nodes = [
        task('c', 'TODO', ['b']),
        task('a', 'TODO'),
        task('d', 'TODO', ['c']),
        task('b', 'TODO', ['a']),
      ];
      const order = dag.ordered(nodes);
      expect(order.map((n) => n.id)).toEqual(['a', 'b', 'c', 'd']);
      const position = new Map(order.map((n, i) => [n.id, i]));
      for (const node of order) {
        for (const dep of node.dependencies ?? []) {
          const depAt = position.get(dep);
          expect(depAt).toBeDefined();
          expect(depAt ?? 0).toBeLessThan(position.get(node.id) ?? 0);
        }
      }
    });

    it('resolves equal-priority nodes alphabetically', () => {
      const nodes = [task('z', 'TODO'), task('a', 'TODO'), task('m', 'TODO', ['z'])];
      const order = dag.ordered(nodes);
      expect(order.map((n) => n.id)).toEqual(['a', 'z', 'm']);
    });

    it('is stable and deterministic for identical and shuffled input', () => {
      const base = [task('b', 'TODO', ['a']), task('a', 'TODO'), task('c', 'TODO', ['a'])];
      const shuffled = [task('c', 'TODO', ['a']), task('a', 'TODO'), task('b', 'TODO', ['a'])];
      const first = dag.ordered(base);
      expect(dag.ordered(base).map((n) => n.id)).toEqual(first.map((n) => n.id));
      expect(dag.ordered(shuffled).map((n) => n.id)).toEqual(first.map((n) => n.id));
    });

    it('never emits tasks blocked by missing deps or trapped in a cycle', () => {
      const nodes = [
        task('p', 'TODO', ['q']),
        task('q', 'TODO', ['p']),
        task('x', 'TODO'),
        task('y', 'TODO', ['x']),
        task('z', 'TODO', ['ghost']),
      ];
      const order = dag.ordered(nodes);
      expect(order.map((n) => n.id)).toEqual(['x', 'y']);
    });
  });
});

describe('packetCompiler (P08-04)', () => {
  const compiler = packetCompiler();

  it('rejects overlapping ownership and lists both owners in the message', () => {
    const input = {
      taskIds: ['P08-06', 'P08-04'],
      ownership: [
        { owner: 'worker-a', paths: ['packages/a/**'] },
        { owner: 'worker-b', paths: ['packages/a/b.ts'] },
      ],
    };
    expect(() => compiler.compile(input)).toThrow(/overlapping ownership claims/);
    expect(() => compiler.compile(input)).toThrow(/worker-a/);
    expect(() => compiler.compile(input)).toThrow(/worker-b/);
  });

  it('rejects identical paths claimed by two owners', () => {
    const input = {
      taskIds: ['P08-06'],
      ownership: [
        { owner: 'worker-a', paths: ['packages/shared/x.ts'] },
        { owner: 'worker-b', paths: ['packages/shared/x.ts'] },
      ],
    };
    expect(() => compiler.compile(input)).toThrow(/overlapping ownership claims/);
  });

  it('produces one schema-valid packet per task with sorted outputs for non-overlapping claims', () => {
    const packets = compiler.compile({
      taskIds: ['P08-06', 'P08-04'],
      ownership: [
        { owner: 'worker-a', paths: ['packages/a/z.ts', 'packages/a/a.ts'] },
        { owner: 'worker-b', paths: ['packages/b/**'] },
      ],
    });

    expect(packets.map((p) => p.id)).toEqual(['WP-P08-06', 'WP-P08-04']);
    expect(packets.map((p) => p.taskId)).toEqual(['P08-06', 'P08-04']);
    expect(packets.map((p) => p.assignee)).toEqual(['worker-a', 'worker-b']);
    expect(packets.every((p) => p.status === 'planned')).toBe(true);
    expect(packets.every((p) => p.dependencies.length === 0)).toBe(true);
    // Outputs: the i-th claim's own paths, sorted.
    expect(packets[0]?.outputs).toEqual(['packages/a/a.ts', 'packages/a/z.ts']);
    expect(packets[1]?.outputs).toEqual(['packages/b/**']);
    // Inputs: identical shared context — sorted union of ALL claimed paths.
    const shared = ['packages/a/a.ts', 'packages/a/z.ts', 'packages/b/**'];
    expect(packets[0]?.inputs).toEqual(shared);
    expect(packets[1]?.inputs).toEqual(shared);
    // Every packet is schema-valid by construction; double-check via parse.
    for (const packet of packets) {
      expect(() => WorkPacketSchema.parse(packet)).not.toThrow();
    }
  });

  it('prefixes titles deterministically and keeps packet ids unique', () => {
    const packets = compiler.compile({
      taskIds: ['P08-06', 'P08-04'],
      titlePrefix: 'Implement',
      ownership: [
        { owner: 'worker-a', paths: ['packages/a/**'] },
        { owner: 'worker-b', paths: ['packages/b/**'] },
      ],
    });
    expect(packets.map((p) => p.title)).toEqual(['Implement P08-06', 'Implement P08-04']);
    expect(new Set(packets.map((p) => p.id)).size).toBe(packets.length);
    expect(packets.map((p) => p.scope)).toEqual(['Own P08-06', 'Own P08-04']);
  });
});
