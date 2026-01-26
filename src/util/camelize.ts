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

export type CamelizeOptions = {
  /**
   * Keys whose values should be preserved as-is (not recursed into).
   * The key name itself is still camelized, but the value is treated as opaque.
   * Useful for user-defined metadata maps like `traits` where keys are arbitrary.
   */
  preserveKeys?: string[];
};

/**
 * Recursively transforms all object keys from snake_case to camelCase.
 * - Arrays: iterates and transforms each element
 * - Plain objects: transforms keys and recurses into values
 * - Primitives: returns as-is
 * - Non-plain objects (Date, etc.): returns as-is
 *
 * Use `preserveKeys` to skip recursion into user-defined metadata maps.
 */
export function camelizeKeys<T>(input: T, options: CamelizeOptions = {}): T {
  const preserve = new Set(options.preserveKeys ?? []);

  if (Array.isArray(input)) {
    return input.map((item) => camelizeKeys(item, options)) as T;
  }

  if (!isPlainObject(input)) {
    return input;
  }

  const out: Record<string, unknown> = {};

  for (const [rawKey, value] of Object.entries(input)) {
    const key = snakeToCamel(rawKey);

    if (preserve.has(rawKey) || preserve.has(key)) {
      out[key] = value;
      continue;
    }

    out[key] = camelizeKeys(value, options);
  }

  return out as T;
}
