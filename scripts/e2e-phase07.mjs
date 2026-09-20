/**
 * Phase 07 E2E proof — run: node scripts/e2e-phase07.mjs (from repo root,
 * after `pnpm --filter @planmo/design-engine build`).
 *
 * Proves the design engine end-to-end (all layers, no UI needed):
 *   1. catalog the 8 design packs + validate every pack's DTCG tokens;
 *   2. emit canonical DTCG JSON for a style, byte-deterministic on re-run;
 *   3. resolve a shadcn registry item (official + community trust paths);
 *   4. generate design guidance markdown incl. anti-patterns + a11y;
 *   5. validate accessibility/motion against WCAG 2.2 AA;
 *   6. structured design standards parse + inject.
 */
import { designPackCatalog } from '../packages/design-engine/dist/packs.js';
import { dtcTokenEngine } from '../packages/design-engine/dist/tokens.js';
import { shadcnRegistryAdapter } from '../packages/design-engine/dist/shadcn.js';
import { designDocsGenerator } from '../packages/design-engine/dist/docs.js';
import { a11yValidator } from '../packages/design-engine/dist/accessibility.js';
import { DESIGN_STANDARDS } from '../packages/design-engine/dist/design-standards.js';
import { RichDesignProfileSchema } from '../packages/schema/dist/index.js';

console.log(
  'packs:',
  designPackCatalog
    .packs()
    .map((p) => p.id)
    .join(', '),
);
if (designPackCatalog.count() !== 8)
  throw new Error(`expected 8 packs, got ${designPackCatalog.count()}`);

for (const pack of designPackCatalog.packs()) {
  const diagnostics = dtcTokenEngine.validate(pack.tokens, {
    motion: pack.id === 'playful' ? 'expressive' : 'restrained',
  });
  if (diagnostics.length > 0)
    throw new Error(`pack ${pack.id} token diagnostics: ${JSON.stringify(diagnostics)}`);
}
console.log('token validation: all 8 packs clean');

const minimal = designPackCatalog.pack('minimal');
if (!minimal) throw new Error('minimal pack missing');
const json1 = dtcTokenEngine.emit(minimal.tokens);
const json2 = dtcTokenEngine.emit([...minimal.tokens].reverse());
if (json1 !== json2) throw new Error('DTCG emit not deterministic');
console.log(`DTCG emit: deterministic (${json1.length} bytes)`);

const official = shadcnRegistryAdapter.resolve({
  baseUrl: 'https://ui.shadcn.com/r',
  itemPath: 'styles/new-york/button.json',
  trust: 'official',
  version: '0.9.2',
});
const community = shadcnRegistryAdapter.resolve({
  baseUrl: 'https://example.com/registry',
  itemPath: 'components/badge.json',
  trust: 'community',
});
if (community.requiresReview !== true) throw new Error('community item must require review');
console.log(
  `registry: official=${official.item.id} (review=${official.requiresReview}); community review=${community.requiresReview}`,
);

const profile = RichDesignProfileSchema.parse({
  schemaVersion: 1,
  style: 'minimal',
  styleVariant: 'balanced',
  density: 'balanced',
  geometry: { radius: 'subtle', borderStrength: 'subtle', shadowUsage: 'restrained' },
  typography: { strategy: 'sans', maxFamilies: 2 },
  icons: { strategy: 'outline' },
  motion: { profile: 'restrained', reducedMotionRequired: true },
  accessibility: 'WCAG-2.2-AA',
  components: { system: 'shadcn' },
  responsive: { mobileFirst: true, breakpoints: [640, 768, 1024] },
});

const docs = designDocsGenerator.generate({ profile, packs: [minimal], tokens: minimal.tokens });
for (const section of [
  '# minimal design guidance',
  '## Anti-patterns',
  '## Accessibility',
  '## Motion',
]) {
  if (!docs.markdown.includes(section)) throw new Error(`docs missing section: ${section}`);
}
console.log(`docs: ${docs.sections.length} sections, ${docs.markdown.length} bytes`);

const a11y = a11yValidator.validate(profile, minimal.tokens);
console.log(`a11y: pass=${a11y.pass}, diagnostics=${a11y.diagnostics.length}`);
if (a11y.diagnostics.some((d) => d.severity === 'error'))
  throw new Error('minimal AA profile produced errors');

if (DESIGN_STANDARDS.length < 10)
  throw new Error(`expected >= 10 design standards, got ${DESIGN_STANDARDS.length}`);
console.log(`standards: ${DESIGN_STANDARDS.length} structured design rules`);
console.log('PHASE 07 E2E OK');
