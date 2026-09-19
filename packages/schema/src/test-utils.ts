import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import { stringify as yamlStringify, parse as yamlParse } from 'yaml';

/**
 * Round-trip helpers used across the schema tests.
 *
 * Round-trip = parse (Zod) -> serialize (JSON / YAML, the two formats PlanMo
 * persists) -> re-parse (Zod) -> deep equal. This proves the schema is a
 * stable bijection over its domain: no data is lost or invented when a
 * document leaves and re-enters the system.
 */

export function roundTripJson<T>(schema: z.ZodType<T>, doc: unknown): T {
  const parsed = schema.parse(doc);
  const json = JSON.stringify(parsed);
  const reparsed = schema.parse(JSON.parse(json));
  expect(reparsed).toEqual(parsed);
  return reparsed;
}

export function roundTripYaml<T>(schema: z.ZodType<T>, doc: unknown): T {
  const parsed = schema.parse(doc);
  const yaml = yamlStringify(parsed);
  const reparsed = schema.parse(yamlParse(yaml));
  expect(reparsed).toEqual(parsed);
  return reparsed;
}

export function expectRejected<T>(
  schema: z.ZodType<T>,
  doc: unknown,
  messagePart?: string | RegExp,
): void {
  const result = schema.safeParse(doc);
  expect(result.success).toBe(false);
  if (!result.success && messagePart) {
    const text = JSON.stringify(result.error.issues);
    if (messagePart instanceof RegExp) {
      expect(text).toMatch(messagePart);
    } else {
      expect(text).toContain(messagePart);
    }
  }
}
