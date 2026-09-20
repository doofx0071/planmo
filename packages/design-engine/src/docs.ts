import type {
  DesignDocsGenerator,
  DesignDocsInput,
  DesignDocsOutput,
  TokenValue,
} from './contracts.js';
import { mergedAntiPatterns } from './anti-patterns.js';
import { dtcTokenEngine } from './tokens.js';

/**
 * Design docs generator (P07-05).
 *
 * Renders deterministic markdown design guidance from a rich design profile,
 * the selected design packs, and resolved DTCG tokens: Profile, Design
 * tokens (sorted, aliases flagged via the token engine), Anti-patterns
 * (universal + pack rules, deduped and sorted), Responsive, Accessibility
 * (universal invariants from docs/05-design-engine/accessibility-and-motion.md
 * plus pack notes), Motion (only when the profile declares it), and a
 * conditional Validation warnings section. PURE + deterministic: no I/O, no
 * timestamps; every derived array is sorted before output.
 */

/**
 * Universal accessibility invariants (docs/05-design-engine/accessibility-and-motion.md):
 * style cannot override these seven.
 */
const UNIVERSAL_ACCESSIBILITY: readonly string[] = [
  'contrast',
  'keyboard navigation',
  'focus visibility',
  'semantics',
  'reduced motion',
  'touch targets',
  'accessible names',
] as const;

/** Join present parts into "- label: a, b"; undefined when nothing is present. */
function partsLine(label: string, parts: readonly (string | undefined)[]): string | undefined {
  const present = parts.filter((part): part is string => part !== undefined);
  return present.length > 0 ? `- ${label}: ${present.join(', ')}` : undefined;
}

/** Render a token $value deterministically (aliases verbatim, arrays as JSON). */
function formatValue(value: TokenValue): string {
  if (typeof value === 'string' || typeof value === 'number') return `${value}`;
  return JSON.stringify(value);
}

export const designDocsGenerator: DesignDocsGenerator = {
  generate(input: DesignDocsInput): DesignDocsOutput {
    const { profile, packs, tokens } = input;
    const sortedPacks = [...packs].sort((a, b) => a.id.localeCompare(b.id));
    const diagnostics = dtcTokenEngine.validate(
      tokens,
      profile.motion !== undefined ? { motion: profile.motion.profile } : {},
    );

    const lines: string[] = [];

    // ----------------------------------------------------------------- title
    lines.push(`# ${profile.style} design guidance`, '');

    // ---------------------------------------------------------------- profile
    lines.push('## Profile', '');
    lines.push(`- style: ${profile.style}`);
    if (profile.styleVariant !== undefined) {
      lines.push(`- styleVariant: ${profile.styleVariant}`);
    }
    lines.push(`- density: ${profile.density}`);
    if (profile.accessibility !== undefined) {
      lines.push(`- accessibility: ${profile.accessibility}`);
    }
    if (profile.backendOnly === true) {
      lines.push('- backendOnly: true');
    }
    if (sortedPacks.length > 0) {
      lines.push(`- packs: ${sortedPacks.map((p) => `${p.id}@${p.version}`).join(', ')}`);
    }
    const geometryLine =
      profile.geometry !== undefined
        ? partsLine('geometry', [
            profile.geometry.radius !== undefined ? `radius=${profile.geometry.radius}` : undefined,
            profile.geometry.borderStrength !== undefined
              ? `borderStrength=${profile.geometry.borderStrength}`
              : undefined,
            profile.geometry.shadowUsage !== undefined
              ? `shadowUsage=${profile.geometry.shadowUsage}`
              : undefined,
          ])
        : undefined;
    if (geometryLine !== undefined) lines.push(geometryLine);
    const typographyLine =
      profile.typography !== undefined
        ? partsLine('typography', [
            `strategy=${profile.typography.strategy}`,
            profile.typography.maxFamilies !== undefined
              ? `maxFamilies=${profile.typography.maxFamilies}`
              : undefined,
          ])
        : undefined;
    if (typographyLine !== undefined) lines.push(typographyLine);
    if (profile.icons !== undefined) {
      lines.push(`- icons: strategy=${profile.icons.strategy}`);
    }
    const componentsLine =
      profile.components !== undefined
        ? partsLine('components', [
            profile.components.system !== undefined
              ? `system=${profile.components.system}`
              : undefined,
            profile.components.foundation !== undefined
              ? `foundation=${profile.components.foundation}`
              : undefined,
            profile.components.registries.length > 0
              ? `registries=${profile.components.registries.length}`
              : undefined,
          ])
        : undefined;
    if (componentsLine !== undefined) lines.push(componentsLine);

    // ---------------------------------------------------------- design tokens
    const sortedTokens = [...tokens].sort((a, b) => a.name.localeCompare(b.name));
    lines.push('', '## Design tokens', '', '| Name | $type | $value |', '| --- | --- | --- |');
    for (const token of sortedTokens) {
      lines.push(`| ${token.name} | ${token.$type ?? ''} | ${formatValue(token.$value)} |`);
    }

    // ----------------------------------------------------------- anti-patterns
    const antiPatterns = mergedAntiPatterns(sortedPacks.flatMap((p) => p.antiPatterns));
    lines.push('', '## Anti-patterns', '');
    for (const antiPattern of antiPatterns) {
      lines.push(`- ${antiPattern}`);
    }

    // -------------------------------------------------------------- responsive
    lines.push('', '## Responsive', '');
    const mobileFirst = profile.responsive?.mobileFirst ?? true;
    const breakpoints = [...(profile.responsive?.breakpoints ?? [])].sort((a, b) => a - b);
    lines.push(`- mobileFirst: ${mobileFirst}`);
    lines.push(`- breakpoints: ${breakpoints.length > 0 ? breakpoints.join(', ') : 'none'}`);
    const responsiveRules = [...new Set(sortedPacks.flatMap((p) => p.responsive ?? []))].sort();
    for (const rule of responsiveRules) {
      lines.push(`- ${rule}`);
    }

    // ----------------------------------------------------------- accessibility
    lines.push('', '## Accessibility', '');
    lines.push(`- target: ${profile.accessibility ?? 'WCAG-2.2-AA'}`);
    for (const item of UNIVERSAL_ACCESSIBILITY) {
      lines.push(`- ${item}`);
    }
    const accessibilityNotes = [
      ...new Set(sortedPacks.flatMap((p) => p.accessibilityNotes ?? [])),
    ].sort();
    for (const note of accessibilityNotes) {
      lines.push(`- ${note}`);
    }

    // ----------------------------------------------------------------- motion
    if (profile.motion !== undefined) {
      lines.push('', '## Motion', '');
      lines.push(`- profile: ${profile.motion.profile}`);
      lines.push(`- reducedMotionRequired: ${profile.motion.reducedMotionRequired}`);
    }

    // ------------------------------------------------------ validation warnings
    if (diagnostics.length > 0) {
      lines.push('', '## Validation warnings', '');
      for (const diagnostic of diagnostics) {
        lines.push(`- [${diagnostic.code}] ${diagnostic.token}: ${diagnostic.message}`);
      }
    }

    const sections: string[] = [
      `# ${profile.style} design guidance`,
      '## Profile',
      '## Design tokens',
      '## Anti-patterns',
      '## Responsive',
      '## Accessibility',
    ];
    if (profile.motion !== undefined) sections.push('## Motion');
    if (diagnostics.length > 0) sections.push('## Validation warnings');

    return { markdown: `${lines.join('\n')}\n`, sections };
  },
};
