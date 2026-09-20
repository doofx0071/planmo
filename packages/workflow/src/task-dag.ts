import type { TaskDag, TaskNode } from './contracts.js';

/**
 * Task DAG / ready computation (P08-06, CHG-001).
 *
 * Explicit dependency graph over flat task descriptors:
 * - `cycles`  — DFS with visited/in-stack tracking; returns the set of task
 *   ids that lie on at least one cycle (sorted; empty = acyclic).
 * - `ready`   — tasks whose dependencies are ALL DONE and whose own status
 *   allows work (TODO/IN_PROGRESS/REVIEW). BLOCKED is never ready, and a
 *   dependency referencing a task id absent from the graph is never
 *   satisfied, so such tasks are simply not ready.
 * - `ordered` — Kahn's algorithm with a priority queue keyed by task id:
 *   equal-priority nodes resolve alphabetically, so the order is stable and
 *   deterministic for identical input. Tasks blocked by a missing dependency
 *   or trapped in a cycle are never emitted.
 *
 * PURE + deterministic: no time, no randomness, no I/O. Every returned array
 * is sorted or emitted in a fixed deterministic order.
 */

/** Min-heap of task ids keyed by string order (deterministic priority queue). */
class MinIdHeap {
  private items: string[] = [];

  push(id: string): void {
    this.items.push(id);
    let index = this.items.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      const parentId = this.items[parent];
      const current = this.items[index];
      if (parentId === undefined || current === undefined || parentId <= current) break;
      this.items[parent] = current;
      this.items[index] = parentId;
      index = parent;
    }
  }

  pop(): string | undefined {
    const top = this.items[0];
    if (top === undefined) return undefined;
    const last = this.items.pop();
    if (this.items.length > 0 && last !== undefined) {
      this.items[0] = last;
      let index = 0;
      for (;;) {
        const left = 2 * index + 1;
        const right = 2 * index + 2;
        let smallest = index;
        const leftId = this.items[left];
        const rightId = this.items[right];
        const current = this.items[smallest];
        if (leftId !== undefined && current !== undefined && leftId < current) smallest = left;
        const newCurrent = this.items[smallest];
        if (rightId !== undefined && newCurrent !== undefined && rightId < newCurrent)
          smallest = right;
        if (smallest === index) break;
        const swap = this.items[index];
        this.items[index] = this.items[smallest] ?? '';
        this.items[smallest] = swap ?? '';
        index = smallest;
      }
    }
    return top;
  }

  get size(): number {
    return this.items.length;
  }
}

export function createTaskDag(): TaskDag {
  function indexById(nodes: readonly TaskNode[]): Map<string, TaskNode> {
    const byId = new Map<string, TaskNode>();
    for (const node of nodes) byId.set(node.id, node);
    return byId;
  }

  const dependenciesOf = (node: TaskNode | undefined): readonly string[] =>
    node?.dependencies ?? [];

  function cycles(nodes: readonly TaskNode[]): readonly string[] {
    const byId = indexById(nodes);
    const visited = new Set<string>();
    const inStack = new Set<string>();
    const stack: string[] = [];
    const onCycle = new Set<string>();

    function visit(id: string): void {
      if (visited.has(id)) return;
      visited.add(id);
      inStack.add(id);
      stack.push(id);
      const node = byId.get(id);
      for (const dep of dependenciesOf(node)) {
        // A missing dependency cannot close a cycle within this graph.
        if (!byId.has(dep)) continue;
        if (inStack.has(dep)) {
          // Back edge dep -> id: every task from dep up to id is on a cycle.
          const start = stack.indexOf(dep);
          for (let i = start; i < stack.length; i += 1) {
            const cycleId = stack[i];
            if (cycleId !== undefined) onCycle.add(cycleId);
          }
        } else if (!visited.has(dep)) {
          visit(dep);
        }
      }
      stack.pop();
      inStack.delete(id);
    }

    // Deterministic visit order independent of input ordering.
    for (const id of [...byId.keys()].sort()) visit(id);
    return [...onCycle].sort();
  }

  function ready(nodes: readonly TaskNode[]): readonly string[] {
    const byId = indexById(nodes);
    const readyIds: string[] = [];
    for (const node of nodes) {
      if (node.status === 'DONE' || node.status === 'BLOCKED') continue;
      // Unknown dependency ids are never satisfied (missing tasks block).
      const depsDone = dependenciesOf(node).every((dep) => byId.get(dep)?.status === 'DONE');
      if (depsDone) readyIds.push(node.id);
    }
    return readyIds.sort();
  }

  function ordered(nodes: readonly TaskNode[]): readonly TaskNode[] {
    const byId = indexById(nodes);
    const indegree = new Map<string, number>();
    const dependents = new Map<string, string[]>();
    const unsatisfiable = new Set<string>();

    for (const node of nodes) {
      const deps = dependenciesOf(node);
      if (!deps.every((dep) => byId.has(dep))) {
        // Missing dependency: can never satisfy "dep precedes dependent".
        unsatisfiable.add(node.id);
        continue;
      }
      indegree.set(node.id, deps.length);
      for (const dep of deps) {
        const list = dependents.get(dep) ?? [];
        list.push(node.id);
        dependents.set(dep, list);
      }
    }

    const pending = new MinIdHeap();
    for (const node of nodes) {
      if (!unsatisfiable.has(node.id) && (indegree.get(node.id) ?? 0) === 0) pending.push(node.id);
    }

    const order: TaskNode[] = [];
    while (pending.size > 0) {
      const id = pending.pop();
      if (id === undefined) break;
      const node = byId.get(id);
      if (node === undefined) continue;
      order.push(node);
      for (const dependent of dependents.get(id) ?? []) {
        const remaining = (indegree.get(dependent) ?? 0) - 1;
        indegree.set(dependent, remaining);
        if (remaining === 0) pending.push(dependent);
      }
    }
    return order;
  }

  return { cycles, ready, ordered };
}
