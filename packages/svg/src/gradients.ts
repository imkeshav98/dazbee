// SVG gradients as the design's paints. A gradient follows its href to the gradients it builds on,
// and its stops, ends and centre are carried from the gradient's own space into the layer's box.

import type { Paint, Rect } from '@dazbee/schema'

import { parseColor, withOpacity } from './color.ts'
import { clamp01, length } from './lengths.ts'
import { styleOf } from './style.ts'
import {
  apply,
  IDENTITY,
  invert,
  lengthScale,
  type Matrix,
  multiply,
  parseTransform,
  scale,
  translate,
} from './transform.ts'
import type { Context } from './types.ts'
import type { XmlElement } from './xml.ts'

export function gradientPaint(
  context: Pick<Context, 'ids' | 'rules' | 'viewport'>,
  element: XmlElement,
  m: Matrix,
  user: Rect,
  box: Rect,
): Paint | null {
  const { rules, viewport } = context
  const { attrs, stops: stopElements } = gradientOf(context, element)
  let last = 0
  const stops = stopElements.map((stop) => {
    const style = styleOf(stop, {}, rules)
    const raw = stop.attrs.offset ?? '0'
    const offset = Math.max(
      last,
      clamp01(raw.trim().endsWith('%') ? Number.parseFloat(raw) / 100 : Number.parseFloat(raw)),
    )
    last = offset
    const color = parseColor(style['stop-color'] ?? 'black') ?? '#000000FF'
    return { offset, color: withOpacity(color, Number.parseFloat(style['stop-opacity'] ?? '1')) }
  })
  if (stops.length === 0) return null
  const solid: Paint = { type: 'solid', color: (stops.at(-1) ?? stops[0])?.color as string }
  if (stops.length === 1 || !(box.width > 0 && box.height > 0)) return solid

  const bounding = attrs.gradientUnits !== 'userSpaceOnUse'
  if (bounding && !(user.width > 0 && user.height > 0)) return solid
  const coord = (key: string, whole: number, fallback: string) => {
    const raw = attrs[key] ?? fallback
    if (bounding) return raw.trim().endsWith('%') ? Number.parseFloat(raw) / 100 : Number.parseFloat(raw)
    return length(raw, whole)
  }
  // Gradient space to the design: the gradient's transform, then the bounding box, then the element's.
  const space = bounding ? multiply(translate(user.x, user.y), scale(user.width, user.height)) : IDENTITY
  const toDesign = multiply(m, multiply(space, parseTransform(attrs.gradientTransform ?? '')))
  const unitBox = multiply(translate(box.x, box.y), scale(box.width, box.height))
  const fromUnit = invert(toDesign)
  const toUnit = invert(unitBox)
  if (!fromUnit || !toUnit) return solid
  const vw = viewport.width
  const vh = viewport.height

  if (element.name === 'linearGradient') {
    const p1 = { x: coord('x1', vw, '0%'), y: coord('y1', vh, '0%') }
    const p2 = { x: coord('x2', vw, '100%'), y: coord('y2', vh, '0%') }
    const d = { x: p2.x - p1.x, y: p2.y - p1.y }
    const dd = d.x * d.x + d.y * d.y
    if (!(dd > 0)) return solid
    // t, the offset along the gradient, is an affine function of the unit-box point u:
    // t(u) = h·u + c. The design's linear gradient from `from` to `to` is the same function.
    const k = multiply(fromUnit, unitBox)
    const h = { x: (k[0] * d.x + k[1] * d.y) / dd, y: (k[2] * d.x + k[3] * d.y) / dd }
    const c = ((k[4] - p1.x) * d.x + (k[5] - p1.y) * d.y) / dd
    const hh = h.x * h.x + h.y * h.y
    if (!(hh > 0)) return solid
    const from = { x: (-c * h.x) / hh + 0, y: (-c * h.y) / hh + 0 }
    return { type: 'linear', from, to: { x: from.x + h.x / hh, y: from.y + h.y / hh }, stops }
  }
  const r = coord('r', Math.hypot(vw, vh) / Math.SQRT2, '50%')
  if (!(r > 0)) return solid
  // The circle lands in the unit box as an ellipse when the drawing is stretched; it keeps its area.
  const toBox = multiply(toUnit, toDesign)
  const center = apply(toBox, coord('cx', vw, '50%'), coord('cy', vh, '50%'))
  const radius = r * lengthScale(toBox)
  return radius > 0 ? { type: 'radial', center, radius, stops } : solid
}

/** A gradient's attributes and stops, following its href to the gradients it builds on. */
function gradientOf(context: Pick<Context, 'ids'>, element: XmlElement) {
  const { ids } = context
  const attrs: Record<string, string> = {}
  let stops: XmlElement[] = []
  const seen = new Set<XmlElement>()
  for (
    let at: XmlElement | undefined = element;
    at && !seen.has(at);
    at = ids.get((at.attrs.href ?? '').replace(/^#/, ''))
  ) {
    seen.add(at)
    for (const [key, value] of Object.entries(at.attrs)) attrs[key] ??= value
    const own = at.children.filter((c): c is XmlElement => typeof c !== 'string' && c.name === 'stop')
    if (stops.length === 0) stops = own
  }
  return { attrs, stops }
}
