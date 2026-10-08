import type { PlanningIR } from '../ir.js';
import { design, doc, projectName } from './shared.js';

export function renderDesignBrief(ir: PlanningIR): string {
  const d = design(ir);
  const lines = [`# Design Brief — ${projectName(ir)}`, '', '## Direction', ''];
  if (d) {
    lines.push(
      `- Style: \`${d.style}\``,
      `- Density: \`${d.density}\``,
      `- Accessibility target: \`${d.accessibility}\``,
    );
    if (d.componentSystem) lines.push(`- Component system: \`${d.componentSystem}\``);
  } else {
    lines.push('_No design block is declared in `.planmo/project.yml`._');
  }
  lines.push(
    '',
    '## Principles',
    '',
    '1. Accessibility outranks visual style. A design that fails the target level is not finished.',
    '2. Structure before decoration: hierarchy, spacing and type carry the design.',
    '3. One accent, used sparingly. Restraint reads as intent.',
    '4. Motion is feedback, never decoration; it respects reduced-motion preferences.',
    '5. Every interactive element has a visible focus state.',
    '',
    '## Deliverables',
    '',
    '- The token set in `DESIGN-SYSTEM.md`, implemented as design tokens.',
    '- Components that compose from tokens, never from hard-coded values.',
    '- An accessibility check per screen at the declared target level.',
  );
  return doc(lines);
}

export function renderDesignSystem(ir: PlanningIR): string {
  const d = design(ir);
  const target = d?.accessibility ?? 'WCAG-2.2-AA';
  return doc([
    `# Design System — ${projectName(ir)}`,
    '',
    `Accessibility target: \`${target}\`.`,
    d ? `Density: \`${d.density}\`.` : '_Density is not declared._',
    '',
    '## Tokens',
    '',
    'Tokens are the only source of visual values. Components reference tokens;',
    'they never hard-code a colour, size or duration.',
    '',
    '| Group | Token | Value | Notes |',
    '|---|---|---|---|',
    '| Colour | `color.bg` | <value> | page background |',
    '| Colour | `color.fg` | <value> | primary text; must meet contrast at the target level |',
    '| Colour | `color.accent` | <value> | single accent, used sparingly |',
    '| Space | `space.1..n` | <scale> | one scale, no arbitrary values |',
    '| Type | `font.size.1..n` | <scale> | one scale, no arbitrary values |',
    '| Radius | `radius.control`, `radius.card` | <value> | consistent across controls |',
    '| Motion | `motion.fast`, `motion.base` | <ms> | must respect reduced motion |',
    '',
    '## Accessibility requirements',
    '',
    `- Meet \`${target}\` for every screen.`,
    '- Text meets the contrast ratio required by the target level.',
    '- Every control is reachable and operable by keyboard.',
    '- Focus is always visible and never removed without an equivalent.',
    '- Motion honours `prefers-reduced-motion`.',
    '- Meaning is never carried by colour alone.',
    '',
    '## Rules',
    '',
    '- A value that appears twice is a token that is missing.',
    '- A component that hard-codes a visual value does not pass review.',
    '- Design choices are structured tokens and profiles, not prose.',
  ]);
}
