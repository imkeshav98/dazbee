// An SVG file as layers: shapes become path graphics with their fills (solid, linear and radial)
// and strokes, groups become groups, clip paths and masks become mask layers, and text becomes
// text layers. Every outline is baked into the design's own coordinates, so the layers draw the
// file without a transform of their own. What has no layer to become is left out and named.

import { generateKeyBetween } from 'fractional-indexing'

import type { CanvasKit, Path } from '@dazbee/canvaskit'
import { type BlendMode, LayerTree, MAX_SVG_BYTES, type Rect } from '@dazbee/schema'

import { clamp01, length, numbers } from './lengths.ts'
import { boundsOf, pathData, transformed } from './path-data.ts'
import { BLEND_MODES, nameOf, outline, shape, SHAPES } from './shapes.ts'
import { readSheets, type Style, styleOf, styleText } from './style.ts'
import { textLayer } from './text.ts'
import { type Matrix, multiply, parseTransform, scale, translate, viewBoxMatrix } from './transform.ts'
import type { Context, LayerInput, Piece, PropsOf, Skipped } from './types.ts'
import { parseXml, type XmlElement, XmlError } from './xml.ts'

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

/** Elements that define things for others and draw nothing where they stand. */
const DEFINITIONS = new Set([
  'defs',
  'symbol',
  'clipPath',
  'mask',
  'linearGradient',
  'radialGradient',
  'pattern',
  'marker',
  'filter',
  'title',
  'desc',
  'metadata',
  'style',
])
const UNCONVERTED: Record<string, Skipped> = {
  image: 'image',
  foreignObject: 'foreign-object',
  script: 'script',
  font: 'embedded-font',
  'font-face': 'embedded-font',
  textPath: 'text-path',
  video: 'image',
  canvas: 'image',
  iframe: 'foreign-object',
  audio: 'foreign-object',
}

