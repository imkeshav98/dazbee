// Where a number field's fill sits, in percent of the field's width: from the start of its range to
// the value, or, for a range either side of 0, from 0 out to the value either way; and `at`, where
// the value is, for the line that marks it. A value the layers don't share, or one left unset (Auto),
// has no fill and no line, nor has a field without a range (`at` is null).
export function fillOf(
  value: number | 'mixed' | undefined,
  range: readonly [number, number] | undefined,
): { from: number; width: number; at: number | null } {
  if (!range || !(range[1] > range[0]) || !Number.isFinite(range[0]) || !Number.isFinite(range[1]))
    return { from: 0, width: 0, at: null }
  const [lo, hi] = range
  const at = (n: number) => ((Math.min(hi, Math.max(lo, n)) - lo) / (hi - lo)) * 100
  const zero = lo < 0 ? at(0) : 0
  const end = typeof value === 'number' ? at(value) : zero
  return { from: Math.min(zero, end), width: Math.abs(end - zero), at: typeof value === 'number' ? end : null }
}
