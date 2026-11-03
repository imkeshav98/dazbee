// Helpers over plain JSON values for every schema file. This module imports nothing, so importing
// it never makes a cycle.

/** Whether a value is an object that isn't null or an array. */
export const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/** Freezes an object and everything inside it, so a cached result can be shared safely. */
export function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const inner of Object.values(value)) deepFreeze(inner)
  }
  return value
}
