// Laid out to fit: a layer copied from a frame of one size into a frame of another.
import type { Rect } from '@dazbee/schema'

import { round } from '../geometry.ts'

export interface Size {
  width: number
  height: number
}
/** The parts of a text layer's props that hold font sizes. */
interface TextLike {
  style?: { fontSize: number }
  runs?: { style: { fontSize?: number } }[]
  shrinkToFit?: { min: number; max: number }
}
/** The part of a graphic's props that says how a path is drawn. */
interface PathLike {
  shape?: { kind: string; drawnIn?: Size }
}

/** The smallest font size a scaled text gets, so rounding never leaves it at 0. */
const MIN_FONT_SIZE = 0.01

/**
 * A layer's props laid out to fit a frame of `fit.to` from one of `fit.from`. `root` is the box, as it
 * was, of the copied root the layer is under (its own box for a root), whose centre leads it.
 */
export function fitted<P extends Readonly<Record<string, unknown>>>(
  props: P,
  root: Rect,
  fit: { from: Size; to: Size },
): P {
  const sx = fit.to.width / fit.from.width
  const sy = fit.to.height / fit.from.height
  const s = Math.min(sx, sy)
  const box = props as unknown as Rect
  const c = { x: root.x + root.width / 2, y: root.y + root.height / 2 }
  const d = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  const centre = { x: c.x * sx + (d.x - c.x) * s, y: c.y * sy + (d.y - c.y) * s }
  const width = box.width * s
  const height = box.height * s
  return {
    ...props,
    x: round(centre.x - width / 2),
    y: round(centre.y - height / 2),
    width: round(width),
    height: round(height),
    ...fontSizes(props as TextLike, s),
    ...drawnIn(props as PathLike, box),
  }
}

/** A path drawn at its own size, given its box as the box it was drawn in; nothing for any other layer. */
function drawnIn({ shape }: PathLike, box: Size): Partial<PathLike> {
  if (shape?.kind !== 'path' || shape.drawnIn) return {}
  return { shape: { ...shape, drawnIn: { width: box.width, height: box.height } } }
}

/** A text's font sizes, its runs' and its shrink-to-fit bounds, scaled; nothing for other layers. */
function fontSizes(text: TextLike, s: number): Partial<TextLike> {
  if (!text.style) return {}
  const size = (n: number) => Math.max(MIN_FONT_SIZE, round(n * s))
  const out: Partial<TextLike> = { style: { ...text.style, fontSize: size(text.style.fontSize) } }
  if (text.runs)
    out.runs = text.runs.map((run) =>
      run.style.fontSize === undefined ? run : { ...run, style: { ...run.style, fontSize: size(run.style.fontSize) } },
    )
  if (text.shrinkToFit) out.shrinkToFit = { min: size(text.shrinkToFit.min), max: size(text.shrinkToFit.max) }
  return out
}
