import { DESIGN_STYLES, type DesignStyle } from '@planmo/schema';
import type { DesignPack, DesignPackCatalog, DtcToken, TokenValue } from './contracts.js';

/**
 * Design packs (P07-03, CHG-001).
 *
 * One canonical pack per entry in DESIGN_STYLES (docs/05-design-engine/
 * style-catalog.md): minimal, editorial, neobrutalism, soft-product,
 * dense-dashboard, developer-tool, luxury, playful. Each pack carries
 * structured DTCG tokens (docs/05-design-engine/tokens.md), style-specific
 * anti-patterns (docs/05-design-engine/accessibility-and-motion.md), and
 * responsive + accessibility notes rendered by the design docs generator.
 *
 * Token discipline (verified in packs.test.ts):
 *  - every alias resolves, no cycles, no duplicate names, no unit-less
 *    dimensions (validateValue rules from tokens.ts);
 *  - every color.text.* token keeps >= 4.5:1 against every color.surface.*
 *    token (WCAG 2.2 AA normal-text floor) for the default AA target;
 *  - playful carries the motion.express token its expressive profile demands
 *    (dtcTokenEngine.validate context cross-check).
 *
 * PURE + deterministic: static data, every returned array sorted or already
 * ordered; no I/O, no randomness, no timestamps.
 */

type Tok = readonly [name: string, $type: string, $value: TokenValue];

function tok([name, $type, $value]: Tok): DtcToken {
  return { name, $type, $value };
}

// ------------------------------------------------------------------ minimal

const minimalTokens: readonly DtcToken[] = [
  tok(['color.paper.0', 'color', '#ffffff']),
  tok(['color.paper.50', 'color', '#f7f7f5']),
  tok(['color.ink.950', 'color', '#1a1a1a']),
  tok(['color.ink.800', 'color', '#333333']),
  tok(['color.ink.600', 'color', '#5c5c5c']),
  tok(['color.ink.300', 'color', '#c4c4c0']),
  tok(['color.ink.100', 'color', '#e8e8e4']),
  tok(['color.surface.canvas', 'color', '{color.paper.0}']),
  tok(['color.surface.raised', 'color', '{color.paper.50}']),
  tok(['color.text.primary', 'color', '{color.ink.950}']),
  tok(['color.text.secondary', 'color', '{color.ink.800}']),
  tok(['color.text.muted', 'color', '{color.ink.600}']),
  tok(['color.border.default', 'color', '{color.ink.100}']),
  tok(['color.border.strong', 'color', '{color.ink.300}']),
  tok(['color.accent.primary', 'color', '#2563eb']),
  tok(['color.accent.hover', 'color', '#1d4ed8']),
  tok(['color.accent.on', 'color', '#ffffff']),
  tok(['color.danger', 'color', '#dc2626']),
  tok(['color.success', 'color', '#16a34a']),
  tok(['spacing.1', 'dimension', '4px']),
  tok(['spacing.2', 'dimension', '8px']),
  tok(['spacing.3', 'dimension', '16px']),
  tok(['spacing.4', 'dimension', '24px']),
  tok(['spacing.5', 'dimension', '32px']),
  tok(['radius.sm', 'dimension', '2px']),
  tok(['radius.md', 'dimension', '4px']),
  tok(['radius.lg', 'dimension', '8px']),
  tok(['shadow.sm', 'shadow', '0 1px 2px rgba(26, 26, 26, 0.06)']),
  tok(['shadow.md', 'shadow', '0 4px 12px rgba(26, 26, 26, 0.08)']),
  tok(['typography.family.sans', 'fontFamily', 'Inter, system-ui, sans-serif']),
  tok(['typography.weight.regular', 'fontWeight', 400]),
  tok(['typography.weight.medium', 'fontWeight', 500]),
  tok(['typography.weight.bold', 'fontWeight', 700]),
  tok(['typography.scale.display', 'dimension', '2rem']),
  tok(['typography.scale.title', 'dimension', '1.5rem']),
  tok(['typography.scale.body', 'dimension', '1rem']),
  tok(['typography.scale.caption', 'dimension', '0.875rem']),
  tok(['motion.duration.fast', 'duration', '120ms']),
  tok(['motion.duration.base', 'duration', '200ms']),
  tok(['motion.duration.slow', 'duration', '320ms']),
  tok(['motion.easing.standard', 'cubicBezier', 'cubic-bezier(0.2, 0, 0, 1)']),
];

