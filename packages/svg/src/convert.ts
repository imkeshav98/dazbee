// An SVG file as layers: shapes become path graphics with their fills (solid, linear and radial)
// and strokes, groups become groups, clip paths and masks become mask layers, and text becomes
// text layers. Every outline is baked into the design's own coordinates, so the layers draw the
// file without a transform of their own. What has no layer to become is left out and named.

import type { CanvasKit, Path } from '@dazbee/canvaskit'
import { LayerTree, MAX_SVG_BYTES, type Paint } from '@dazbee/schema'
import { generateKeyBetween } from 'fractional-indexing'
import { parseColor, parsePaint, withOpacity } from './color.ts'
import { readSheets, styleOf, type Style } from './style.ts'
import { apply, IDENTITY, lengthScale, multiply, parseTransform, scale, translate, type Matrix } from './transform.ts'
import { parseXml, textOf, XmlError, type XmlElement } from './xml.ts'

/** What a file had that the layers leave out. */
export type Skipped =
  | 'filter' | 'image' | 'embedded-font' | 'foreign-object' | 'pattern' | 'marker' | 'script' | 'text-path' | 'external-reference'

export interface Converted {
  tree: LayerTree
  /** The id of the one root in `tree`: a group holding everything. */
  root: string
  /** The file's own size, after `fit`. */
  width: number
  height: number
  skipped: Skipped[]
}

export interface ConvertOptions {
  /** The root group's name. */
  name?: string
  /** Scales the drawing so its longer side is this long. */
  fit?: number
  /** The family a text layer takes, from the families its CSS lists. */
  fontFamily?: (families: string[]) => string
}

export type SvgProblem = 'unreadable' | 'not-svg' | 'empty' | 'too-big'
export class SvgError extends Error {
  readonly problem: SvgProblem
  constructor(problem: SvgProblem, detail?: string) {
    super(detail ? `${problem}: ${detail}` : problem)
    this.problem = problem
  }
}

/** More layers than this, or a file larger than MAX_SVG_BYTES, is refused, so a hostile file can't run away with the page. */
const MAX_LAYERS = 5_000
/**
 * Elements read, counting each time a <use> reads one again, and how deep elements and uses may
 * nest: past these the file is refused, so a fan of uses that draw nothing can't run away either.
 */
const MAX_WORK = 100_000
const MAX_NESTING = 400

type LayerInput = { type: string; parentId: string; index: string; name: string; props: Record<string, unknown> }
type Box = { x: number; y: number; width: number; height: number }
/** A layer made from an element: its id and its box in design pixels. */
interface Piece { id: string; box: Box }

const DEFAULT_NAMES: Record<string, string> = {
  path: 'Path', rect: 'Rectangle', circle: 'Ellipse', ellipse: 'Ellipse', line: 'Line', polyline: 'Line', polygon: 'Polygon',
}
const SHAPES = new Set(Object.keys(DEFAULT_NAMES))
/** Elements that define things for others and draw nothing where they stand. */
const DEFINITIONS = new Set([
  'defs', 'symbol', 'clipPath', 'mask', 'linearGradient', 'radialGradient', 'pattern', 'marker', 'filter',
  'title', 'desc', 'metadata', 'style',
])
const UNCONVERTED: Record<string, Skipped> = {
  image: 'image', foreignObject: 'foreign-object', script: 'script', font: 'embedded-font', 'font-face': 'embedded-font',
  textPath: 'text-path', video: 'image', canvas: 'image', iframe: 'foreign-object', audio: 'foreign-object',
}
const BLEND_MODES = new Set([
  'multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge', 'color-burn', 'hard-light', 'soft-light',
  'difference', 'exclusion', 'hue', 'saturation', 'color', 'luminosity',
])

const UNITS: Record<string, number> = { px: 1, pt: 4 / 3, pc: 16, mm: 96 / 25.4, cm: 96 / 2.54, in: 96, em: 16, rem: 16, ex: 8 }

