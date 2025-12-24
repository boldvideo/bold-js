/**
 * Deep snake_case to camelCase key transformation for API responses.
 * Applied at the transport boundary so SDK users always see camelCase.
 */

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  value !== null &&
  typeof value === 'object' &&
  (Object.getPrototypeOf(value) === Object.prototype ||
    Object.getPrototypeOf(value) === null);

const snakeToCamel = (key: string): string =>
  key.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());

/**
 * Recursively transforms all object keys from snake_case to camelCase.
 * - Arrays: iterates and transforms each element
 * - Plain objects: transforms keys and recurses into values
 * - Primitives: returns as-is
 * - Non-plain objects (Date, etc.): returns as-is
 */
export function camelizeKeys<T>(input: T): T {
  if (Array.isArray(input)) {
    return input.map((item) => camelizeKeys(item)) as T;
  }

  if (!isPlainObject(input)) {
    return input;
  }

  const out: Record<string, unknown> = {};

  for (const [rawKey, value] of Object.entries(input)) {
    const key = snakeToCamel(rawKey);
    out[key] = camelizeKeys(value);
  }

  return out as T;
}
