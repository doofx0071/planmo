import type { StandardView } from '@planmo/adapters';
import type { StandardsInjector } from './providers.js';

/**
 * Standards Injector (P06-08, CHG-001 REQ-STD-001..004).
 *
 * Renders the selected standards into a deterministic, readable block the
 * adapter embeds in the agent prompt. Precedence-aware: rules are ordered by
 * precedence tier then id, matching the packs selection order semantics —
 * never inserted in arbitrary input order.
 */

const PRECEDENCE_RANK: Record<string, number> = {
  'explicit-project-policy': 0,
  'package-local': 1,
  project: 2,
  security: 3,
  'stack-framework': 4,
  language: 5,
  'global-default': 6,
};

function precedenceRank(precedence: string): number {
  return PRECEDENCE_RANK[precedence] ?? 100;
}

/** Deterministic order: precedence tier first, then id. */
function ordered(standards: readonly StandardView[]): StandardView[] {
  return [...standards].sort((a, b) => {
    const rankDiff = precedenceRank(a.precedence) - precedenceRank(b.precedence);
    if (rankDiff !== 0) return rankDiff;
    return a.id.localeCompare(b.id);
  });
}

/** Deterministic readable rendering of the selected standards. */
export function renderStandardsBlock(standards: readonly StandardView[]): string {
  if (standards.length === 0) {
    return '(no applicable standards)';
  }
  const lines: string[] = [];
  for (const standard of ordered(standards)) {
    lines.push(`- [${standard.precedence}] \`${standard.id}\`: ${standard.rule}`);
    if (standard.rationale !== undefined) {
      lines.push(`  rationale: ${standard.rationale}`);
    }
    if (standard.references !== undefined && standard.references.length > 0) {
      lines.push(`  references: ${[...standard.references].sort().join(', ')}`);
    }
  }
  return lines.join('\n');
}

/** Injected StandardsInjector implementation (pure + deterministic). */
export const standardsInjector: StandardsInjector = {
  render(standards: readonly StandardView[]): string {
    return renderStandardsBlock(standards);
  },
};
