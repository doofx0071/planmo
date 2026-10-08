/** Helpers shared by the workspace renderers. */
import type { PlanningIR } from '../ir.js';

/** Join lines and end with exactly one trailing newline. */
export function doc(lines: readonly string[]): string {
  return `${lines.join('\n').trimEnd()}\n`;
}

/** Human label for the project, used in prose. */
export function projectName(ir: PlanningIR): string {
  return ir.project.project.name;
}

/** `key: value` bullets for whichever stack keys the project declares. */
export function stackLines(ir: PlanningIR): string[] {
  const stack = ir.project.stack;
  if (!stack) return ['_No stack declared in `.planmo/project.yml`._'];
  const order = ['language', 'runtime', 'frontend', 'backend', 'database', 'test', 'ci'] as const;
  const lines: string[] = [];
  for (const key of order) {
    const value = stack[key];
    if (value !== undefined) lines.push(`- ${key}: ${value}`);
  }
  return lines.length > 0 ? lines : ['_No stack declared in `.planmo/project.yml`._'];
}

/** The declared design block, or null when the project has none. */
export function design(ir: PlanningIR): NonNullable<PlanningIR['project']['design']> | null {
  return ir.project.design ?? null;
}

/** Test gates: the profile's list, or the documented default. */
export function gates(ir: PlanningIR): readonly string[] {
  return ir.profile ? ir.profile.gates : ['unit tests', 'typecheck', 'lint', 'format:check'];
}