// ---------------------------------------------------------------- editorial

const editorialTokens: readonly DtcToken[] = [
  tok(['color.paper.0', 'color', '#fbf9f4']),
  tok(['color.paper.50', 'color', '#f4efe6']),
  tok(['color.ink.950', 'color', '#26201a']),
  tok(['color.ink.800', 'color', '#4a4034']),
  tok(['color.ink.600', 'color', '#66584a']),
  tok(['color.ink.300', 'color', '#c2b7a0']),
  tok(['color.ink.100', 'color', '#d9d1c2']),
  tok(['color.surface.canvas', 'color', '{color.paper.0}']),
  tok(['color.surface.raised', 'color', '{color.paper.50}']),
  tok(['color.text.primary', 'color', '{color.ink.950}']),
  tok(['color.text.secondary', 'color', '{color.ink.800}']),
  tok(['color.text.muted', 'color', '{color.ink.600}']),
  tok(['color.border.default', 'color', '{color.ink.100}']),
  tok(['color.border.strong', 'color', '{color.ink.300}']),
  tok(['color.accent.primary', 'color', '#8c2f24']),
  tok(['color.accent.hover', 'color', '#6f241b']),
  tok(['color.accent.on', 'color', '#fbf9f4']),
  tok(['spacing.1', 'dimension', '4px']),
  tok(['spacing.2', 'dimension', '8px']),
  tok(['spacing.3', 'dimension', '16px']),
  tok(['spacing.4', 'dimension', '24px']),
  tok(['spacing.5', 'dimension', '40px']),
  tok(['spacing.6', 'dimension', '64px']),
  tok(['radius.sm', 'dimension', '0px']),
  tok(['radius.md', 'dimension', '2px']),
  tok(['radius.lg', 'dimension', '4px']),
  tok(['shadow.sm', 'shadow', '0 1px 2px rgba(38, 32, 26, 0.08)']),
  tok(['shadow.md', 'shadow', '0 8px 24px rgba(38, 32, 26, 0.12)']),
  tok(['typography.family.display', 'fontFamily', 'Cormorant Garamond, Georgia, serif']),
  tok(['typography.family.body', 'fontFamily', 'Inter, system-ui, sans-serif']),
  tok(['typography.weight.regular', 'fontWeight', 400]),
  tok(['typography.weight.medium', 'fontWeight', 500]),
  tok(['typography.weight.bold', 'fontWeight', 700]),
  tok(['typography.tracking.display', 'dimension', '-0.02em']),
  tok(['typography.scale.display', 'dimension', '3rem']),
  tok(['typography.scale.title', 'dimension', '2rem']),
  tok(['typography.scale.body', 'dimension', '1.0625rem']),
  tok(['typography.scale.caption', 'dimension', '0.8125rem']),
  tok(['motion.duration.fast', 'duration', '160ms']),
  tok(['motion.duration.base', 'duration', '250ms']),
  tok(['motion.duration.slow', 'duration', '380ms']),
  tok(['motion.easing.standard', 'cubicBezier', 'cubic-bezier(0.22, 1, 0.36, 1)']),
];

// ------------------------------------------------------------ neobrutalism

