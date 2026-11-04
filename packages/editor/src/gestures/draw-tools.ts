// Drawing shapes with a drag (#44): what each shape tool makes, and the rect a drag gives it. Kept
// free of the editor so the geometry can be tested on its own. Points are a page's design pixels.
import type { Paint, Point, Rect } from '@dazbee/schema'

import { normalAngle, round } from '../layers/transform.ts'

/** A layer as node.create takes it. */
export interface NewLayer {
  type: 'graphic' | 'box'
  name: string
  props: Record<string, unknown>
}

export type Drawn = { x: number; y: number; width: number; height: number; rotation: number }

/** The tools of the dock's shape menu, in its order: the shapes, and Box. */
export const SHAPE_MENU_TOOLS = ['rect', 'ellipse', 'box', 'polygon', 'star', 'line', 'arrow'] as const
export type ShapeMenuTool = (typeof SHAPE_MENU_TOOLS)[number]
/** The tools of the shape menu that draw a shape: every one but Box. */
export type ShapeTool = Exclude<ShapeMenuTool, 'box'>
/** What a drag draws: a shape, or a box with Box or the Frame tool. */
export type DrawTool = ShapeMenuTool | 'frame'

/** The size a click without a drag draws, in design pixels. */
const CLICK_SIZE = 100
/** A box clicked without a drag is bigger: room for what goes in it. */
const BOX_CLICK_SIZE = 200
/** New shapes are a neutral grey until a style is picked; lines a near-black stroke. */
const FILL = '#C9CED6FF'
const INK = '#1F2329FF'
/** New text is near-black Noto Sans until a style is picked: the family every script falls back to. */
const NEW_TEXT_STYLE = { fontFamily: 'Noto Sans', fontSize: 48, fontWeight: 400, color: INK }
/** The pen's stroke until a style is picked: the near-black that lines draw with. */
const PEN_STROKE = { paint: { type: 'solid', color: INK }, width: 2, cap: 'round', join: 'round' }
/** The most of a frame's width or height an image placed from the asset library takes at first (#52). */
const PLACED_SHARE = 0.5

const isShapeMenuTool = (tool: string): tool is ShapeMenuTool => (SHAPE_MENU_TOOLS as readonly string[]).includes(tool)

/** A new box for the Box and Frame tools, at no size yet: white, as in most design tools. */
const newBox = (): NewLayer => ({
  type: 'box',
  name: 'Box',
  props: { x: 0, y: 0, width: 0, height: 0, fills: [{ type: 'solid', color: '#FFFFFFFF' }] },
})

/** Whether a tool draws with a drag: a tool of the shape menu or the Frame tool. */
export const isDrawTool = (tool: string): tool is DrawTool => tool === 'frame' || isShapeMenuTool(tool)

/** Whether a drawing tool draws a box: the shape menu's Box, or the Frame tool. */
export const drawsBox = (tool: DrawTool): tool is 'box' | 'frame' => tool === 'box' || tool === 'frame'

/** A new layer for a drawing tool, at no size yet. */
export const newDrawn = (tool: DrawTool): NewLayer => (drawsBox(tool) ? newBox() : newShape(tool))

/** A new graphic for a shape tool, at no size yet. */
export function newShape(tool: ShapeTool): NewLayer {
  const at = { x: 0, y: 0, width: 0, height: 0 }
  const filled = (name: string, shape: Record<string, unknown>): NewLayer => ({
    type: 'graphic',
    name,
    props: { ...at, shape, fills: [{ type: 'solid', color: FILL }] },
  })
  switch (tool) {
    case 'rect':
      return filled('Rectangle', { kind: 'rect' })
    case 'ellipse':
      return filled('Ellipse', { kind: 'ellipse' })
    case 'polygon':
      return filled('Polygon', { kind: 'polygon' })
    case 'star':
      return filled('Star', { kind: 'star' })
    case 'line':
    case 'arrow':
      return {
        type: 'graphic',
        name: tool === 'line' ? 'Line' : 'Arrow',
        props: {
          ...at,
          shape: { kind: 'line', end: tool === 'arrow' ? 'arrow' : 'none' },
          strokes: [{ paint: { type: 'solid', color: INK }, width: 4, cap: 'round', join: 'round' }],
        },
      }
  }
}

/**
 * The rect a drag from `from` to `to` draws. Shift keeps a shape's sides equal and turns a line in
 * steps of 45°; Alt draws a shape out from its centre. A line runs along its rect's middle, so its
 * rect is as long as the line, no taller than nothing, and turned to the line's angle.
 */
