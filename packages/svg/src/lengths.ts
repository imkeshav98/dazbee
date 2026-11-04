// Numbers as SVG attributes write them: lengths with their units, lists of numbers, and fractions
// held between 0 and 1.

const UNITS: Record<string, number> = {
  px: 1,
  pt: 4 / 3,
  pc: 16,
  mm: 96 / 25.4,
  cm: 96 / 2.54,
  in: 96,
  em: 16,
  rem: 16,
  ex: 8,
}

/** A length in pixels; a percentage is of `whole`. */
export function length(raw: string | undefined, whole = 0, fallback = 0): number {
  const match = /^\s*([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)\s*([a-z%]*)\s*$/i.exec(raw ?? '')
  if (!match) return fallback
  const n = Number.parseFloat(match[1] ?? '')
  const unit = (match[2] ?? '').toLowerCase()
  if (unit === '%') return (n / 100) * whole
  return n * (UNITS[unit || 'px'] ?? 1)
}
export const numbers = (raw: string | undefined) =>
  (raw ?? '').match(/[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/gi)?.map(Number) ?? []

export const clamp01 = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 1)
