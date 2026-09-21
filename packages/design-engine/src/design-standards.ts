import type { RichDesignProfile, StandardRule } from '@planmo/schema';
import { STANDARD_CLASSES } from '@planmo/schema';

/**
 * Structured design standards (P07-07, CHG-001).
 *
 * The fixed, deterministic set of frontend-design standards PlanMo enforces,
 all with class `'design'` (added to STANDARD_CLASSES in Phase 09 so these
 rules finally have a real class; `design.*` ids match the namespace).
 
 *
 * DESIGN_STANDARDS is the source of truth; designStandardsFor(profile)
 * currently returns the full set sorted by id. Per-profile refinement
 * (e.g. skipping design.touch-targets for spacious density, or applying
 * appliesTo domain filters) is deferred to the standards-injection phase,
 * which wires appliesTo into the selection engine. PURE + deterministic.
 */

// Rule set is kept sorted by id so DESIGN_STANDARDS order is stable.
export const DESIGN_STANDARDS: readonly StandardRule[] = [
  {
    id: 'design.accessibility-outranks-style',
    class: 'design',
    precedence: 'global-default',
    rule: 'Never let visual style override accessibility: contrast, keyboard navigation, focus visibility, semantics, reduced motion, touch targets, and accessible names keep their WCAG 2.2 AA floors.',
    rationale:
      'Accessibility is a hard product invariant; visual style is a profile/token layer beneath it.',
    references: ['docs/05-design-engine/accessibility-and-motion.md'],
  },
  {
    id: 'design.accessible-names',
    class: 'design',
    precedence: 'global-default',
    rule: 'Give every interactive and meaningful element an accessible name (WCAG 4.1.2, 2.5.3); icon-only controls need an aria-label or a visible text label.',
    rationale: 'Unnamed controls are unusable to assistive technology and fail WCAG 2.2 AA.',
    references: ['docs/05-design-engine/accessibility-and-motion.md'],
    appliesTo: { domain: ['web'] },
  },
  {
    id: 'design.anti-patterns',
    class: 'design',
    precedence: 'global-default',
    rule: 'Ban purposeless continuous animation, excessive bounce, hidden state changes without announcement, hover-only essential actions, and autoplaying motion without a pause control.',
    rationale:
      'These anti-patterns break usability for vestibular, keyboard, and assistive-technology users.',
    references: ['docs/05-design-engine/accessibility-and-motion.md'],
  },
  {
    id: 'design.contrast-floor',
    class: 'design',
    precedence: 'global-default',
    rule: 'Honor the contrast floor: 4.5:1 for normal text and 3:1 for large text and UI components (WCAG 1.4.3, 1.4.11); style cannot lower it.',
    rationale:
      'Insufficient contrast is the most common accessibility failure and cannot be a stylistic choice.',
    references: ['docs/05-design-engine/accessibility-and-motion.md'],
    appliesTo: { domain: ['web'] },
  },
  {
    id: 'design.dtcg-canonical',
    class: 'design',
    precedence: 'global-default',
    rule: 'Represent every design decision as a canonical DTCG token (ADR-0003); framework outputs (Tailwind, CSS custom properties, shadcn) are derived adapters, never the source of truth.',
    rationale:
      'DTCG tokens are platform-neutral, typed, and transformable; ad-hoc framework tokens fragment the design system.',
    references: ['docs/05-design-engine/tokens.md', 'ADR-0003'],
  },
  {
    id: 'design.focus-visible',
    class: 'design',
    precedence: 'global-default',
    rule: 'Show a visible focus indicator on every interactive element (WCAG 2.4.7); focus outlines must never be removed entirely.',
    rationale:
      'Keyboard users rely on the focus indicator to know where they are; removing it hides state.',
    references: ['docs/05-design-engine/accessibility-and-motion.md'],
    appliesTo: { domain: ['web'] },
  },
  {
    id: 'design.keyboard-navigation',
    class: 'design',
    precedence: 'global-default',
    rule: 'Make every interactive feature reachable and operable by keyboard alone (WCAG 2.1.1) with a logical, visible focus order.',
    rationale: 'Keyboard operability is the base requirement for all assistive technologies.',
    references: ['docs/05-design-engine/accessibility-and-motion.md'],
    appliesTo: { domain: ['web'] },
  },
  {
    id: 'design.motion-profiles',
    class: 'design',
    precedence: 'global-default',
    rule: 'Constrain animation to the motion profiles none, restrained, expressive, or cinematic; restrained is the default for general product UI.',
    rationale:
      'A bounded profile set keeps motion intentional and testable against reduced-motion requirements.',
    references: ['docs/05-design-engine/accessibility-and-motion.md'],
  },
  {
    id: 'design.reduced-motion',
    class: 'design',
    precedence: 'global-default',
    rule: 'Honor prefers-reduced-motion for every user-visible animation (WCAG 2.3.3); motion must remain disable-able for reduced-motion users.',
    rationale:
      'Motion-triggered vestibular and flash sensitivity are accessibility failures, not styling choices.',
    references: ['docs/05-design-engine/accessibility-and-motion.md'],
  },
  {
    id: 'design.responsive-mobile-first',
    class: 'design',
    precedence: 'global-default',
    rule: 'Design mobile-first with explicit responsive rules; layouts must stay usable at small viewports without horizontal scroll or reflow traps (WCAG 1.4.10).',
    rationale:
      'Mobile-first ordering prevents desktop-first layouts that are unusable on small screens.',
    references: ['docs/05-design-engine/design-profile.md'],
    appliesTo: { domain: ['web'] },
  },
  {
    id: 'design.semantic-html',
    class: 'design',
    precedence: 'global-default',
    rule: 'Use semantic HTML and native interactive elements; never build UI with div-only structures that lose semantics, roles, and accessible names.',
    rationale:
      'Native elements carry semantics, keyboard behavior, and names for free; div-only UI must recreate all of it.',
    references: ['docs/05-design-engine/accessibility-and-motion.md'],
    appliesTo: { domain: ['web'] },
  },
  {
    id: 'design.sources-vs-style',
    class: 'design',
    precedence: 'global-default',
    rule: 'Keep component sources (ecosystem, foundation, registries) separate from visual style decisions; a component source is a source, never a style.',
    rationale:
      'Conflating sources with style couples the design system to a vendor and hides trust decisions.',
    references: ['docs/05-design-engine/design-engine.md'],
  },
  {
    id: 'design.touch-targets',
    class: 'design',
    precedence: 'global-default',
    rule: 'Provide touch targets of at least 44px by default (WCAG 2.5.8); compact density must not shrink interactive targets below the floor.',
    rationale: 'Sub-44px targets are hard to hit on touch and fail WCAG 2.2 AA.',
    references: ['docs/05-design-engine/accessibility-and-motion.md'],
    appliesTo: { domain: ['web'] },
  },
];

/**
 * Design standards applicable to a profile (P09-08 refinement).
 * Deterministic per-profile filtering:
 * - backendOnly projects drop web-domain rules (no UI to regulate);
 * - spacious density drops the touch-target floor (WCAG 2.5.8 is a
 *   compensated-target rule: the 44px floor applies unless the target has
 *   sufficient spacing/space — spacious density provides it);
 * - everything else stays. Sort by id.
 */
export function designStandardsFor(profile: RichDesignProfile): readonly StandardRule[] {
  const backendOnly = profile.backendOnly === true;
  const spacious = profile.density === 'spacious';
  return DESIGN_STANDARDS.filter((rule) => {
    if (rule.appliesTo?.domain?.includes('web') && backendOnly) return false;
    if (rule.id === 'design.touch-targets' && spacious) return false;
    return true;
  }).sort((a, b) => a.id.localeCompare(b.id));
}

/** Guard: 'design' is now a STANDARD_CLASSES member (Phase 09). */
export const DESIGN_STANDARDS_CLASS: 'design' | 'language' = (
  STANDARD_CLASSES as readonly string[]
).includes('design')
  ? 'design'
  : 'language';
