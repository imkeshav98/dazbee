// Sizes as the app writes them and as they are typed, the size of the frame you are on, and a
// layer's width or height as a patch: with the ratio kept, the other side follows by the same
// factor, rounded as the fields show it; a box with a side of 0 has no ratio, so only that side
// changes.
import type { Editor } from '@dazbee/editor'
import { BLANK_SIZE, coverFrame, type DesignInput, framesOf, type SizeIssue, sizeIssue } from '@dazbee/schema'

type Box = { width: number; height: number }
type Axis = keyof Box

/** A side of a typed size that keeps it from being a frame's size, and why. */
export interface SideIssue {
  side: Axis
  issue: SizeIssue
}

/** Arabic-Indic and Persian digits: each run starts at a multiple of 16, so a digit's code modulo 16 is its value. */
const EASTERN_DIGITS = /[\u0660-\u0669\u06F0-\u06F9]/g
/** The Arabic decimal separator, which Persian uses too. */
const ARABIC_DECIMAL = '\u066B'
/** A side as typed, once in Latin digits: digits with at most one decimal point. */
const DIGITS = /^(?=\.?\d)\d*\.?\d*$/

export function sizeTo(now: Box, axis: Axis, to: number, keepRatio: boolean): Partial<Box> {
  const other: Axis = axis === 'width' ? 'height' : 'width'
  if (!keepRatio || now.width <= 0 || now.height <= 0) return { [axis]: to }
  return { [axis]: to, [other]: tidy((now[other] * to) / now[axis]) }
}

/**
 * A size typed into a width and a height field: null while either is empty, else its numbers and,
 * for each side that keeps it from being a frame's size, that side and why (`sizeIssue`). A side
 * is digits (Latin, Arabic or Persian) with at most one decimal point; anything else, a sign, an
 * exponent or a letter, reads as not whole. With both sides within the limits, a size longer than
 * the ratio allows names its long side.
 */
export function typedSize(width: string, height: string): (Box & { issues: SideIssue[] }) | null {
  const w = sideOf(width)
  const h = sideOf(height)
  if (w === null || h === null) return null
  const issues: SideIssue[] = []
  for (const [side, n] of [
    ['width', w],
    ['height', h],
  ] as const) {
    const issue = sizeIssue(n, n)
    if (issue) issues.push({ side, issue })
  }
  const ratio = issues.length === 0 && sizeIssue(w, h)
  if (ratio) issues.push({ side: w > h ? 'width' : 'height', issue: ratio })
  return { width: w, height: h, issues }
}

/**
 * The size of the frame you are on, which Add page and Add a frame start a new frame at: the picked
 * frame's, else that of the frame the selection is in, else the shown page's first frame's, else
 * the cover frame's, else a blank design's.
 */
export function sizeYouAreOn(
  editor: Pick<Editor, 'pickedFrame' | 'selectedFrame' | 'shownPage'>,
  design: Pick<DesignInput, 'pages' | 'frames'>,
): Box {
  const on = [editor.pickedFrame(), editor.selectedFrame()].find(
    (id) => id !== null && Object.hasOwn(design.frames, id),
  )
  const frame =
    (on ? design.frames[on] : undefined) ??
    framesOf(design, editor.shownPage())[0]?.[1] ??
    coverFrame(design)?.[1] ??
    BLANK_SIZE
  return { width: frame.width, height: frame.height }
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

/** Text with its Arabic-Indic and Persian digits as Latin ones and the Arabic decimal separator as a point. */
export function latinDigits(text: string) {
  return text.replace(EASTERN_DIGITS, (d) => String(d.charCodeAt(0) % 16)).replaceAll(ARABIC_DECIMAL, '.')
}

/** A side as typed: null when empty, its number when it is digits with at most one decimal point, else NaN. */
function sideOf(text: string): number | null {
  const latin = latinDigits(text.trim())
  if (!latin) return null
  return DIGITS.test(latin) ? Number(latin) : Number.NaN
}
