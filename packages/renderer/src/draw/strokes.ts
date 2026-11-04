import type { Canvas, CanvasKit, Paint as CkPaint, Path } from '@dazbee/canvaskit'
import type { BooleanProps, GraphicProps, Rect, Shape, Stroke } from '@dazbee/schema'

import type { Resources } from '../resources.ts'
import { fillPath, paintFor } from './paint.ts'
import { EVERYWHERE } from './paths.ts'

type LineShape = Extract<Shape, { kind: 'line' }>

/** How long a line's end is, in widths of the stroke it ends. */
const END_SIZE = 3

/** Fills and strokes an outline; a line's strokes are always centred, and draw its ends. */
export function drawShape(
  ck: CanvasKit,
  canvas: Canvas,
  path: Path,
  props: GraphicProps | BooleanProps,
  resources: Resources,
  line: LineShape | null,
) {
  if (!line) for (const fill of props.fills) fillPath(ck, canvas, path, fill, props, resources)
  strokePath(ck, canvas, path, props, resources, line)
}

/**
 * A shape's or a box's strokes along `path`, inside, centred on or outside it; a line's along it,
 * with its ends. An outside stroke is clipped to everywhere but the outline, worked out as one path
 * with the outline's own fill rule kept, which an SVG can hold where it can't hold a difference.
 */
export function strokePath(
  ck: CanvasKit,
  canvas: Canvas,
  path: Path,
  props: Rect & { strokes: readonly Stroke[] },
  resources: Resources,
  line: LineShape | null,
) {
  let outside: Path | null = null
  for (const stroke of props.strokes) {
    const paint = paintFor(ck, stroke.paint, props, resources)
    if (!paint) continue
    paint.setStyle(ck.PaintStyle.Stroke)
    paint.setStrokeCap({ butt: ck.StrokeCap.Butt, round: ck.StrokeCap.Round, square: ck.StrokeCap.Square }[stroke.cap])
    paint.setStrokeJoin(
      { miter: ck.StrokeJoin.Miter, round: ck.StrokeJoin.Round, bevel: ck.StrokeJoin.Bevel }[stroke.join],
    )
    paint.setStrokeMiter(stroke.miterLimit)
    if (stroke.dashes.length > 0) {
      // Skia needs dash and gap pairs; an odd list repeats, as in SVG.
      const dash = ck.PathEffect.MakeDash(
        stroke.dashes.length % 2 === 0 ? [...stroke.dashes] : [...stroke.dashes, ...stroke.dashes],
        stroke.dashOffset,
      )
      paint.setPathEffect(dash)
      dash.delete()
    }
    canvas.save()
    if (line) {
      paint.setStrokeWidth(stroke.width)
      drawLine(ck, canvas, props, line, stroke, paint)
      canvas.restore()
      paint.delete()
      continue
    }
    if (stroke.align === 'center') {
      paint.setStrokeWidth(stroke.width)
    } else {
      // Half of a doubled stroke falls on each side of the outline; the clip keeps the wanted half.
      paint.setStrokeWidth(stroke.width * 2)
      if (stroke.align === 'inside') canvas.clipPath(path, ck.ClipOp.Intersect, true)
      else {
        if (!outside) {
          const everywhere = new ck.PathBuilder().addRect(EVERYWHERE).detachAndDelete()
          outside = ck.Path.MakeFromOp(everywhere, path, ck.PathOp.Difference)
          everywhere.delete()
        }
        if (outside) canvas.clipPath(outside, ck.ClipOp.Intersect, true)
      }
    }
    canvas.drawPath(path, paint)
    canvas.restore()
    paint.delete()
  }
  outside?.delete()
}

/**
 * How far strokes reach past the outline: a mitred corner up to the miter limit × half the
 * width, a square cap √2 × half; a line's ends reach END_SIZE widths.
 */
export function strokeReach(strokes: readonly Stroke[], line: boolean) {
  return Math.max(
    0,
    ...strokes.map((s) => {
      if (line) return s.width * END_SIZE
      const half = s.align === 'inside' ? 0 : s.align === 'center' ? s.width / 2 : s.width
      return half * (s.join === 'miter' ? Math.max(s.miterLimit, Math.SQRT2) : Math.SQRT2)
    }),
  )
}

/**
 * A line with one stroke, and its ends: an arrow is two strokes back from the tip, a triangle
 * and a circle are filled, END_SIZE widths long. The line stops short under a triangle, so its
 * point stays sharp.
 */
function drawLine(ck: CanvasKit, canvas: Canvas, box: Rect, line: LineShape, stroke: Stroke, paint: CkPaint) {
  const w = stroke.width
  const size = w * END_SIZE
  const y = box.y + box.height / 2
  const from = box.x + (line.start === 'triangle' ? size / 2 : 0)
  const to = box.x + box.width - (line.end === 'triangle' ? size / 2 : 0)
  if (to > from) canvas.drawLine(from, y, to, y, paint)
  // Ends are solid, whatever the dashes.
  paint.setPathEffect(null)
  for (const [end, tip, back] of [
    [line.start, box.x, 1],
    [line.end, box.x + box.width, -1],
  ] as const) {
    if (end === 'none') continue
    const base = tip + back * size
    if (end === 'arrow') {
      const shaft = new ck.PathBuilder()
        .moveTo(base, y - size / 2)
        .lineTo(tip, y)
        .lineTo(base, y + size / 2)
        .detachAndDelete()
      canvas.drawPath(shaft, paint)
      shaft.delete()
      continue
    }
    const fill = paint.copy()
    fill.setStyle(ck.PaintStyle.Fill)
    if (end === 'circle') canvas.drawCircle(tip, y, size / 2, fill)
    else {
      const head = new ck.PathBuilder()
        .addPolygon([tip, y, base, y - size / 2, base, y + size / 2], true)
        .detachAndDelete()
      canvas.drawPath(head, fill)
      head.delete()
    }
    fill.delete()
  }
}