const neobrutalismTokens: readonly DtcToken[] = [
  tok(['color.paper.0', 'color', '#ffffff']),
  tok(['color.paper.50', 'color', '#f2efe9']),
  tok(['color.ink.950', 'color', '#111111']),
  tok(['color.ink.800', 'color', '#3d3d3d']),
  tok(['color.ink.600', 'color', '#595959']),
  tok(['color.ink.100', 'color', '#d8d8d0']),
  tok(['color.surface.canvas', 'color', '{color.paper.0}']),
  tok(['color.surface.raised', 'color', '{color.paper.50}']),
  tok(['color.text.primary', 'color', '{color.ink.950}']),
  tok(['color.text.secondary', 'color', '{color.ink.800}']),
  tok(['color.text.muted', 'color', '{color.ink.600}']),
  tok(['color.border.default', 'color', '#111111']),
  tok(['color.border.strong', 'color', '#000000']),
  tok(['border.weight', 'dimension', '2px']),
  tok(['color.accent.primary', 'color', '#ff4d00']),
  tok(['color.accent.secondary', 'color', '#ffd500']),
  tok(['color.accent.tertiary', 'color', '#2b6bff']),
  tok(['color.accent.on', 'color', '#111111']),
  tok(['color.danger', 'color', '#d62828']),
  tok(['color.success', 'color', '#2ea043']),
  tok(['color.warning', 'color', '#b45309']),
  tok(['spacing.1', 'dimension', '4px']),
  tok(['spacing.2', 'dimension', '8px']),
  tok(['spacing.3', 'dimension', '12px']),
  tok(['spacing.4', 'dimension', '16px']),
  tok(['spacing.5', 'dimension', '24px']),
  tok(['spacing.6', 'dimension', '32px']),
  tok(['radius.sm', 'dimension', '0px']),
  tok(['radius.md', 'dimension', '4px']),
  tok(['radius.lg', 'dimension', '8px']),
  tok(['shadow.hard', 'shadow', '4px 4px 0 #111111']),
  tok(['shadow.hard-lg', 'shadow', '8px 8px 0 #111111']),
  tok(['typography.family.sans', 'fontFamily', 'Archivo, Inter, system-ui, sans-serif']),
  tok(['typography.weight.regular', 'fontWeight', 400]),
  tok(['typography.weight.medium', 'fontWeight', 500]),
  tok(['typography.weight.bold', 'fontWeight', 800]),
  tok(['typography.scale.display', 'dimension', '2.25rem']),
  tok(['typography.scale.title', 'dimension', '1.5rem']),
  tok(['typography.scale.body', 'dimension', '1rem']),
  tok(['typography.scale.caption', 'dimension', '0.875rem']),
  tok(['motion.duration.fast', 'duration', '100ms']),
  tok(['motion.duration.base', 'duration', '150ms']),
  tok(['motion.duration.slow', 'duration', '260ms']),
  tok(['motion.easing.standard', 'cubicBezier', 'cubic-bezier(0.2, 0, 0, 1)']),
];

// ------------------------------------------------------------- soft-product

const softProductTokens: readonly DtcToken[] = [
  tok(['color.paper.0', 'color', '#ffffff']),
  tok(['color.paper.50', 'color', '#f6f6f8']),
  tok(['color.ink.950', 'color', '#18181b']),
  tok(['color.ink.800', 'color', '#3f3f46']),
  tok(['color.ink.600', 'color', '#67676e']),
  tok(['color.ink.400', 'color', '#a1a1aa']),
  tok(['color.ink.100', 'color', '#e4e4e7']),
  tok(['color.surface.canvas', 'color', '{color.paper.0}']),
  tok(['color.surface.raised', 'color', '{color.paper.50}']),
  tok(['color.text.primary', 'color', '{color.ink.950}']),
  tok(['color.text.secondary', 'color', '{color.ink.800}']),
  tok(['color.text.muted', 'color', '{color.ink.600}']),
  tok(['color.border.default', 'color', '{color.ink.100}']),
  tok(['color.border.strong', 'color', '{color.ink.400}']),
  tok(['color.accent.primary', 'color', '#6366f1']),
  tok(['color.accent.hover', 'color', '#4f46e5']),
  tok(['color.accent.secondary', 'color', '#10b981']),
  tok(['color.accent.on', 'color', '#ffffff']),
  tok(['color.danger', 'color', '#dc2626']),
  tok(['color.success', 'color', '#059669']),
  tok(['color.warning', 'color', '#d97706']),
  tok(['spacing.1', 'dimension', '4px']),
  tok(['spacing.2', 'dimension', '8px']),
  tok(['spacing.3', 'dimension', '12px']),
  tok(['spacing.4', 'dimension', '16px']),
  tok(['spacing.5', 'dimension', '24px']),
  tok(['spacing.6', 'dimension', '32px']),
  tok(['spacing.7', 'dimension', '48px']),
  tok(['radius.sm', 'dimension', '6px']),
  tok(['radius.md', 'dimension', '12px']),
  tok(['radius.lg', 'dimension', '16px']),
  tok(['radius.pill', 'dimension', '999px']),
  tok(['shadow.sm', 'shadow', '0 1px 2px rgba(27, 27, 40, 0.05)']),
  tok(['shadow.md', 'shadow', '0 8px 24px rgba(27, 27, 40, 0.1)']),
  tok(['shadow.lg', 'shadow', '0 16px 40px rgba(27, 27, 40, 0.14)']),
  tok(['typography.family.sans', 'fontFamily', 'Inter, system-ui, sans-serif']),
  tok(['typography.weight.regular', 'fontWeight', 400]),
  tok(['typography.weight.medium', 'fontWeight', 500]),
  tok(['typography.weight.semibold', 'fontWeight', 600]),
  tok(['typography.scale.display', 'dimension', '2rem']),
  tok(['typography.scale.title', 'dimension', '1.25rem']),
  tok(['typography.scale.body', 'dimension', '1rem']),
  tok(['typography.scale.caption', 'dimension', '0.875rem']),
  tok(['motion.duration.fast', 'duration', '100ms']),
  tok(['motion.duration.base', 'duration', '180ms']),
  tok(['motion.duration.slow', 'duration', '300ms']),
  tok(['motion.easing.standard', 'cubicBezier', 'cubic-bezier(0.16, 1, 0.3, 1)']),
  tok(['motion.easing.entrance', 'cubicBezier', 'cubic-bezier(0.2, 0, 0.4, 1)']),
];

