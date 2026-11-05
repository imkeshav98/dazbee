// The layer a click or a hover picks: the topmost one that shows under the point. A shape counts
// inside its outline, as the renderer draws it, and on its strokes; a photo where it is at least
// 10% opaque; a text on its laid-out lines. What shows nothing there passes the click to the layer
// beneath.
import type { CanvasKit, Path } from '@dazbee/canvaskit'
import { imagePlacement, outlineOf, type SceneLayer, type TextLayout } from '@dazbee/renderer'
import type { ImagePaint, Paint, Point, Rect, Stroke, TextProps } from '@dazbee/schema'

import { type AlphaMap, opacityAt } from './alpha-map.ts'

/** What a hit test reads to tell where a layer shows. */
export interface Looks {
  ck: CanvasKit
  /** A decoded image's alpha map, by asset id; none while the image loads, when a photo shows all over its outline. */
  alpha(assetId: string): AlphaMap | undefined
  /** A text layer laid out as it is drawn. */
  layout(props: TextProps): TextLayout
}

export interface HitOptions {
  /** Whether a layer can be picked; one that can't (locked) is passed over with everything in it. */
  pickable?: (layer: SceneLayer) => boolean
  /** The id of a layer that counts everywhere in its box, as the text being typed in does. */
  wholeBox?: string | undefined
}

type TextLayer = Extract<SceneLayer, { type: 'text' }>
/** A layer with an outline and paints of its own. */
type Painted = Extract<SceneLayer, { type: 'graphic' | 'boolean' | 'box' }>

/** How near a line or a path's stroke a click picks it, in design pixels, beyond half the stroke. */
const LINE_REACH = 4
/** How opaque a photo must be under the point to be picked there; below it the click passes on. */
const SEE_THROUGH = 0.1

const everything = () => true

/**
 * The topmost layer that shows under a page point. Inside a group, box or boolean it is the child
 * there, so a click can move single layers; a clipping box hides what lies outside its outline. A
 * layer that isn't `pickable` (locked) is passed over with everything in it, so the click reaches
 * what lies beneath. A mask is never picked, and what it masks only where the mask shows.
 */
export function hitTest(layers: SceneLayer[], p: Point, looks: Looks, options: HitOptions = {}): SceneLayer | null {
  const pickable = options.pickable ?? everything
  // A mask isn't drawn, and what it masks shows only inside it (#48).
  const maskOf: (SceneLayer | null)[] = []
  let mask: SceneLayer | null = null
  for (const layer of layers) {
    maskOf.push(layer.props.mask ? null : mask)
    if (layer.props.mask) mask = layer
  }
  const masksShowing = new Map<SceneLayer, boolean>()
  const maskShows = (m: SceneLayer) => {
    let shows = masksShowing.get(m)
    if (shows === undefined) masksShowing.set(m, (shows = layerAt(m, p, looks, {}) !== null))
    return shows
  }
  for (let i = layers.length - 1; i >= 0; i--) {
    const layer = layers[i] as SceneLayer
    const masked = maskOf[i]
    if (layer.props.mask || !pickable(layer) || (masked && !maskShows(masked))) continue
    const hit = layerAt(layer, p, looks, options)
    if (hit) return hit
  }
  return null
}

/** The layer, or the child of it, that shows at a point in its parent's coordinates. */
function layerAt(layer: SceneLayer, p: Point, looks: Looks, options: HitOptions): SceneLayer | null {
  const q = unrotate(p, layer)
  if (layer.id === options.wholeBox) return inBox(q, layer.props) ? layer : null
  switch (layer.type) {
    case 'group':
      return hitTest(layer.children, q, looks, options)
    case 'box':
      if (layer.props.clip && !inOutline(looks.ck, layer, q)) return null
      return hitTest(layer.children, q, looks, options) ?? (shows(looks, layer, q) ? layer : null)
    case 'boolean':
      // Its shapes' own paints don't show, only the boolean's: the shape under the point is picked
      // where the boolean shows, so a click inside it can still reach one shape.
      if (!shows(looks, layer, q)) return null
      return shapeUnder(looks.ck, layer.children, q, options.pickable ?? everything) ?? layer
    case 'text':
      return onLines(looks, layer, q) ? layer : null
    case 'graphic':
      return shows(looks, layer, q) ? layer : null
  }
}

/** The point as seen from inside a layer: un-rotated about the layer's centre. */
function unrotate(p: Point, layer: SceneLayer): Point {
  const { x, y, width, height, rotation } = layer.props
  if (rotation === 0) return p
  const cx = x + width / 2
  const cy = y + height / 2
  const a = (-rotation * Math.PI) / 180
  const dx = p.x - cx
  const dy = p.y - cy
  return { x: cx + dx * Math.cos(a) - dy * Math.sin(a), y: cy + dx * Math.sin(a) + dy * Math.cos(a) }
}

function inBox(q: Point, box: Rect, grow = 0) {
  return (
    q.x >= box.x - grow && q.x <= box.x + box.width + grow && q.y >= box.y - grow && q.y <= box.y + box.height + grow
  )
}

function inOutline(ck: CanvasKit, layer: SceneLayer, q: Point) {
  if (!inBox(q, layer.props)) return false
  const outline = outlineOf(ck, layer)
  const inside = outline.contains(q.x, q.y)
  outline.delete()
  return inside
}

