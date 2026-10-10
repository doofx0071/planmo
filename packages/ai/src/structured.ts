/**
 * Dependency-free JSON Schema validation (a deliberate SUBSET).
 *
 * The AI boundary requires structured output to be schema-validated before it
 * can drive artifact generation (docs/06-agent-engine/ai-boundary.md). PlanMo
 * adds no validator dependency, so this module implements the subset of JSON
 * Schema the providers and their callers need: `type`, `const`, `enum`,
 * `required`, `properties`, `additionalProperties`, `items`, `minItems`,
 * `maxItems`, `minLength`, `maxLength`, `minimum`, `maximum`, `pattern`,
 * `anyOf`, `allOf`, and the boolean schemas `true`/`false`.
 *
 * Unsupported keywords are ignored (the value passes that keyword). Validation
 * is pure and deterministic and error messages are stable, so goldens do not
 * churn. Errors are ordered by the schema's own key order.
 */

import { isPlainObject } from './util.js';

export interface ValidationValid {
  valid: true;
}

export interface ValidationInvalid {
  valid: false;
  errors: readonly string[];
}

export type ValidationResult = ValidationValid | ValidationInvalid;

function matchesType(value: unknown, type: string): boolean {
  switch (type) {
    case 'string':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'integer':
      return typeof value === 'number' && Number.isInteger(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'null':
      return value === null;
    case 'object':
      return isPlainObject(value);
    case 'array':
      return Array.isArray(value);
    default:
      // Unknown `type` keyword: do not constrain the value.
      return true;
  }
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, index) => deepEqual(item, b[index]));
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    return keysA.length === keysB.length && keysA.every((key) => deepEqual(a[key], b[key]));
  }
  return false;
}

function validate(value: unknown, schema: unknown, path: string, errors: string[]): void {
  if (schema === true) return;
  if (schema === false) {
    errors.push(`${path}: no value is permitted (schema is false)`);
    return;
  }
  if (!isPlainObject(schema)) return; // Non-object, non-boolean schema: unconstrained.

  if ('const' in schema && !deepEqual(value, schema.const)) {
    errors.push(`${path}: must equal the constant ${JSON.stringify(schema.const)}`);
  }

  if (Array.isArray(schema.enum) && !schema.enum.some((candidate) => deepEqual(value, candidate))) {
    errors.push(`${path}: must be one of ${JSON.stringify(schema.enum)}`);
  }

  if (schema.type !== undefined) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((type) => typeof type === 'string' && matchesType(value, type))) {
      errors.push(`${path}: expected type ${JSON.stringify(schema.type)}`);
    }
  }

  if (Array.isArray(schema.allOf)) {
    for (const sub of schema.allOf) validate(value, sub, path, errors);
  }

  if (Array.isArray(schema.anyOf)) {
    const matched = schema.anyOf.some((sub) => {
      const local: string[] = [];
      validate(value, sub, path, local);
      return local.length === 0;
    });
    if (!matched) errors.push(`${path}: does not match any allowed schema`);
  }

  if (typeof value === 'string') {
    if (typeof schema.minLength === 'number' && value.length < schema.minLength) {
      errors.push(`${path}: shorter than minLength ${schema.minLength}`);
    }
    if (typeof schema.maxLength === 'number' && value.length > schema.maxLength) {
      errors.push(`${path}: longer than maxLength ${schema.maxLength}`);
    }
    if (typeof schema.pattern === 'string') {
      try {
        if (!new RegExp(schema.pattern).test(value)) {
          errors.push(`${path}: does not match pattern ${schema.pattern}`);
        }
      } catch {
        errors.push(`${path}: schema has an invalid pattern`);
      }
    }
  }

  if (typeof value === 'number') {
    if (typeof schema.minimum === 'number' && value < schema.minimum) {
      errors.push(`${path}: below minimum ${schema.minimum}`);
    }
    if (typeof schema.maximum === 'number' && value > schema.maximum) {
      errors.push(`${path}: above maximum ${schema.maximum}`);
    }
  }

  if (Array.isArray(value)) {
    if (typeof schema.minItems === 'number' && value.length < schema.minItems) {
      errors.push(`${path}: fewer than minItems ${schema.minItems}`);
    }
    if (typeof schema.maxItems === 'number' && value.length > schema.maxItems) {
      errors.push(`${path}: more than maxItems ${schema.maxItems}`);
    }
    if (schema.items !== undefined) {
      value.forEach((item, index) => validate(item, schema.items, `${path}[${index}]`, errors));
    }
  }

  if (isPlainObject(value)) {
    const properties = isPlainObject(schema.properties) ? schema.properties : {};
    if (Array.isArray(schema.required)) {
      for (const key of schema.required) {
        if (typeof key === 'string' && !(key in value)) {
          errors.push(`${path}: missing required property "${key}"`);
        }
      }
    }
    for (const [key, sub] of Object.entries(properties)) {
      if (key in value) validate(value[key], sub, `${path}.${key}`, errors);
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!(key in properties)) errors.push(`${path}: unexpected property "${key}"`);
      }
    } else if (isPlainObject(schema.additionalProperties)) {
      for (const key of Object.keys(value)) {
        if (!(key in properties)) {
          validate(value[key], schema.additionalProperties, `${path}.${key}`, errors);
        }
      }
    }
  }
}

/** Validate `value` against a JSON Schema (the subset documented above). */
export function validateAgainstSchema(value: unknown, schema: unknown): ValidationResult {
  const errors: string[] = [];
  validate(value, schema, '$', errors);
  return errors.length === 0 ? { valid: true } : { valid: false, errors };
}