// ---------------------------------------------------------- dense-dashboard

const denseDashboardTokens: readonly DtcToken[] = [
  tok(['color.paper.900', 'color', '#0f1115']),
  tok(['color.paper.800', 'color', '#171a21']),
  tok(['color.paper.700', 'color', '#1f232c']),
  tok(['color.ink.50', 'color', '#f2f4f8']),
  tok(['color.ink.200', 'color', '#c3c8d1']),
  tok(['color.ink.400', 'color', '#8b93a1']),
  tok(['color.ink.600', 'color', '#4d5464']),
  tok(['color.ink.700', 'color', '#2a303c']),
  tok(['color.surface.canvas', 'color', '{color.paper.900}']),
  tok(['color.surface.raised', 'color', '{color.paper.800}']),
  tok(['color.surface.overlay', 'color', '{color.paper.700}']),
  tok(['color.text.primary', 'color', '{color.ink.50}']),
  tok(['color.text.secondary', 'color', '{color.ink.200}']),
  tok(['color.text.muted', 'color', '{color.ink.400}']),
  tok(['color.border.default', 'color', '{color.ink.700}']),
  tok(['color.border.strong', 'color', '{color.ink.600}']),
  tok(['color.accent.primary', 'color', '#3b82f6']),
  tok(['color.accent.hover', 'color', '#2563eb']),
  tok(['color.accent.on', 'color', '#ffffff']),
  tok(['color.danger', 'color', '#e5484d']),
  tok(['color.success', 'color', '#2ea86f']),
  tok(['color.warning', 'color', '#f5a623']),
  tok(['color.chart.1', 'color', '#3b82f6']),
  tok(['color.chart.2', 'color', '#2ea86f']),
  tok(['color.chart.3', 'color', '#f5a623']),
  tok(['color.chart.4', 'color', '#e5484d']),
  tok(['color.chart.5', 'color', '#8b5cf6']),
  tok(['density.row', 'dimension', '32px']),
  tok(['density.gutter', 'dimension', '16px']),
  tok(['density.section', 'dimension', '8px']),
  tok(['density.compact', 'dimension', '24px']),
  tok(['spacing.1', 'dimension', '4px']),
  tok(['spacing.2', 'dimension', '8px']),
  tok(['spacing.3', 'dimension', '12px']),
  tok(['spacing.4', 'dimension', '16px']),
  tok(['spacing.5', 'dimension', '24px']),
  tok(['radius.sm', 'dimension', '2px']),
  tok(['radius.md', 'dimension', '4px']),
  tok(['radius.lg', 'dimension', '6px']),
  tok(['shadow.sm', 'shadow', '0 1px 2px rgba(0, 0, 0, 0.4)']),
  tok(['shadow.md', 'shadow', '0 4px 12px rgba(0, 0, 0, 0.45)']),
  tok(['typography.family.sans', 'fontFamily', 'Inter, system-ui, sans-serif']),
  tok(['typography.weight.regular', 'fontWeight', 400]),
  tok(['typography.weight.medium', 'fontWeight', 500]),
  tok(['typography.weight.semibold', 'fontWeight', 600]),
  tok(['typography.scale.data', 'dimension', '0.8125rem']),
  tok(['typography.scale.body', 'dimension', '0.875rem']),
  tok(['typography.scale.title', 'dimension', '1rem']),
  tok(['typography.scale.display', 'dimension', '1.25rem']),
  tok(['motion.duration.fast', 'duration', '100ms']),
  tok(['motion.duration.base', 'duration', '150ms']),
  tok(['motion.duration.slow', 'duration', '240ms']),
];