/**
 * Whether a shape, boolean or box shows at a point in its own coordinates: inside its outline where
 * its paints show, or on its strokes past the outline. A line is picked near it, however thin its
 * box; a path also near its stroke, so a thin one is as easy to pick.
 */
function shows(looks: Looks, layer: Painted, q: Point): boolean {
  const { props } = layer
  const kind = layer.type === 'graphic' ? layer.props.shape.kind : null
  if (kind === 'line') return nearLine(q, layer)
  const reach =
    kind === 'path' ? Math.max(0, ...props.strokes.map((s) => s.width / 2)) + LINE_REACH : strokeReach(props.strokes)
  if (!inBox(q, props, reach)) return false
  const outline = outlineOf(looks.ck, layer)
  try {
    if (outline.contains(q.x, q.y)) return paintsShow(looks, props.fills, props, q)
    return reach > 0 && nearOutline(looks.ck, outline, q, reach)
  } finally {
    outline.delete()
  }
}

/** A line is picked along it, up to half its stroke and LINE_REACH more either side of it. */
function nearLine(q: Point, layer: Painted) {
  const { x, y, width, height, strokes } = layer.props
  const reach = Math.max(height / 2, ...strokes.map((s) => s.width / 2)) + LINE_REACH
  return q.x >= x && q.x <= x + width && Math.abs(q.y - (y + height / 2)) <= reach
}

/** How far past the outline the visible strokes show: half a centred one, all of one outside. */
function strokeReach(strokes: readonly Stroke[]) {
  return Math.max(
    0,
    ...strokes.map((s) =>
      s.paint.visible === false ? 0 : s.align === 'outside' ? s.width : s.align === 'center' ? s.width / 2 : 0,
    ),
  )
}

/** Whether a point is within `reach` of an outline, along it. */
function nearOutline(ck: CanvasKit, outline: Path, q: Point, reach: number) {
  const band = outline.makeStroked({ width: reach * 2, cap: ck.StrokeCap.Round, join: ck.StrokeJoin.Round })
  if (!band) return false
  const near = band.contains(q.x, q.y)
  band.delete()
  return near
}

/**
 * Whether a layer's paints show at a point inside its outline: anywhere with no paint (an outline
 * only, an empty box) or with a paint that isn't a photo; else where a photo is opaque enough.
 */
function paintsShow(looks: Looks, fills: readonly Paint[], box: Rect, q: Point) {
  const visible = fills.filter((f) => f.visible !== false)
  return visible.length === 0 || visible.some((f) => f.type !== 'image' || photoShows(looks, f, box, q))
}

/** Whether a photo fill is at least SEE_THROUGH opaque at a point, its crop and fit placing the pixel. */
function photoShows(looks: Looks, fill: ImagePaint, box: Rect, q: Point) {
  const map = looks.alpha(fill.assetId)
  if (!map) return true
  const { imageWidth: iw, imageHeight: ih } = map
  const { src, dst } = imagePlacement({ width: iw, height: ih }, fill, box)
  let x = src.x + ((q.x - dst.x) * src.width) / dst.width
  let y = src.y + ((q.y - dst.y) * src.height) / dst.height
  if (fill.fit === 'tile') {
    // Tiles repeat the image; fit leaves clear what the image doesn't cover; fill and crop stretch its edges.
    x = ((x % iw) + iw) % iw
    y = ((y % ih) + ih) % ih
  } else if (fill.fit !== 'fit') {
    x = Math.min(Math.max(x, 0), iw - 0.5)
    y = Math.min(Math.max(y, 0), ih - 0.5)
  }
  return opacityAt(map, x, y) >= SEE_THROUGH
}

/** The topmost pickable shape of a boolean whose own outline holds a point, inside a boolean within it too. */
function shapeUnder(
  ck: CanvasKit,
  shapes: SceneLayer[],
  p: Point,
  pickable: (layer: SceneLayer) => boolean,
): SceneLayer | null {
  for (let i = shapes.length - 1; i >= 0; i--) {
    const shape = shapes[i] as SceneLayer
    if (!pickable(shape) || (shape.type !== 'graphic' && shape.type !== 'boolean')) continue
    if (shape.type === 'graphic' && shape.props.shape.kind === 'line') continue
    const q = unrotate(p, shape)
    if (!inOutline(ck, shape, q)) continue
    return shape.type === 'boolean' ? (shapeUnder(ck, shape.children, q, pickable) ?? shape) : shape
  }
  return null
}

/**
 * Whether a point in a text's own coordinates is on one of its laid-out lines or list markers: not
 * in the empty box below them or after a short line. A text with no words is picked by its box, so
 * it can still be grabbed.
 */
function onLines(looks: Looks, layer: TextLayer, q: Point) {
  const { props } = layer
  if (!inBox(q, props)) return false
  const laid = looks.layout(props)
  const x = q.x - props.x
  const y = q.y - props.y - laid.dy
  let words = false
  for (const b of laid.blocks) {
    const { marker } = b
    if (
      marker &&
      inBox(
        { x, y },
        { x: b.x + b.markerX, y: b.y + b.markerY, width: marker.getMaxIntrinsicWidth(), height: marker.getHeight() },
      )
    )
      return true
    for (const line of b.paragraph.getLineMetrics()) {
      if (line.width <= 0) continue
      words = true
      const top = b.y + line.baseline - line.ascent
      if (inBox({ x, y }, { x: b.x + line.left, y: top, width: line.width, height: line.height })) return true
    }
  }
  return !words
}
