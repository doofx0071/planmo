/** PlanMo product-level constants and small deterministic helpers. */

export const PRODUCT_NAME = 'PlanMo' as const;

export const PRODUCT_SLUG = 'planmo' as const;

export * from './ids.js';
export * from './csv.js';

/** Returns true when `value` is a string containing at least one non-whitespace character. */
export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
