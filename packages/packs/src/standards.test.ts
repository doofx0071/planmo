import { describe, expect, it } from 'vitest';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPack } from './loader.js';
import { selectStandards, type SelectionContext } from './standards.js';
import { makeTempDir, validPackYaml, writePack } from './test-utils.js';

const FIXTURES = resolve(fileURLToPath(new URL('.', import.meta.url)), 'fixtures');

function ctx(overrides: Partial<SelectionContext> = {}): SelectionContext {
  return { stack: ['nextjs'], risk: 'high', ...overrides };
}

describe('selectStandards (CHG-001 P04-06 deterministic standards selection)', () => {
  it('selects applicable standards from a standards pack and sorts by precedence', () => {
    const packs = [loadPack(join(FIXTURES, 'valid/standards/web-security'))];
    const selection = selectStandards(packs, ctx());
    expect(selection.rules.length).toBeGreaterThan(0);
    // Both security rules come from the same tier; sorted by id.
    const ids = selection.rules.map((r) => r.id);
    expect(ids).toEqual([...ids].sort());
    expect(selection.sources).toEqual(['standards/web-security']);
    expect(selection.conflicts).toHaveLength(0);
  });

  it('honors appliesTo context filters (stack/risk/domain/test types)', () => {
    const packs = [loadPack(join(FIXTURES, 'valid/standards/web-security'))];
    // A non-nextjs stack with no risk: the security.secrets rule (stack nextjs + risk high) drops out.
    const selection = selectStandards(packs, { stack: ['express'], risk: 'low' });
    expect(selection.rules).toHaveLength(0);
  });

  it('applies engineering policies at their scope-derived precedence (P04-07)', () => {
    const packs = [loadPack(join(FIXTURES, 'valid/policy/engineering'))];
    const selection = selectStandards(packs, ctx());
    const policyRules = selection.rules.filter((r) => r.class === 'organization');
    expect(policyRules.some((r) => r.id === 'refactor.scope')).toBe(true);
    // global scope → global-default precedence
    expect(policyRules.find((r) => r.id === 'refactor.scope')?.precedence).toBe('global-default');
    expect(selection.conflicts).toHaveLength(0);
  });
});

describe('selectStandards — conflict surfacing (never silent resolution)', () => {
  it('surfaces duplicate rule ids with conflicting content at the same precedence', () => {
    const dir = makeTempDir();
    const packA = loadPack(
      writePack(
        dir,
        'standards/dup-a',
        'schemaVersion: 1\nref: standards/dup-a\nname: Dup A\nversion: 1.0.0\ncategory: standards\ndescription: d\nprovides: []\n' +
          'content:\n  standards:\n    - id: shared.rule\n      class: global-engineering\n      precedence: global-default\n      rule: Rules in A.\n',
      ),
    );
    const packB = loadPack(
      writePack(
        dir,
        'standards/dup-b',
        'schemaVersion: 1\nref: standards/dup-b\nname: Dup B\nversion: 1.0.0\ncategory: standards\ndescription: d\nprovides: []\n' +
          'content:\n  standards:\n    - id: shared.rule\n      class: global-engineering\n      precedence: global-default\n      rule: Rules in B.\n',
      ),
    );
    const selection = selectStandards([packA, packB], ctx());
    const conflict = selection.conflicts.find((c) => c.code === 'duplicate-rule-id');
    expect(conflict).toBeDefined();
    expect(conflict?.ruleId).toBe('shared.rule');
    expect(conflict?.message).toContain('conflicting definitions');
  });

  it('surfaces duplicate engineering policy ids', () => {
    const dir = makeTempDir();
    const pack = loadPack(
      writePack(
        dir,
        'policy/dup',
        'schemaVersion: 1\nref: policy/dup\nname: Dup Policy\nversion: 1.0.0\ncategory: policy\ndescription: d\nprovides: []\n' +
          'content:\n  policies:\n    - id: p.dup\n      scope: global\n      rule: One.\n    - id: p.dup\n      scope: global\n      rule: Two.\n',
      ),
    );
    const selection = selectStandards([pack], ctx());
    expect(selection.conflicts.some((c) => c.ruleId === 'p.dup')).toBe(true);
  });

  it('does not conflict when the same rule id shares identical content', () => {
    const dir = makeTempDir();
    const yaml =
      'schemaVersion: 1\nref: standards/mirror\nname: Mirror\nversion: 1.0.0\ncategory: standards\ndescription: d\nprovides: []\n' +
      'content:\n  standards:\n    - id: shared.same\n      class: global-engineering\n      precedence: global-default\n      rule: Identical rule.\n';
    const a = loadPack(
      writePack(dir, 'standards/mirror-a', yaml.replace('standards/mirror', 'standards/mirror-a')),
    );
    const b = loadPack(
      writePack(dir, 'standards/mirror-b', yaml.replace('standards/mirror', 'standards/mirror-b')),
    );
    const selection = selectStandards([a, b], ctx());
    expect(selection.conflicts).toHaveLength(0);
    // Deduped to one rule with the same content.
    expect(selection.rules.filter((r) => r.id === 'shared.same')).toHaveLength(1);
  });
});

describe('selectStandards — deterministic precedence ordering (REQ-STD-004)', () => {
  it('ranks explicit-project-policy above global-default', () => {
    const dir = makeTempDir();
    const pack = loadPack(
      writePack(
        dir,
        'standards/prec',
        'schemaVersion: 1\nref: standards/prec\nname: Prec\nversion: 1.0.0\ncategory: standards\ndescription: d\nprovides: []\n' +
          'content:\n  standards:\n    - id: ord.r1\n      class: global-engineering\n      precedence: global-default\n      rule: Default rule.\n    - id: ord.r1\n      class: organization\n      precedence: explicit-project-policy\n      rule: Project overrides default.\n',
      ),
    );
    const selection = selectStandards([pack], ctx());
    const matches = selection.rules.filter((r) => r.id === 'ord.r1');
    expect(matches).toHaveLength(1);
    expect(matches[0]?.precedence).toBe('explicit-project-policy');
    expect(matches[0]?.rule).toBe('Project overrides default.');
  });
});