// ---------------------------------------------------------- developer-tool

const developerToolTokens: readonly DtcToken[] = [
  tok(['color.paper.900', 'color', '#0d1117']),
  tok(['color.paper.800', 'color', '#161b22']),
  tok(['color.paper.700', 'color', '#21262d']),
  tok(['color.ink.50', 'color', '#e6edf3']),
  tok(['color.ink.200', 'color', '#9da7b3']),
  tok(['color.ink.400', 'color', '#8b95a1']),
  tok(['color.ink.600', 'color', '#57606a']),
  tok(['color.ink.700', 'color', '#30363d']),
  tok(['color.surface.canvas', 'color', '{color.paper.900}']),
  tok(['color.surface.raised', 'color', '{color.paper.800}']),
  tok(['color.surface.overlay', 'color', '{color.paper.700}']),
  tok(['color.text.primary', 'color', '{color.ink.50}']),
  tok(['color.text.secondary', 'color', '{color.ink.200}']),
  tok(['color.text.muted', 'color', '{color.ink.400}']),
  tok(['color.border.default', 'color', '{color.ink.700}']),
  tok(['color.border.strong', 'color', '{color.ink.600}']),
  tok(['color.accent.primary', 'color', '#58a6ff']),
  tok(['color.accent.hover', 'color', '#79c0ff']),
  tok(['color.accent.on', 'color', '#0d1117']),
  tok(['color.danger', 'color', '#f85149']),
  tok(['color.success', 'color', '#3fb950']),
  tok(['color.warning', 'color', '#d29922']),
  tok(['focus.ring', 'color', '#58a6ff']),
  tok(['focus.width', 'dimension', '2px']),
  tok(['spacing.1', 'dimension', '4px']),
  tok(['spacing.2', 'dimension', '8px']),
  tok(['spacing.3', 'dimension', '12px']),
  tok(['spacing.4', 'dimension', '16px']),
  tok(['spacing.5', 'dimension', '24px']),
  tok(['spacing.6', 'dimension', '32px']),
  tok(['radius.sm', 'dimension', '2px']),
  tok(['radius.md', 'dimension', '4px']),
  tok(['radius.lg', 'dimension', '6px']),
  tok(['shadow.sm', 'shadow', '0 1px 3px rgba(1, 4, 9, 0.5)']),
  tok(['shadow.md', 'shadow', '0 8px 24px rgba(1, 4, 9, 0.6)']),
  tok([
    'typography.family.mono',
    'fontFamily',
    'JetBrains Mono, SFMono-Regular, Menlo, Consolas, monospace',
  ]),
  tok(['typography.family.sans', 'fontFamily', 'Inter, system-ui, sans-serif']),
  tok(['typography.weight.regular', 'fontWeight', 400]),
  tok(['typography.weight.medium', 'fontWeight', 500]),
  tok(['typography.weight.semibold', 'fontWeight', 600]),
  tok(['typography.scale.data', 'dimension', '0.8125rem']),
  tok(['typography.scale.code', 'dimension', '0.875rem']),
  tok(['typography.scale.body', 'dimension', '0.875rem']),
  tok(['typography.scale.title', 'dimension', '1rem']),
  tok(['motion.duration.fast', 'duration', '80ms']),
  tok(['motion.duration.base', 'duration', '140ms']),
  tok(['motion.duration.slow', 'duration', '220ms']),
];

// ------------------------------------------------------------------ luxury

