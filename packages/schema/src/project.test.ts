import { describe, expect, it } from 'vitest';
import { expectRejected, roundTripJson, roundTripYaml } from './test-utils.js';
import { ProjectConfigSchema } from './project.js';

const valid = {
  schemaVersion: 1,
  project: {
    name: 'Example',
    lifecycle: 'greenfield',
    type: 'web-application',
    risk: 'medium',
  },
  stack: { frontend: 'nextjs', backend: 'nestjs', database: 'postgres' },
  design: {
    style: 'minimal',
    density: 'balanced',
    accessibility: 'WCAG-2.2-AA',
    componentSystem: 'shadcn',
  },
  planning: { depth: 'production', phaseMode: 'gated', freshSessionPerPhase: true },
  agents: { primary: 'opencode' },
  packs: ['stack/nextjs', 'stack/postgres', 'design/minimal', 'risk/production-web'],
};

describe('ProjectConfigSchema', () => {
  it('parses the canonical example document', () => {
    const parsed = ProjectConfigSchema.parse(valid);
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.project.name).toBe('Example');
    expect(parsed.packs).toHaveLength(4);
  });

  it('round-trips through JSON and YAML without data loss', () => {
    const json = roundTripJson(ProjectConfigSchema, valid);
    const yaml = roundTripYaml(ProjectConfigSchema, valid);
    expect(json).toEqual(yaml);
  });

  it('defaults omitted packs to an empty array', () => {
    const { packs, ...rest } = valid;
    const parsed = ProjectConfigSchema.parse(rest);
    expect(parsed.packs).toEqual([]);
  });

  it('accepts extension data on the document root', () => {
    const parsed = ProjectConfigSchema.parse({
      ...valid,
      extensions: { vendorNote: 'internal pilot', flags: { beta: true } },
    });
    expect(parsed.extensions).toEqual({
      vendorNote: 'internal pilot',
      flags: { beta: true },
    });
  });

  it('rejects unknown root fields (strict policy)', () => {
    expectRejected(ProjectConfigSchema, { ...valid, surprise: 'nope' }, 'Unrecognized key');
  });

  it('rejects unknown fields inside nested blocks', () => {
    expectRejected(
      ProjectConfigSchema,
      { ...valid, design: { ...valid.design, glow: true } },
      'Unrecognized key',
    );
  });

  it('rejects an unsupported design style', () => {
    expectRejected(ProjectConfigSchema, { ...valid, design: { ...valid.design, style: 'glow' } });
  });

  it('rejects a malformed pack ref', () => {
    expectRejected(
      ProjectConfigSchema,
      { ...valid, packs: ['Stack/NextJS', 'not-a-ref', 'design/'] },
      /expected pack ref like/,
    );
  });

  it('rejects a missing project name', () => {
    expectRejected(ProjectConfigSchema, {
      ...valid,
      project: { ...valid.project, name: undefined },
    });
  });

  it('rejects a future schemaVersion', () => {
    expectRejected(ProjectConfigSchema, { ...valid, schemaVersion: 2 });
  });

  it('rejects a non-integer schemaVersion', () => {
    expectRejected(ProjectConfigSchema, { ...valid, schemaVersion: '1.5' });
  });
});