/** A length in pixels; a percentage is of `whole`. */
function length(raw: string | undefined, whole = 0, fallback = 0): number {
  const match = /^\s*([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)\s*([a-z%]*)\s*$/i.exec(raw ?? '')
  if (!match) return fallback
  const n = Number.parseFloat(match[1] ?? '')
  const unit = (match[2] ?? '').toLowerCase()
  if (unit === '%') return (n / 100) * whole
  return n * (UNITS[unit || 'px'] ?? 1)
}
const numbers = (raw: string | undefined) => (raw ?? '').match(/[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/gi)?.map(Number) ?? []

/** Where a viewBox lands in a viewport of `width` × `height`, as preserveAspectRatio says. */
function viewBoxMatrix(viewBox: string | undefined, width: number, height: number, aspect = ''): Matrix {
  const [minX = 0, minY = 0, w = 0, h = 0] = numbers(viewBox)
  if (!(w > 0 && h > 0)) return IDENTITY
  const [align = 'xMidYMid', fit = 'meet'] = aspect.trim().split(/\s+/)
  const origin = translate(-minX, -minY)
  if (align === 'none') return multiply(scale(width / w, height / h), origin)
  const s = fit === 'slice' ? Math.max(width / w, height / h) : Math.min(width / w, height / h)
  const share = (key: string) => (align.includes(`${key}Min`) ? 0 : align.includes(`${key}Max`) ? 1 : 0.5)
  return multiply(translate((width - w * s) * share('x'), (height - h * s) * share('Y')), multiply(scale(s), origin))
}

/** The 3×3 matrix CanvasKit takes, row by row, for an SVG matrix. */
const ckMatrix = (m: Matrix) => [m[0], m[2], m[4], m[1], m[3], m[5], 0, 0, 1]

const invert = (m: Matrix): Matrix | null => {
  const det = m[0] * m[3] - m[1] * m[2]
  if (!Number.isFinite(det) || Math.abs(det) < 1e-12) return null
  return [m[3] / det, -m[1] / det, -m[2] / det, m[0] / det, (m[2] * m[5] - m[3] * m[4]) / det, (m[1] * m[4] - m[0] * m[5]) / det]
}

const union = (boxes: Box[]): Box => {
  const left = Math.min(...boxes.map((b) => b.x))
  const top = Math.min(...boxes.map((b) => b.y))
  const right = Math.max(...boxes.map((b) => b.x + b.width))
  const bottom = Math.max(...boxes.map((b) => b.y + b.height))
  return { x: left, y: top, width: right - left, height: bottom - top }
}

/** Reads an SVG file into layers. Throws SvgError when the file can't be read or draws nothing. */
export function svgToLayers(ck: CanvasKit, text: string, options: ConvertOptions = {}): Converted {
  if (text.length > MAX_SVG_BYTES) throw new SvgError('too-big')
  let root: XmlElement
  try {
    root = parseXml(text)
  } catch (error) {
    throw new SvgError('unreadable', error instanceof XmlError ? error.message : String(error))
  }
  if (root.name !== 'svg') throw new SvgError('not-svg', `the root is <${root.name}>`)

  const ids = new Map<string, XmlElement>()
  const index = (element: XmlElement) => {
    if (element.attrs.id && !ids.has(element.attrs.id)) ids.set(element.attrs.id, element)
    for (const child of element.children) if (typeof child !== 'string') index(child)
  }
  index(root)
  const rules = readSheets(root, textOf)
  const skipped = new Set<Skipped>()
  if (/@font-face/i.test(styleText(root))) skipped.add('embedded-font')

  const [, , vbWidth = 0, vbHeight = 0] = numbers(root.attrs.viewBox)
  let width = length(root.attrs.width, vbWidth, vbWidth || 300)
  let height = length(root.attrs.height, vbHeight, vbHeight || 150)
  if (root.attrs.width?.trim().endsWith('%')) width = vbWidth || 300
  if (root.attrs.height?.trim().endsWith('%')) height = vbHeight || 150
  if (!(width > 0 && height > 0)) throw new SvgError('empty', 'the drawing has no size')
  const fitScale = options.fit ? options.fit / Math.max(width, height) : 1
  const top = multiply(scale(fitScale), viewBoxMatrix(root.attrs.viewBox, width, height, root.attrs.preserveAspectRatio))
  const viewport = { width: vbWidth || width, height: vbHeight || height }

  const nodes: Record<string, LayerInput> = {}
  let work = 0
  const spend = () => {
    if (++work > MAX_WORK) throw new SvgError('too-big', `more than ${MAX_WORK} elements to read`)
  }
  let nesting = 0
  let made = 0
  const newId = () => {
    if (++made > MAX_LAYERS) throw new SvgError('too-big', `more than ${MAX_LAYERS} layers`)
    return `svg${made}`
  }
  const fontFamily = options.fontFamily ?? ((families: string[]) => families[0] ?? 'Noto Sans')

  /** Puts the pieces inside `parentId`, bottom to top. */
  const adopt = (parentId: string, pieces: Piece[]) => {
    let key: string | null = null
    for (const piece of pieces) {
      key = generateKeyBetween(key, null)
      Object.assign(nodes[piece.id] as object, { parentId, index: key })
    }
  }

  const group = (name: string, pieces: Piece[], style: Style, extra: Record<string, unknown> = {}): Piece => {
    const id = newId()
    const box = union(pieces.map((p) => p.box))
    const opacity = clamp01(Number.parseFloat(style.opacity ?? '1'))
    const blend = style['mix-blend-mode']
    nodes[id] = {
      type: 'group', parentId: 'root', index: 'a0', name,
      props: { ...box, ...(opacity < 1 ? { opacity } : {}), ...(blend && BLEND_MODES.has(blend) ? { blendMode: blend } : {}), ...extra },
    } as LayerInput
    adopt(id, pieces)
    return { id, box }
  }

  const nameOf = (element: XmlElement, fallback: string) => element.attrs['data-name'] ?? element.attrs.label ?? element.attrs.id ?? fallback

  /** The element's outline in its own user space, or null when it has none. */
  function outline(element: XmlElement, style: Style): Path | null {
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
        path = new ck.PathBuilder().addRRect(ck.RRectXY(rect, Math.min(Math.max(0, rx), w / 2), Math.min(Math.max(0, ry), h / 2))).detachAndDelete()
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
        path = new ck.PathBuilder().addOval(ck.XYWHRect(n('cx', vw) - rx, n('cy', vh) - ry, 2 * rx, 2 * ry)).detachAndDelete()
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

  const transformed = (path: Path, m: Matrix) => {
    const builder = new ck.PathBuilder(path)
    return builder.transform(ckMatrix(m)).detachAndDelete()
  }
  const boundsOf = (path: Path): Box => {
    const [left = 0, top = 0, right = 0, bottom = 0] = path.computeTightBounds()
    return { x: left, y: top, width: right - left, height: bottom - top }
  }

  /**
   * A fill or stroke paint. `user` is the outline's box in its own user space, which an
   * objectBoundingBox gradient spans; `box` is the layer's box, which the design's gradients span.
   */
  function paintOf(raw: string | undefined, opacityText: string | undefined, style: Style, m: Matrix, user: Box, box: Box): Paint | null {
    if (raw === undefined) return null
    const value = raw.trim().toLowerCase() === 'currentcolor' ? (style.color ?? 'black') : raw
    const paint = parsePaint(value)
    if (!paint || 'none' in paint) return null
    const opacity = clamp01(Number.parseFloat(opacityText ?? '1'))
    const extra = opacity < 1 ? { opacity } : {}
    if ('color' in paint) return { type: 'solid', color: paint.color, ...extra }
    const target = ids.get(paint.url)
    if (target?.name === 'linearGradient' || target?.name === 'radialGradient') {
      const gradient = gradientPaint(target, m, user, box)
      return gradient ? { ...gradient, ...extra } as Paint : null
    }
    if (target?.name === 'pattern') skipped.add('pattern')
    return paint.fallback ? { type: 'solid', color: paint.fallback, ...extra } : null
  }

  /** A gradient's attributes and stops, following its href to the gradients it builds on. */
  function gradientOf(element: XmlElement) {
    const attrs: Record<string, string> = {}
    let stops: XmlElement[] = []
    const seen = new Set<XmlElement>()
    for (let at: XmlElement | undefined = element; at && !seen.has(at); at = ids.get((at.attrs.href ?? '').replace(/^#/, ''))) {
      seen.add(at)
      for (const [key, value] of Object.entries(at.attrs)) attrs[key] ??= value
      const own = at.children.filter((c): c is XmlElement => typeof c !== 'string' && c.name === 'stop')
      if (stops.length === 0) stops = own
    }
    return { attrs, stops }
  }

  function gradientPaint(element: XmlElement, m: Matrix, user: Box, box: Box): Record<string, unknown> | null {
    const { attrs, stops: stopElements } = gradientOf(element)
    let last = 0
    const stops = stopElements.map((stop) => {
      const style = styleOf(stop, {}, rules)
      const raw = stop.attrs.offset ?? '0'
      const offset = Math.max(last, clamp01(raw.trim().endsWith('%') ? Number.parseFloat(raw) / 100 : Number.parseFloat(raw)))
      last = offset
      const color = parseColor(style['stop-color'] ?? 'black') ?? '#000000FF'
      return { offset, color: withOpacity(color, Number.parseFloat(style['stop-opacity'] ?? '1')) }
    })
    if (stops.length === 0) return null
    const solid = { type: 'solid', color: (stops.at(-1) ?? stops[0])?.color }
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

  function shape(element: XmlElement, style: Style, m: Matrix): Piece | null {
    if (style.visibility === 'hidden' || style.visibility === 'collapse') return null
    const own = outline(element, style)
    if (!own) return null
    const user = boundsOf(own)
    const drawn = transformed(own, m)
    own.delete()
    const box = boundsOf(drawn)
    const placed = new ck.PathBuilder(drawn).offset(-box.x, -box.y).detachAndDelete()
    drawn.delete()
    const d = pathData(placed)
    placed.delete()
    if (!d) return null

    const fills: Paint[] = []
    const fill = paintOf(style.fill ?? 'black', style['fill-opacity'], style, m, user, box)
    // A line has no inside to fill.
    if (fill && element.name !== 'line') fills.push(fill)
    const strokes: Record<string, unknown>[] = []
    const strokeWidth = length(style['stroke-width'], Math.hypot(viewport.width, viewport.height) / Math.SQRT2, 1) * lengthScale(m)
    const strokePaint = paintOf(style.stroke, style['stroke-opacity'], style, m, user, box)
    if (strokePaint && strokeWidth > 0) {
      const dashes = numbers(style['stroke-dasharray']).map((n) => Math.max(0, n * lengthScale(m)))
      strokes.push({
        paint: strokePaint,
        width: strokeWidth,
        ...(dashes.some((n) => n > 0) ? { dashes, dashOffset: length(style['stroke-dashoffset']) * lengthScale(m) } : {}),
        cap: oneOf(style['stroke-linecap'], ['butt', 'round', 'square'], 'butt'),
        join: oneOf(style['stroke-linejoin'], ['miter', 'round', 'bevel'], 'miter'),
        miterLimit: Math.max(1, Number.parseFloat(style['stroke-miterlimit'] ?? '4') || 4),
      })
    }
    if (fills.length === 0 && strokes.length === 0) return null
    if (['marker-start', 'marker-mid', 'marker-end', 'marker'].some((key) => element.attrs[key] && element.attrs[key] !== 'none')) skipped.add('marker')

    const id = newId()
    const opacity = clamp01(Number.parseFloat(style.opacity ?? '1'))
    const blend = style['mix-blend-mode']
    nodes[id] = {
      type: 'graphic', parentId: 'root', index: 'a0', name: nameOf(element, DEFAULT_NAMES[element.name] ?? 'Path'),
      props: {
        ...box,
        shape: { kind: 'path', d, fillRule: style['fill-rule'] === 'evenodd' ? 'evenodd' : 'nonzero' },
        fills, strokes,
        ...(opacity < 1 ? { opacity } : {}),
        ...(blend && BLEND_MODES.has(blend) ? { blendMode: blend } : {}),
      },
    } as LayerInput
    return { id, box }
  }

  function textLayer(element: XmlElement, style: Style, m: Matrix): Piece | null {
    if (style.visibility === 'hidden' || style.visibility === 'collapse') return null
    // Each tspan with its own y starts a line.
    const lines: string[] = []
    let line = ''
    let lineY: number | undefined
    const walk = (node: XmlElement, first: boolean) => {
      for (const child of node.children) {
        if (typeof child === 'string') {
          line += child.replace(/\s+/g, ' ')
          continue
        }
        if (child.name === 'textPath') skipped.add('text-path')
        const y = child.attrs.y === undefined ? undefined : numbers(child.attrs.y)[0]
        if (child.name === 'tspan' && y !== undefined && lineY !== undefined && y !== lineY && line.trim()) {
          lines.push(line.trim())
          line = ''
        }
        if (y !== undefined) lineY = y
        walk(child, false)
      }
      if (first) lines.push(line.trim())
    }
    walk(element, true)
    const content = lines.filter(Boolean).join('\n')
    if (!content) return null
    const firstSpan = element.children.find((c): c is XmlElement => typeof c !== 'string' && c.name === 'tspan')
    const x = numbers(element.attrs.x ?? firstSpan?.attrs.x)[0] ?? 0
    const y = numbers(element.attrs.y ?? firstSpan?.attrs.y)[0] ?? 0
    const k = lengthScale(m)
    const fontSize = length(style['font-size'], 16, 16) * k
    if (!(fontSize > 0)) return null
    const fillPaint = paintOf(style.fill ?? 'black', style['fill-opacity'], style, m, { x: 0, y: 0, width: 1, height: 1 }, { x: 0, y: 0, width: 1, height: 1 })
    const color = !fillPaint ? '#00000000' : fillPaint.type === 'solid' ? withOpacity(fillPaint.color, fillPaint.opacity ?? 1)
      : 'stops' in fillPaint ? fillPaint.stops[0]?.color ?? '#000000FF' : '#000000FF'
    // A stroke along the letters is the text's outline, in its first colour.
    const strokePaint = paintOf(style.stroke, style['stroke-opacity'], style, m, { x: 0, y: 0, width: 1, height: 1 }, { x: 0, y: 0, width: 1, height: 1 })
    const outlineWidth = length(style['stroke-width'], 16, 1) * k
    const outlineColor = !strokePaint ? null : strokePaint.type === 'solid' ? withOpacity(strokePaint.color, strokePaint.opacity ?? 1)
      : 'stops' in strokePaint ? strokePaint.stops[0]?.color ?? null : null
    const outline = outlineColor && outlineWidth > 0 ? { width: outlineWidth, color: outlineColor } : null
    const anchor = style['text-anchor'] ?? 'start'
    const rows = content.split('\n')
    // The width is a guess from the letters until the editor lays the text out.
    const width = Math.max(...rows.map((r) => r.length)) * fontSize * 0.55
    const height = rows.length * fontSize * 1.2
    const at = apply(m, x, y)
    const shift = anchor === 'middle' ? width / 2 : anchor === 'end' ? width : 0
    const box = { x: at.x - shift, y: at.y - fontSize * 0.9, width, height }
    const weight = style['font-weight'] === 'bold' ? 700 : style['font-weight'] === 'normal' ? 400 : Number.parseInt(style['font-weight'] ?? '400', 10)
    const families = (style['font-family'] ?? '').split(',').map((f) => f.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean)
    const rotation = (Math.atan2(m[1], m[0]) * 180) / Math.PI
    const id = newId()
    nodes[id] = {
      type: 'text', parentId: 'root', index: 'a0', name: content.slice(0, 40).replace(/\n/g, ' '),
      props: {
        ...box,
        ...(Math.abs(rotation) > 0.01 ? { rotation } : {}),
        text: content,
        style: {
          fontFamily: fontFamily(families),
          fontSize,
          color,
          fontWeight: Number.isFinite(weight) ? Math.min(900, Math.max(100, Math.round(weight / 100) * 100)) : 400,
          fontStyle: style['font-style'] === 'italic' || style['font-style'] === 'oblique' ? 'italic' : 'normal',
          ...(outline ? { outline } : {}),
        },
        align: anchor === 'middle' ? 'center' : anchor === 'end' ? 'end' : 'start',
        boxMode: 'autoWidth',
      },
    } as LayerInput
    return { id, box }
  }

  /** The id an attribute such as clip-path="url(#a)" refers to. */
  const refOf = (value: string | undefined) => /^url\(\s*['"]?#([^'")\s]+)['"]?\s*\)$/.exec(value?.trim() ?? '')?.[1]

  /**
   * The element's clip path as a mask layer, or undefined when it clips nothing away: a clip
   * that is one rectangle holding the whole of `inside`, as most design tools write.
   */
  function clipMask(id: string, m: Matrix, inside: Box): Piece | null | undefined {
    const clip = ids.get(id)
    if (clip?.name !== 'clipPath') return undefined
    const units = clip.attrs.clipPathUnits === 'objectBoundingBox'
      ? multiply(translate(inside.x, inside.y), scale(inside.width, inside.height))
      : m
    const at = multiply(units, parseTransform(clip.attrs.transform ?? ''))
    let combined: Path | null = null
    let rectangles = 0
    let parts = 0
    const add = (element: XmlElement, style: Style, mm: Matrix) => {
      spend()
      const own = outline(element, { ...style, 'fill-rule': style['clip-rule'] ?? 'nonzero' })
      if (!own) return
      parts++
      if (element.name === 'rect' && !element.attrs.rx && !element.attrs.ry && mm[1] === 0 && mm[2] === 0) rectangles++
      const drawn = transformed(own, mm)
      own.delete()
      if (!combined) {
        combined = drawn
        return
      }
      const joined: Path | null = ck.Path.MakeFromOp(combined, drawn, ck.PathOp.Union)
      combined.delete()
      drawn.delete()
      combined = joined
    }
    const clipStyle = styleOf(clip, {}, rules)
    for (const child of clip.children) {
      if (typeof child === 'string') continue
      const style = styleOf(child, clipStyle, rules)
      if (style.display === 'none') continue
      const mm = multiply(at, parseTransform(child.attrs.transform ?? ''))
      if (SHAPES.has(child.name)) add(child, style, mm)
      else if (child.name === 'use') {
        const target = ids.get((child.attrs.href ?? '').replace(/^#/, ''))
        if (target && SHAPES.has(target.name)) {
          add(target, styleOf(target, style, rules), multiply(mm, translate(length(child.attrs.x), length(child.attrs.y))))
        }
      }
    }
    const path = combined as Path | null
    if (!path) return null
    const box = boundsOf(path)
    const holds = box.x <= inside.x + 0.01 && box.y <= inside.y + 0.01
      && box.x + box.width >= inside.x + inside.width - 0.01 && box.y + box.height >= inside.y + inside.height - 0.01
    if (parts === 1 && rectangles === 1 && holds) {
      path.delete()
      return undefined
    }
    const placed = new ck.PathBuilder(path).offset(-box.x, -box.y).detachAndDelete()
    path.delete()
    const d = pathData(placed)
    placed.delete()
    if (!d) return null
    const maskId = newId()
    nodes[maskId] = {
      type: 'graphic', parentId: 'root', index: 'a0', name: nameOf(clip, 'Clip'),
      props: { ...box, mask: 'alpha', shape: { kind: 'path', d }, fills: [{ type: 'solid', color: '#000000FF' }] },
    } as LayerInput
    return { id: maskId, box }
  }

  /** The element's mask as a mask layer drawn from the mask's content; none for a mask inside itself. */
  function maskLayer(id: string, style: Style, m: Matrix, inside: Box, using: string[]): Piece | null | undefined {
    const mask = ids.get(id)
    const key = `mask:${id}`
    if (mask?.name !== 'mask' || using.includes(key)) return undefined
    const contentUnits = mask.attrs.maskContentUnits === 'objectBoundingBox'
      ? multiply(translate(inside.x, inside.y), scale(inside.width, inside.height))
      : m
    const pieces = children(mask, styleOf(mask, style, rules), contentUnits, [...using, key])
    if (pieces.length === 0) return null
    const kind = styleOf(mask, {}, rules)['mask-type'] === 'alpha' ? 'alpha' : 'luminance'
    return group(nameOf(mask, 'Mask'), pieces, {}, { mask: kind })
  }

  /** The element under its clip path and mask, if it has them. */
  function clipped(element: XmlElement, style: Style, m: Matrix, piece: Piece | null, using: string[]): Piece | null {
    if (!piece) return null
    let out = piece
    const clipId = refOf(element.attrs['clip-path'] ?? style['clip-path'])
    if (clipId) {
      const mask = clipMask(clipId, m, out.box)
      if (mask === null) return null
      if (mask) out = { ...group('Clip', [mask, out], {}), box: out.box }
    }
    const maskId = refOf(element.attrs.mask ?? style.mask)
    if (maskId) {
      const mask = maskLayer(maskId, style, m, out.box, using)
      if (mask === null) return null
      if (mask) out = { ...group('Mask', [mask, out], {}), box: out.box }
    }
    return out
  }

  /** The layers for one element, with `m` taking its user space to the design's. */
  function convert(element: XmlElement, parentStyle: Style, parentMatrix: Matrix, using: string[]): Piece | null {
    spend()
    if (++nesting > MAX_NESTING) throw new SvgError('too-big', `nested more than ${MAX_NESTING} deep`)
    try {
      return convertElement(element, parentStyle, parentMatrix, using)
    } finally {
      nesting--
    }
  }

  function convertElement(element: XmlElement, parentStyle: Style, parentMatrix: Matrix, using: string[]): Piece | null {
    if (DEFINITIONS.has(element.name)) return null
    const unconverted = UNCONVERTED[element.name]
    if (unconverted) {
      skipped.add(unconverted)
      return null
    }
    const style = styleOf(element, parentStyle, rules)
    if (style.display === 'none') return null
    if (style.filter && style.filter !== 'none') skipped.add('filter')
    const m = multiply(parentMatrix, parseTransform(element.attrs.transform ?? ''))

    // Opacity, blending, clips and masks belong to the element, not to what it holds or uses.
    const inner: Style = { ...style }
    delete inner.opacity
    delete inner['mix-blend-mode']
    delete inner['clip-path']
    delete inner.mask

    if (SHAPES.has(element.name)) return clipped(element, style, m, shape(element, style, m), using)
    if (element.name === 'text') return clipped(element, style, m, textLayer(element, style, m), using)
    if (element.name === 'use') {
      const href = element.attrs.href ?? ''
      if (!href.startsWith('#')) {
        if (href) skipped.add('external-reference')
        return null
      }
      const target = ids.get(href.slice(1))
      if (!target || using.includes(href) || using.length > 32) return null
      const at = multiply(m, translate(length(element.attrs.x, viewport.width), length(element.attrs.y, viewport.height)))
      let piece: Piece | null
      if (target.name === 'symbol' || target.name === 'svg') {
        const w = length(element.attrs.width ?? target.attrs.width, viewport.width, viewport.width)
        const h = length(element.attrs.height ?? target.attrs.height, viewport.height, viewport.height)
        const inside = multiply(at, viewBoxMatrix(target.attrs.viewBox, w, h, target.attrs.preserveAspectRatio))
        const pieces = children(target, styleOf(target, inner, rules), inside, [...using, href])
        piece = pieces.length ? group(nameOf(element, nameOf(target, 'Group')), pieces, style) : null
        return clipped(element, {}, m, piece, using)
      }
      piece = convert(target, inner, at, [...using, href])
      if (!piece) return null
      const opacity = clamp01(Number.parseFloat(style.opacity ?? '1'))
      if (opacity < 1 || style['mix-blend-mode']) piece = group(nameOf(element, 'Group'), [piece], style)
      return clipped(element, style, m, piece, using)
    }
    if (element.name === 'svg') {
      const w = length(element.attrs.width, viewport.width, viewport.width)
      const h = length(element.attrs.height, viewport.height, viewport.height)
      const at = multiply(m, translate(length(element.attrs.x, viewport.width), length(element.attrs.y, viewport.height)))
      const pieces = children(element, inner, multiply(at, viewBoxMatrix(element.attrs.viewBox, w, h, element.attrs.preserveAspectRatio)), using)
      return pieces.length ? clipped(element, style, m, group(nameOf(element, 'Group'), pieces, style), using) : null
    }
    if (element.name === 'g' || element.name === 'a' || element.name === 'switch') {
      const pieces = element.name === 'switch'
        ? children({ ...element, children: element.children.filter((c) => typeof c !== 'string' && c.name !== 'foreignObject' && !c.attrs.requiredExtensions).slice(0, 1) }, inner, m, using)
        : children(element, inner, m, using)
      if (pieces.length === 0) return null
      return clipped(element, style, m, group(nameOf(element, 'Group'), pieces, style), using)
    }
    return null
  }

  function children(element: XmlElement, style: Style, m: Matrix, using: string[] = []): Piece[] {
    const pieces: Piece[] = []
    for (const child of element.children) {
      if (typeof child === 'string') continue
      const piece = convert(child, style, m, using)
      if (piece) pieces.push(piece)
    }
    return pieces
  }

  const rootStyle = styleOf(root, {}, rules)
  const inner: Style = { ...rootStyle }
  delete inner.opacity
  const pieces = children(root, inner, top)
  if (pieces.length === 0) throw new SvgError('empty', 'nothing in the file can be drawn')
  const only = pieces.length === 1 ? nodes[pieces[0]?.id ?? ''] : undefined
  // The one group the file holds is the root, unless the file's own opacity or blending needs a group of its own.
  const plainRoot = clamp01(Number.parseFloat(rootStyle.opacity ?? '1')) === 1 && !rootStyle['mix-blend-mode']
  const rootPiece = plainRoot && only?.type === 'group' && !only.props.mask ? (pieces[0] as Piece) : group('', pieces, rootStyle)
  ;(nodes[rootPiece.id] as { name: string }).name = options.name ?? nameOf(root, 'SVG')

  const tree = LayerTree.parse({ nodes, roots: [rootPiece.id] })
  return { tree, root: rootPiece.id, width: width * fitScale, height: height * fitScale, skipped: [...skipped] }
}

const clamp01 = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 1)
const oneOf = <T extends string>(value: string | undefined, options: readonly T[], fallback: T): T =>
  options.includes(value as T) ? (value as T) : fallback

/** Every <style> sheet's text in the file. */
function styleText(element: XmlElement): string {
  if (element.name === 'style') return textOf(element)
  return element.children.map((c) => (typeof c === 'string' ? '' : styleText(c))).join('')
}

/** A number in path data: three decimals are a thousandth of a pixel. */
const num = (n: number) => String(Math.round(n * 1000) / 1000)

/**
 * A path's SVG data. Skia's own writer splits conics, as circles are made of, into many
 * quadratics; here each conic becomes one cubic, the usual way to draw a quarter circle.
 */
export function pathData(path: Path): string {
  const cmds = path.toCmds()
  const out: string[] = []
  let x = 0
  let y = 0
  for (let i = 0; i < cmds.length;) {
    const verb = cmds[i++]
    const at = (k: number) => cmds[i + k] ?? 0
    switch (verb) {
      case 0:
        out.push(`M${num(at(0))} ${num(at(1))}`)
        x = at(0)
        y = at(1)
        i += 2
        break
      case 1:
        out.push(`L${num(at(0))} ${num(at(1))}`)
        x = at(0)
        y = at(1)
        i += 2
        break
      case 2:
        out.push(`Q${[0, 1, 2, 3].map((k) => num(at(k))).join(' ')}`)
        x = at(2)
        y = at(3)
        i += 4
        break
      case 3: {
        const [cx, cy, ex, ey, w] = [at(0), at(1), at(2), at(3), at(4)]
        const k = (4 * w) / (3 * (1 + w))
        out.push(`C${[x + (cx - x) * k, y + (cy - y) * k, ex + (cx - ex) * k, ey + (cy - ey) * k, ex, ey].map(num).join(' ')}`)
        x = ex
        y = ey
        i += 5
        break
      }
      case 4:
        out.push(`C${[0, 1, 2, 3, 4, 5].map((k) => num(at(k))).join(' ')}`)
        x = at(4)
        y = at(5)
        i += 6
        break
      case 5:
        out.push('Z')
        break
      default:
        return path.toSVGString()
    }
  }
  return out.join('')
}
