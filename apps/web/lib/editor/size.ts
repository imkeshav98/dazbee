// Sizes as the app writes them, and a layer's width or height as a patch: with the ratio kept, the
// other side follows by the same factor, rounded as the fields show it; a box with a side of 0 has no
// ratio, so only that side changes.
type Box = { width: number; height: number }
type Axis = keyof Box

export function sizeTo(now: Box, axis: Axis, to: number, keepRatio: boolean): Partial<Box> {
  const other: Axis = axis === 'width' ? 'height' : 'width'
  if (!keepRatio || now.width <= 0 || now.height <= 0) return { [axis]: to }
  return { [axis]: to, [other]: tidy((now[other] * to) / now[axis]) }
}

/** A size as the app writes it, in numerals that read the same in every locale. */
export function sizeOf({ width, height }: Box) {
  return `${width} × ${height}`
}

/** A size as a chip shows it, short. */
export function shortSizeOf({ width, height }: Box) {
  return `${width}×${height}`
}

/** A number rounded to hundredths, as the fields show it. */
export function tidy(n: number) {
  return Math.round(n * 100) / 100
}
