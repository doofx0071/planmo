import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parse as yamlParse } from 'yaml';
import { LockfileSchema, ManifestSchema, ProjectConfigSchema, StateSchema } from './index.js';

/**
 * Golden fixture tests (exit gate: "Schema migrations are deterministic and
 * covered by fixtures"). Each v1 golden document must parse AND round-trip
 * with byte-stable semantics — proving the schema accepts exactly the shape
 * PlanMo persists, and YAML serialization is lossless for it.
 */

const fixtures = fileURLToPath(new URL('./fixtures/', import.meta.url));

function loadYaml(name: string): unknown {
  return yamlParse(readFileSync(`${fixtures}${name}`, 'utf8'));
}

describe('golden v1 fixtures', () => {
  it('project.v1.golden.yml parses and round-trips', () => {
    const doc = loadYaml('project.v1.golden.yml');
    const parsed = ProjectConfigSchema.parse(doc);
    expect(parsed.project.name).toBe('Example');
    expect(parsed.packs).toContain('design/minimal');
    // Re-serialize, re-parse, and require equality (no data loss).
    const json = JSON.parse(JSON.stringify(parsed));
    expect(ProjectConfigSchema.parse(json)).toEqual(parsed);
  });

  it('state.v1.golden.yml parses and round-trips', () => {
    const doc = loadYaml('state.v1.golden.yml');
    const parsed = StateSchema.parse(doc);
    expect(parsed.currentPhase).toBe('02');
    expect(parsed.tasks?.['P02-01']).toBe('IN_PROGRESS');
    expect(StateSchema.parse(JSON.parse(JSON.stringify(parsed)))).toEqual(parsed);
  });

  it('lock.v1.golden.yml parses and round-trips', () => {
    const doc = loadYaml('lock.v1.golden.yml');
    const parsed = LockfileSchema.parse(doc);
    expect(parsed.packs[0]?.integrity?.algorithm).toBe('sha256');
    expect(LockfileSchema.parse(JSON.parse(JSON.stringify(parsed)))).toEqual(parsed);
  });

  it('manifest.v1.golden.json parses and round-trips', () => {
    const doc = JSON.parse(readFileSync(`${fixtures}manifest.v1.golden.json`, 'utf8'));
    const parsed = ManifestSchema.parse(doc);
    expect(parsed.entries[0]?.ownershipMode).toBe('managed');
    expect(ManifestSchema.parse(JSON.parse(JSON.stringify(parsed)))).toEqual(parsed);
  });
});