const luxuryTokens: readonly DtcToken[] = [
  tok(['color.paper.900', 'color', '#121512']),
  tok(['color.paper.800', 'color', '#1b1f1a']),
  tok(['color.ink.50', 'color', '#f4f1ea']),
  tok(['color.ink.200', 'color', '#bfb8a8']),
  tok(['color.ink.400', 'color', '#938c7d']),
  tok(['color.ink.500', 'color', '#6b6355']),
  tok(['color.ink.700', 'color', '#3a352c']),
  tok(['color.surface.canvas', 'color', '{color.paper.900}']),
  tok(['color.surface.raised', 'color', '{color.paper.800}']),
  tok(['color.text.primary', 'color', '{color.ink.50}']),
  tok(['color.text.secondary', 'color', '{color.ink.200}']),
  tok(['color.text.muted', 'color', '{color.ink.400}']),
  tok(['color.border.default', 'color', '{color.ink.700}']),
  tok(['color.border.strong', 'color', '{color.ink.500}']),
  tok(['color.accent.primary', 'color', '#c9a96a']),
  tok(['color.accent.hover', 'color', '#d9bd85']),
  tok(['color.accent.on', 'color', '#121512']),
  tok(['spacing.1', 'dimension', '8px']),
  tok(['spacing.2', 'dimension', '12px']),
  tok(['spacing.3', 'dimension', '16px']),
  tok(['spacing.4', 'dimension', '24px']),
  tok(['spacing.5', 'dimension', '32px']),
  tok(['spacing.6', 'dimension', '48px']),
  tok(['spacing.7', 'dimension', '64px']),
  tok(['radius.sm', 'dimension', '2px']),
  tok(['radius.md', 'dimension', '6px']),
  tok(['radius.lg', 'dimension', '12px']),
  tok(['shadow.sm', 'shadow', '0 2px 8px rgba(9, 10, 8, 0.35)']),
  tok(['shadow.md', 'shadow', '0 12px 32px rgba(9, 10, 8, 0.45)']),
  tok(['typography.family.display', 'fontFamily', 'Cormorant Garamond, Georgia, serif']),
  tok(['typography.family.body', 'fontFamily', 'Inter, system-ui, sans-serif']),
  tok(['typography.weight.regular', 'fontWeight', 400]),
  tok(['typography.weight.medium', 'fontWeight', 500]),
  tok(['typography.weight.semibold', 'fontWeight', 600]),
  tok(['typography.tracking.display', 'dimension', '0.01em']),
  tok(['typography.scale.display', 'dimension', '2.75rem']),
  tok(['typography.scale.title', 'dimension', '1.75rem']),
  tok(['typography.scale.body', 'dimension', '1rem']),
  tok(['typography.scale.caption', 'dimension', '0.8125rem']),
  tok(['motion.duration.fast', 'duration', '160ms']),
  tok(['motion.duration.base', 'duration', '280ms']),
  tok(['motion.duration.slow', 'duration', '420ms']),
  tok(['motion.easing.standard', 'cubicBezier', 'cubic-bezier(0.22, 1, 0.36, 1)']),
];

// ----------------------------------------------------------------- playful

const playfulTokens: readonly DtcToken[] = [
  tok(['color.paper.0', 'color', '#ffffff']),
  tok(['color.paper.50', 'color', '#fef1e3']),
  tok(['color.ink.950', 'color', '#32231c']),
  tok(['color.ink.700', 'color', '#5a4436']),
  tok(['color.ink.500', 'color', '#74624f']),
  tok(['color.ink.300', 'color', '#bba184']),
  tok(['color.ink.200', 'color', '#d8bfa0']),
  tok(['color.surface.canvas', 'color', '{color.paper.0}']),
  tok(['color.surface.raised', 'color', '{color.paper.50}']),
  tok(['color.text.primary', 'color', '{color.ink.950}']),
  tok(['color.text.secondary', 'color', '{color.ink.700}']),
  tok(['color.text.muted', 'color', '{color.ink.500}']),
  tok(['color.border.default', 'color', '{color.ink.200}']),
  tok(['color.border.strong', 'color', '{color.ink.950}']),
  tok(['border.weight', 'dimension', '2px']),
  tok(['color.accent.primary', 'color', '#ff4757']),
  tok(['color.accent.secondary', 'color', '#2ed573']),
  tok(['color.accent.tertiary', 'color', '#1e90ff']),
  tok(['color.accent.on', 'color', '#32231c']),
  tok(['color.danger', 'color', '#d62839']),
  tok(['color.success', 'color', '#2ea86f']),
  tok(['color.warning', 'color', '#f5a623']),
  tok(['spacing.1', 'dimension', '4px']),
  tok(['spacing.2', 'dimension', '8px']),
  tok(['spacing.3', 'dimension', '12px']),
  tok(['spacing.4', 'dimension', '16px']),
  tok(['spacing.5', 'dimension', '24px']),
  tok(['spacing.6', 'dimension', '32px']),
  tok(['radius.sm', 'dimension', '8px']),
  tok(['radius.md', 'dimension', '12px']),
  tok(['radius.lg', 'dimension', '20px']),
  tok(['radius.pill', 'dimension', '999px']),
  tok(['shadow.chunky', 'shadow', '4px 6px 0 #32231c']),
  tok(['shadow.soft', 'shadow', '0 8px 24px rgba(50, 35, 28, 0.18)']),
  tok(['typography.family.sans', 'fontFamily', 'Nunito, Inter, system-ui, sans-serif']),
  tok(['typography.weight.regular', 'fontWeight', 400]),
  tok(['typography.weight.bold', 'fontWeight', 700]),
  tok(['typography.weight.black', 'fontWeight', 900]),
  tok(['typography.scale.display', 'dimension', '2.5rem']),
  tok(['typography.scale.title', 'dimension', '1.5rem']),
  tok(['typography.scale.body', 'dimension', '1rem']),
  tok(['typography.scale.caption', 'dimension', '0.875rem']),
  tok(['motion.express', 'cubicBezier', 'cubic-bezier(0.34, 1.56, 0.64, 1)']),
  tok(['motion.duration.snappy', 'duration', '100ms']),
  tok(['motion.duration.base', 'duration', '180ms']),
  tok(['motion.duration.slow', 'duration', '400ms']),
  tok(['motion.easing.standard', 'cubicBezier', 'cubic-bezier(0.25, 0.1, 0.25, 1)']),
];

