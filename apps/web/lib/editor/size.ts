// Sizes as the app writes them and as they are typed, and a layer's width or height as a patch: with
// the ratio kept, the other side follows by the same factor, rounded as the fields show it; a box
// with a side of 0 has no ratio, so only that side changes.
import { type SizeIssue,sizeIssue } from '@dazbee/schema'

type Box = { width: number; height: number }
type Axis = keyof Box

/** Arabic-Indic and Persian digits: each run starts at a multiple of 16, so a digit's code modulo 16 is its value. */
const EASTERN_DIGITS = /[\u0660-\u0669\u06F0-\u06F9]/g

export function sizeTo(now: Box, axis: Axis, to: number, keepRatio: boolean): Partial<Box> {
  const other: Axis = axis === 'width' ? 'height' : 'width'
  if (!keepRatio || now.width <= 0 || now.height <= 0) return { [axis]: to }
  return { [axis]: to, [other]: tidy((now[other] * to) / now[axis]) }
}

/**
 * A size typed into a width and a height field: null while either is empty, else its numbers and
 * what keeps it from being a frame's size, if anything (`sizeIssue`). Anything that is not a number
 * reads as not whole.
 */
export function typedSize(width: string, height: string): (Box & { issue?: SizeIssue }) | null {
  const [w, h] = [width, height].map((text) => text.trim().replace(EASTERN_DIGITS, (d) => String(d.charCodeAt(0) % 16)))
  if (!w || !h) return null
  const size = { width: Number(w), height: Number(h) }
  const issue = sizeIssue(size.width, size.height)
  return issue ? { ...size, issue } : size
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
