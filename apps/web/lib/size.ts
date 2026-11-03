// A layer's width or height as a patch: with the ratio kept, the other side follows by the same
// factor, rounded as the fields show it; a box with a side of 0 has no ratio, so only that side changes.
type Box = { width: number; height: number }
type Axis = keyof Box

export const tidy = (n: number) => Math.round(n * 100) / 100
export const sizeOf = ({ width, height }: { width: number; height: number }) => `${width} × ${height}`
/** A size as a chip shows it, short. */
export const shortSizeOf = ({ width, height }: { width: number; height: number }) => `${width}×${height}`

export function sizeTo(now: Box, axis: Axis, to: number, keepRatio: boolean): Partial<Box> {
  const other: Axis = axis === 'width' ? 'height' : 'width'
  if (!keepRatio || now.width <= 0 || now.height <= 0) return { [axis]: to }
  return { [axis]: to, [other]: tidy((now[other] * to) / now[axis]) }
}