// ------------------------------------------------------------------- packs

const minimalPack: DesignPack = {
  id: 'minimal',
  version: '1.0.0',
  name: 'Minimal',
  description: 'Whitespace, hierarchy, limited decoration, restrained motion.',
  tokens: minimalTokens,
  antiPatterns: [
    'dense multi-column layouts that destroy breathing room',
    'flashy gradients that undermine restraint',
    'motion or animation without purpose in a calm interface',
    'over-decorated components that break the whitespace-first hierarchy',
  ],
  responsive: [
    'one primary action per viewport row on mobile',
    'single-column stacks on small viewports with scaling padding',
  ],
  accessibilityNotes: [
    'high-contrast ink-on-paper pairings keep AA floors by construction',
    'quiet surfaces keep focus states obvious — never remove the focus ring',
  ],
};

const editorialPack: DesignPack = {
  id: 'editorial',
  version: '1.0.0',
  name: 'Editorial',
  description: 'Typography-first, deliberate rhythm, strong reading hierarchy.',
  tokens: editorialTokens,
  antiPatterns: [
    'all-uppercase tracking-heavy headlines used for body-length reading',
    'justified text without hyphenation or hanging punctuation',
    'orphan-and-widow ignoring line lengths that break rhythm',
    'typography scale chaos (more than two families, unpaired sizes)',
  ],
  responsive: [
    'drop to a single column below 768px',
    'type scale steps down one size below 640px; measure stays 45-75ch',
  ],
  accessibilityNotes: [
    'reading hierarchy carries the interface: keep lines 45-75ch and honor WCAG 1.4.8 spacing for long-form text',
  ],
};

const neobrutalismPack: DesignPack = {
  id: 'neobrutalism',
  version: '1.0.0',
  name: 'Neobrutalism',
  description: 'Strong borders, assertive geometry, high-contrast surfaces, intentional weight.',
  tokens: neobrutalismTokens,
  antiPatterns: [
    'muted low-contrast borders that erase the bold outline language',
    'overlapping chaotic layouts that hurt scannability',
    'rounded corners on primary actions that betray the sharp geometry',
    'soft gradients, glassmorphism or glow effects that weaken hard edges',
  ],
  responsive: [
    'border weight stays at least 2px at every viewport',
    'cards stack full-width below 640px',
  ],
  accessibilityNotes: [
    'hard borders double as visible focus outlines — keep the 3:1 minimum on all UI-component edges',
  ],
};

const softProductPack: DesignPack = {
  id: 'soft-product',
  version: '1.0.0',
  name: 'Soft Product',
  description: 'Rounded geometry, breathable spacing, approachable controls.',
  tokens: softProductTokens,
  antiPatterns: [
    'cold dense spacing that removes the breathable rhythm',
    'micro-interaction fatigue (springs on every hover)',
    'overly saturated harsh accents that clash with approachability',
    'sharp-edged shadows or heavy borders that break the soft feel',
  ],
  responsive: [
    'controls expand to full-width touch rows below 640px',
    'whitespace scales with viewport size — never a fixed 24px on mobile',
  ],
  accessibilityNotes: [
    'rounded geometry never rounds away touch targets: keep controls at a 44px minimum',
  ],
};