export function draggedRect(tool: DrawTool, from: Point, to: Point, shift: boolean, alt: boolean): Drawn {
  let dx = to.x - from.x
  let dy = to.y - from.y
  if (tool === 'line' || tool === 'arrow') {
    let length = Math.hypot(dx, dy)
    let angle = Math.atan2(dy, dx)
    if (shift) angle = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4)
    if (alt) length *= 2
    const start = alt
      ? { x: from.x - (Math.cos(angle) * length) / 2, y: from.y - (Math.sin(angle) * length) / 2 }
      : from
    const mid = { x: start.x + (Math.cos(angle) * length) / 2, y: start.y + (Math.sin(angle) * length) / 2 }
    return {
      x: round(mid.x - length / 2),
      y: round(mid.y),
      width: round(length),
      height: 0,
      rotation: round(normalAngle((angle * 180) / Math.PI)),
    }
  }
  if (shift) {
    const side = Math.max(Math.abs(dx), Math.abs(dy))
    dx = Math.sign(dx || 1) * side
    dy = Math.sign(dy || 1) * side
  }
  const x0 = alt ? from.x - dx : from.x
  const y0 = alt ? from.y - dy : from.y
  const x1 = from.x + dx
  const y1 = from.y + dy
  return {
    x: round(Math.min(x0, x1)),
    y: round(Math.min(y0, y1)),
    width: round(Math.abs(x1 - x0)),
    height: round(Math.abs(y1 - y0)),
    rotation: 0,
  }
}

/** What a click without a drag draws: CLICK_SIZE across (a box BOX_CLICK_SIZE), centred where it landed. */
export function clickedRect(tool: DrawTool, at: Point): Drawn {
  if (tool === 'line' || tool === 'arrow')
    return { x: round(at.x - CLICK_SIZE / 2), y: round(at.y), width: CLICK_SIZE, height: 0, rotation: 0 }
  const size = drawsBox(tool) ? BOX_CLICK_SIZE : CLICK_SIZE
  return { x: round(at.x - size / 2), y: round(at.y - size / 2), width: size, height: size, rotation: 0 }
}

/**
 * A new, empty text layer for the text tool (#47): at the point clicked, growing as it is typed,
 * or in the box dragged, wrapping inside it and keeping its size.
 */
export function newText(x: number, y: number, box: { x: number; y: number; width: number; height: number } | null) {
  return {
    type: 'text' as const,
    name: 'Text',
    props: box
      ? { ...box, text: '', boxMode: 'fixed', style: NEW_TEXT_STYLE }
      : { x, y, width: 0, height: 0, text: '', boxMode: 'autoWidth', style: NEW_TEXT_STYLE },
  }
}

/** A new path layer for the pen: the path data `d`, drawn in `box`, stroked as lines are. */
export function newPath(d: string, box: Rect): NewLayer {
  const shape = { kind: 'path', d, drawnIn: { width: box.width, height: box.height } }
  return {
    type: 'graphic',
    name: 'Path',
    props: { x: box.x, y: box.y, width: box.width, height: box.height, shape, strokes: [PEN_STROKE] },
  }
}

/**
 * A layer's fills with an image put in: in place of its topmost image fill, keeping that fill's fit,
 * opacity, adjustments and filter but not its crop, which belonged to the old picture; or on top
 * of its fills when it has none.
 */
export function withImage(fills: readonly Paint[], assetId: string): Paint[] {
  const at = fills.findLastIndex((f) => f.type === 'image')
  if (at < 0) return [...fills, { type: 'image', assetId, fit: 'fill', opacity: 1 }]
  return fills.map((f, i) => {
    if (i !== at || f.type !== 'image') return f
    const swapped = { ...f, assetId }
    delete swapped.crop
    return swapped
  })
}

/**
 * A graphic filled with an image asset (#52), centred on `at` in a frame of `frame` size: the
 * image's own size, or smaller to take at most half the frame's width and height, its shape kept.
 */
export function newImage(
  asset: { id: string; name: string; width: number; height: number },
  at: Point,
  frame: { width: number; height: number },
): NewLayer {
  const scale = Math.min(1, (frame.width * PLACED_SHARE) / asset.width, (frame.height * PLACED_SHARE) / asset.height)
  // Whole pixels, so the image starts sharp.
  const width = Math.max(1, Math.round(asset.width * scale))
  const height = Math.max(1, Math.round(asset.height * scale))
  return imageIn(asset, { x: Math.round(at.x - width / 2), y: Math.round(at.y - height / 2), width, height })
}

/** A graphic filled with an image asset in a box, such as one the image tool dragged: the image covers it. */
export function imageIn(
  asset: { id: string; name: string },
  box: { x: number; y: number; width: number; height: number },
): NewLayer {
  return {
    type: 'graphic',
    name: asset.name.trim() || 'Image',
    props: {
      ...box,
      shape: { kind: 'rect' },
      fills: [{ type: 'image', assetId: asset.id, fit: 'fill' }],
    },
  }
}

/** The corner a drag from `from` reaches with the image's shape kept: as far as the pointer went on the longer side. */
export function keepRatio(from: Point, to: Point, asset: { width: number; height: number }): Point {
  if (asset.width <= 0 || asset.height <= 0) return to
  const ratio = asset.width / asset.height
  const dx = to.x - from.x
  const dy = to.y - from.y
  const width = Math.max(Math.abs(dx), Math.abs(dy) * ratio)
  return { x: from.x + Math.sign(dx || 1) * width, y: from.y + Math.sign(dy || 1) * (width / ratio) }
}