const union = (boxes: Rect[]): Rect => {
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
  const rules = readSheets(root)
  const skipped = new Set<Skipped>()
  if (/@font-face/i.test(styleText(root))) skipped.add('embedded-font')

  const [, , vbWidth = 0, vbHeight = 0] = numbers(root.attrs.viewBox)
  let width = length(root.attrs.width, vbWidth, vbWidth || 300)
  let height = length(root.attrs.height, vbHeight, vbHeight || 150)
  if (root.attrs.width?.trim().endsWith('%')) width = vbWidth || 300
  if (root.attrs.height?.trim().endsWith('%')) height = vbHeight || 150
  if (!(width > 0 && height > 0)) throw new SvgError('empty', 'the drawing has no size')
  const fitScale = options.fit ? options.fit / Math.max(width, height) : 1
  const top = multiply(
    scale(fitScale),
    viewBoxMatrix(root.attrs.viewBox, width, height, root.attrs.preserveAspectRatio),
  )
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
  const context: Context = { ck, ids, rules, viewport, nodes, skipped, newId, fontFamily }

  /** Puts the pieces inside `parentId`, bottom to top. */
  const adopt = (parentId: string, pieces: Piece[]) => {
    let key: string | null = null
    for (const piece of pieces) {
      key = generateKeyBetween(key, null)
      Object.assign(nodes[piece.id] as object, { parentId, index: key })
    }
  }

  const group = (name: string, pieces: Piece[], style: Style, extra: Partial<PropsOf<'group'>> = {}): Piece => {
    const id = newId()
    const box = union(pieces.map((p) => p.box))
    const opacity = clamp01(Number.parseFloat(style.opacity ?? '1'))
    const blend = style['mix-blend-mode']
    nodes[id] = {
      type: 'group',
      parentId: 'root',
      index: 'a0',
      name,
      props: {
        ...box,
        ...(opacity < 1 ? { opacity } : {}),
        ...(blend && BLEND_MODES.has(blend) ? { blendMode: blend as BlendMode } : {}),
        ...extra,
      },
    }
    adopt(id, pieces)
    return { id, box }
  }

  /** The id an attribute such as clip-path="url(#a)" refers to. */
  const refOf = (value: string | undefined) => /^url\(\s*['"]?#([^'")\s]+)['"]?\s*\)$/.exec(value?.trim() ?? '')?.[1]

  /**
   * The element's clip path as a mask layer, or undefined when it clips nothing away: a clip
   * that is one rectangle holding the whole of `inside`, as most design tools write.
   */
  function clipMask(id: string, m: Matrix, inside: Rect): Piece | null | undefined {
    const clip = ids.get(id)
    if (clip?.name !== 'clipPath') return undefined
    const units =
      clip.attrs.clipPathUnits === 'objectBoundingBox'
        ? multiply(translate(inside.x, inside.y), scale(inside.width, inside.height))
        : m
    const at = multiply(units, parseTransform(clip.attrs.transform ?? ''))
    let combined: Path | null = null
    let rectangles = 0
    let parts = 0
    const add = (element: XmlElement, style: Style, mm: Matrix) => {
      spend()
      const own = outline(context, element, { ...style, 'fill-rule': style['clip-rule'] ?? 'nonzero' })
      if (!own) return
      parts++
      if (element.name === 'rect' && !element.attrs.rx && !element.attrs.ry && mm[1] === 0 && mm[2] === 0) rectangles++
      const drawn = transformed(ck, own, mm)
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
          add(
            target,
            styleOf(target, style, rules),
            multiply(mm, translate(length(child.attrs.x), length(child.attrs.y))),
          )
        }
      }
    }
    const path = combined as Path | null
    if (!path) return null
    const box = boundsOf(path)
    const holds =
      box.x <= inside.x + 0.01 &&
      box.y <= inside.y + 0.01 &&
      box.x + box.width >= inside.x + inside.width - 0.01 &&
      box.y + box.height >= inside.y + inside.height - 0.01
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
      type: 'graphic',
      parentId: 'root',
      index: 'a0',
      name: nameOf(clip, 'Clip'),
      props: {
        ...box,
        mask: 'alpha',
        shape: { kind: 'path', d, drawnIn: { width: box.width, height: box.height } },
        fills: [{ type: 'solid', color: '#000000FF' }],
      },
    }
    return { id: maskId, box }
  }

  /** The element's mask as a mask layer drawn from the mask's content; none for a mask inside itself. */
  function maskLayer(id: string, style: Style, m: Matrix, inside: Rect, using: string[]): Piece | null | undefined {
    const mask = ids.get(id)
    const key = `mask:${id}`
    if (mask?.name !== 'mask' || using.includes(key)) return undefined
    const contentUnits =
      mask.attrs.maskContentUnits === 'objectBoundingBox'
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

  function convertElement(
    element: XmlElement,
    parentStyle: Style,
    parentMatrix: Matrix,
    using: string[],
  ): Piece | null {
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

    if (SHAPES.has(element.name)) return clipped(element, style, m, shape(context, element, style, m), using)
    if (element.name === 'text') return clipped(element, style, m, textLayer(context, element, style, m), using)
    if (element.name === 'use') {
      const href = element.attrs.href ?? ''
      if (!href.startsWith('#')) {
        if (href) skipped.add('external-reference')
        return null
      }
      const target = ids.get(href.slice(1))
      if (!target || using.includes(href) || using.length > 32) return null
      const at = multiply(
        m,
        translate(length(element.attrs.x, viewport.width), length(element.attrs.y, viewport.height)),
      )
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
      const at = multiply(
        m,
        translate(length(element.attrs.x, viewport.width), length(element.attrs.y, viewport.height)),
      )
      const pieces = children(
        element,
        inner,
        multiply(at, viewBoxMatrix(element.attrs.viewBox, w, h, element.attrs.preserveAspectRatio)),
        using,
      )
      return pieces.length ? clipped(element, style, m, group(nameOf(element, 'Group'), pieces, style), using) : null
    }
    if (element.name === 'g' || element.name === 'a' || element.name === 'switch') {
      const pieces =
        element.name === 'switch'
          ? children(
              {
                ...element,
                children: element.children
                  .filter((c) => typeof c !== 'string' && c.name !== 'foreignObject' && !c.attrs.requiredExtensions)
                  .slice(0, 1),
              },
              inner,
              m,
              using,
            )
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
  const rootPiece =
    plainRoot && only?.type === 'group' && !only.props.mask ? (pieces[0] as Piece) : group('', pieces, rootStyle)
  ;(nodes[rootPiece.id] as { name: string }).name = options.name ?? nameOf(root, 'SVG')

  const tree = LayerTree.parse({ nodes, roots: [rootPiece.id] })
  return { tree, root: rootPiece.id, width: width * fitScale, height: height * fitScale, skipped: [...skipped] }
}