const denseDashboardPack: DesignPack = {
  id: 'dense-dashboard',
  version: '1.0.0',
  name: 'Dense Dashboard',
  description: 'Compact, scanable, information-dense, restrained ornament.',
  tokens: denseDashboardTokens,
  antiPatterns: [
    'chart junk (3D, gradients, gridlines) that obscures data',
    'decorative ornament in data-dense views',
    'squishy or springy animations that hurt scanability',
    'vague empty states with no next action',
  ],
  responsive: [
    'data tables become stacked cards below 640px',
    'side navigation collapses to a drawer below 768px',
  ],
  accessibilityNotes: [
    'annotate chart colors redundantly — never color-only encoding (WCAG 1.4.1)',
    'compact density must not shrink targets below 44px (WCAG 2.5.8)',
  ],
};

const developerToolPack: DesignPack = {
  id: 'developer-tool',
  version: '1.0.0',
  name: 'Developer Tool',
  description: 'Functional, precise, keyboard-centric, code/mono-aware when appropriate.',
  tokens: developerToolTokens,
  antiPatterns: [
    'decorative chrome that wastes vertical space',
    'display fonts or faux-styling in code and content',
    'hover-revealed controls for primary workflows',
    'parallax or cinematic motion in a tool surface',
  ],
  responsive: [
    'code panes go single-column below 768px',
    'command palette is the primary navigation on small viewports',
  ],
  accessibilityNotes: [
    'keyboard-first: every action reachable and focus-visible; mono text keeps 4.5:1 contrast on code surfaces',
  ],
};

const luxuryPack: DesignPack = {
  id: 'luxury',
  version: '1.0.0',
  name: 'Luxury',
  description:
    'Premium typography/spacing/material restraint; avoid stereotyped gold-gradient treatment.',
  tokens: luxuryTokens,
  antiPatterns: [
    'glassy blur overlays that reduce ink-and-paper clarity',
    'gold gradients or metallic shine (stereotyped luxury)',
    'loud saturated accents that cheapen the palette',
    'overly heavy ornament that fights the material restraint',
  ],
  responsive: [
    'display type scales down two steps on mobile',
    'generous margins collapse to double-line spacing below 640px',
  ],
  accessibilityNotes: [
    'restrained palette keeps all text/surface pairs above AA without relying on decorative accents',
  ],
};

const playfulPack: DesignPack = {
  id: 'playful',
  version: '1.0.0',
  name: 'Playful',
  description: 'Expressive shape/motion/color while preserving hierarchy/accessibility.',
  tokens: playfulTokens,
  antiPatterns: [
    'animating layout-affecting properties at scale',
    'color-only state changes without icon or shape redundancy',
    'excessive bounce/spring applied to every element instead of key moments',
  ],
  responsive: [
    'cards keep a 12px minimum gutter at every viewport',
    'hero motion reduces to a static composition below 768px',
  ],
  accessibilityNotes: [
    'expressive motion stays confined to key moments and fully collapses under prefers-reduced-motion; hierarchy preserved with contrast, not color alone',
  ],
};

/**
 * All packs, keyed by canonical style id. The Record<DesignStyle, ...> type
 * forces every DESIGN_STYLES entry to be present at compile time, so the
 * eight-pack catalog cannot silently drift from the canonical style list.
 */
const PACKS_BY_ID: Record<DesignStyle, DesignPack> = {
  minimal: minimalPack,
  editorial: editorialPack,
  neobrutalism: neobrutalismPack,
  'soft-product': softProductPack,
  'dense-dashboard': denseDashboardPack,
  'developer-tool': developerToolPack,
  luxury: luxuryPack,
  playful: playfulPack,
};

/** All packs, sorted by id (canonical output order for the catalog). */
export const DESIGN_PACKS: readonly DesignPack[] = [...DESIGN_STYLES]
  .map((id) => PACKS_BY_ID[id])
  .sort((a, b) => a.id.localeCompare(b.id));

export const designPackCatalog: DesignPackCatalog = {
  packs(): readonly DesignPack[] {
    return [...DESIGN_PACKS].sort((a, b) => a.id.localeCompare(b.id));
  },
  pack(id: string): DesignPack | undefined {
    return DESIGN_PACKS.find((pack) => pack.id === id);
  },
  count(): number {
    return DESIGN_PACKS.length;
  },
};
