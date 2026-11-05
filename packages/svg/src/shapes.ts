// SVG shapes as graphic layers: each shape's outline, baked into the design's coordinates, with
// its fill and stroke paints.

import type { Path } from '@dazbee/canvaskit'
import type { BlendMode, Paint, Rect } from '@dazbee/schema'

import { parsePaint } from './color.ts'
import { gradientPaint } from './gradients.ts'
import { clamp01, length, numbers } from './lengths.ts'
import { boundsOf, pathData, transformed } from './path-data.ts'
import type { Style } from './style.ts'
import { lengthScale, type Matrix } from './transform.ts'
import type { Context, Piece, PropsOf } from './types.ts'
import type { XmlElement } from './xml.ts'

export const BLEND_MODES = new Set([
  'multiply',
  'screen',
  'overlay',
  'darken',
  'lighten',
  'color-dodge',
  'color-burn',
  'hard-light',
  'soft-light',
  'difference',
  'exclusion',
  'hue',
  'saturation',
  'color',
  'luminosity',
])

const DEFAULT_NAMES: Record<string, string> = {
  path: 'Path',
  rect: 'Rectangle',
  circle: 'Ellipse',
  ellipse: 'Ellipse',
  line: 'Line',
  polyline: 'Line',
  polygon: 'Polygon',
}
export const SHAPES = new Set(Object.keys(DEFAULT_NAMES))

const oneOf = <T extends string>(value: string | undefined, options: readonly T[], fallback: T): T =>
  options.includes(value as T) ? (value as T) : fallback

export function shape(context: Context, element: XmlElement, style: Style, m: Matrix): Piece | null {
  const { ck, viewport, nodes, skipped, newId } = context
  if (style.visibility === 'hidden' || style.visibility === 'collapse') return null
  const own = outline(context, element, style)
  if (!own) return null
  const user = boundsOf(own)
  const drawn = transformed(ck, own, m)
  own.delete()
  const box = boundsOf(drawn)
  const placed = new ck.PathBuilder(drawn).offset(-box.x, -box.y).detachAndDelete()
  drawn.delete()
  const d = pathData(placed)
  placed.delete()
  if (!d) return null

  const fills: Paint[] = []
  const fill = paintOf(context, style.fill ?? 'black', style['fill-opacity'], style, m, user, box)
  // A line has no inside to fill.
  if (fill && element.name !== 'line') fills.push(fill)
  const strokes: NonNullable<PropsOf<'graphic'>['strokes']> = []
  const strokeWidth =
    length(style['stroke-width'], Math.hypot(viewport.width, viewport.height) / Math.SQRT2, 1) * lengthScale(m)
  const strokePaint = paintOf(context, style.stroke, style['stroke-opacity'], style, m, user, box)
  if (strokePaint && strokeWidth > 0) {
    const dashes = numbers(style['stroke-dasharray']).map((n) => Math.max(0, n * lengthScale(m)))
    strokes.push({
      paint: strokePaint,
      width: strokeWidth,
      ...(dashes.some((n) => n > 0) ? { dashes, dashOffset: length(style['stroke-dashoffset']) * lengthScale(m) } : {}),
      cap: oneOf(style['stroke-linecap'], ['butt', 'round', 'square'] as const, 'butt'),
      join: oneOf(style['stroke-linejoin'], ['miter', 'round', 'bevel'] as const, 'miter'),
      miterLimit: Math.max(1, Number.parseFloat(style['stroke-miterlimit'] ?? '4') || 4),
    })
  }
  if (fills.length === 0 && strokes.length === 0) return null
  if (
    ['marker-start', 'marker-mid', 'marker-end', 'marker'].some(
      (key) => element.attrs[key] && element.attrs[key] !== 'none',
    )
  )
    skipped.add('marker')

  const id = newId()
  const opacity = clamp01(Number.parseFloat(style.opacity ?? '1'))
  const blend = style['mix-blend-mode']
  nodes[id] = {
    type: 'graphic',
    parentId: 'root',
    link: id,
    index: 'a0',
    name: nameOf(element, DEFAULT_NAMES[element.name] ?? 'Path'),
    props: {
      ...box,
      shape: {
        kind: 'path',
        d,
        fillRule: style['fill-rule'] === 'evenodd' ? 'evenodd' : 'nonzero',
        drawnIn: { width: box.width, height: box.height },
      },
      fills,
      strokes,
      ...(opacity < 1 ? { opacity } : {}),
      ...(blend && BLEND_MODES.has(blend) ? { blendMode: blend as BlendMode } : {}),
    },
  }
  return { id, box }
}

/** The element's outline in its own user space, or null when it has none. */
export function outline(context: Pick<Context, 'ck' | 'viewport'>, element: XmlElement, style: Style): Path | null {
  const { ck, viewport } = context
  const a = element.attrs
  const n = (key: string, whole: number) => length(a[key], whole)
  const vw = viewport.width
  const vh = viewport.height
  let path: Path | null = null
  switch (element.name) {
    case 'path':
      path = a.d ? ck.Path.MakeFromSVGString(a.d) : null
      break
    case 'rect': {
      const w = n('width', vw)
      const h = n('height', vh)
      if (!(w > 0 && h > 0)) return null
      let rx = a.rx === undefined || a.rx === 'auto' ? undefined : n('rx', vw)
      let ry = a.ry === undefined || a.ry === 'auto' ? undefined : n('ry', vh)
      rx ??= ry ?? 0
      ry ??= rx
      const rect = ck.XYWHRect(n('x', vw), n('y', vh), w, h)
      path = new ck.PathBuilder()
        .addRRect(ck.RRectXY(rect, Math.min(Math.max(0, rx), w / 2), Math.min(Math.max(0, ry), h / 2)))
        .detachAndDelete()
      break
    }
    case 'circle': {
      const r = length(a.r, Math.hypot(vw, vh) / Math.SQRT2)
      if (!(r > 0)) return null
      path = new ck.PathBuilder().addOval(ck.XYWHRect(n('cx', vw) - r, n('cy', vh) - r, 2 * r, 2 * r)).detachAndDelete()
      break
    }
    case 'ellipse': {
      let rx = a.rx === undefined || a.rx === 'auto' ? undefined : n('rx', vw)
      let ry = a.ry === undefined || a.ry === 'auto' ? undefined : n('ry', vh)
      rx ??= ry ?? 0
      ry ??= rx
      if (!(rx > 0 && ry > 0)) return null
      path = new ck.PathBuilder()
        .addOval(ck.XYWHRect(n('cx', vw) - rx, n('cy', vh) - ry, 2 * rx, 2 * ry))
        .detachAndDelete()
      break
    }
    case 'line':
      path = new ck.PathBuilder().moveTo(n('x1', vw), n('y1', vh)).lineTo(n('x2', vw), n('y2', vh)).detachAndDelete()
      break
    case 'polyline':
    case 'polygon': {
      const points = numbers(a.points)
      if (points.length % 2) points.pop()
      if (points.length < 4) return null
      path = new ck.PathBuilder().addPolygon(points, element.name === 'polygon').detachAndDelete()
      break
    }
  }
  if (!path) return null
  if (path.isEmpty()) {
    path.delete()
    return null
  }
  path.setFillType(style['fill-rule'] === 'evenodd' ? ck.FillType.EvenOdd : ck.FillType.Winding)
  return path
}

/**
 * A fill or stroke paint. `user` is the outline's box in its own user space, which an
 * objectBoundingBox gradient spans; `box` is the layer's box, which the design's gradients span.
 */
export function paintOf(
  context: Context,
  raw: string | undefined,
  opacityText: string | undefined,
  style: Style,
  m: Matrix,
  user: Rect,
  box: Rect,
): Paint | null {
  const { ids, skipped } = context
  if (raw === undefined) return null
  const value = raw.trim().toLowerCase() === 'currentcolor' ? (style.color ?? 'black') : raw
  const paint = parsePaint(value)
  if (!paint || 'none' in paint) return null
  const opacity = clamp01(Number.parseFloat(opacityText ?? '1'))
  const extra = opacity < 1 ? { opacity } : {}
  if ('color' in paint) return { type: 'solid', color: paint.color, ...extra }
  const target = ids.get(paint.url)
  if (target?.name === 'linearGradient' || target?.name === 'radialGradient') {
    const gradient = gradientPaint(context, target, m, user, box)
    return gradient ? { ...gradient, ...extra } : null
  }
  if (target?.name === 'pattern') skipped.add('pattern')
  return paint.fallback ? { type: 'solid', color: paint.fallback, ...extra } : null
}

export function nameOf(element: XmlElement, fallback: string) {
  return element.attrs['data-name'] ?? element.attrs.label ?? element.attrs.id ?? fallback
}
