import type { Canvas, CanvasKit } from '@dazbee/canvaskit'
import type { Paint, Rect } from '@dazbee/schema'

import type { Resources } from '../resources.ts'
import type { Scene, SceneLayer } from '../scene.ts'
import { drawLayers, drawScene } from './draw.ts'
import { fillPath } from './paint.ts'
import { boxPath, rectPath } from './paths.ts'
import { layerReach, outset } from './reach.ts'
import { strokePath, strokeReach } from './strokes.ts'

/** The vector file a frame is drawn into. */
export type VectorTarget = 'pdf' | 'svg'

/**
 * Draws a frame into a PDF page or an SVG with the same drawing code as the pixels. What the file
 * can't hold as vectors is drawn as an image, by the CPU renderer, at `scale` pixels to a unit:
 *
 * - PDF keeps opacity, blend modes and masks, and Skia rasterises blurs and shadows itself at the
 *   document's raster DPI. Only a background blur, which reads what is behind it, comes as an image.
 * - SVG from Skia keeps shapes, solid colours, linear and radial gradients and clips, and text as
 *   paths. A layer with opacity, effects, an angular gradient, an image fill or a mask comes as an
 *   image of itself; a blend mode or background blur, which mix with what is behind, as an image of
 *   the frame as drawn up to it.
 */
export function drawVectorFrame(
  ck: CanvasKit,
  canvas: Canvas,
  scene: Scene,
  resources: Resources,
  target: VectorTarget,
  scale = 1,
) {
  const raster: Resources = {
    fonts: resources.fonts,
    fallbackFamilies: resources.fallbackFamilies,
    images: resources.images,
  }
  const vector: Resources = { ...raster, vector: true }
  const frame = { x: 0, y: 0, width: scene.width, height: scene.height }
  canvas.save()
  canvas.clipRect(ck.XYWHRect(0, 0, scene.width, scene.height), ck.ClipOp.Intersect, true)

  if (target === 'svg' && scene.fills.some((fill) => !svgPaint(fill))) {
    drawImage(ck, canvas, frame, scale, (into) => drawScene(ck, into, { ...scene, layers: [] }, raster))
  } else {
    const path = rectPath(ck, frame)
    for (const fill of scene.fills) fillPath(ck, canvas, path, fill, frame, vector)
    path.delete()
  }

  const units = maskUnits(scene.layers)
  units.forEach((unit, i) => {
    const backdrop = unit.some((layer) => readsBackdrop(layer, target))
    if (backdrop) {
      // The frame as drawn up to and including this unit, cut to where the unit reaches.
      const upTo = { ...scene, layers: units.slice(0, i + 1).flat() }
      const reach = unitReach(ck, unit, raster)
      drawImage(ck, canvas, reach, scale, (into) => drawScene(ck, into, upTo, raster), frame)
      return
    }
    drawUnit(ck, canvas, unit, target, vector, raster, scale)
  })
  canvas.restore()
}

/**
 * Whether a paint is one Skia's SVG writer draws as it is: solid colours, and linear and radial
 * gradients at their own full opacity. It has no angular gradient, and places image fills wrongly
 * once they are scaled. A hidden paint draws nothing, which SVG holds too.
 */
function svgPaint(paint: Paint): boolean {
  if (paint.visible === false || paint.type === 'solid') return true
  return (paint.type === 'linear' || paint.type === 'radial') && (paint.opacity ?? 1) === 1
}

/**
 * Draws `draw` onto a CPU surface covering `box` at `scale` pixels a unit, then places the result
 * over the box. The box grows to whole pixels, and is cut to `within` when given.
 */
function drawImage(
  ck: CanvasKit,
  canvas: Canvas,
  box: Rect,
  scale: number,
  draw: (into: Canvas) => void,
  within?: Rect,
) {
  let left = Math.floor(box.x - 1)
  let top = Math.floor(box.y - 1)
  let right = Math.ceil(box.x + box.width + 1)
  let bottom = Math.ceil(box.y + box.height + 1)
  if (within) {
    left = Math.max(left, Math.floor(within.x))
    top = Math.max(top, Math.floor(within.y))
    right = Math.min(right, Math.ceil(within.x + within.width))
    bottom = Math.min(bottom, Math.ceil(within.y + within.height))
  }
  const width = Math.ceil((right - left) * scale)
  const height = Math.ceil((bottom - top) * scale)
  if (width <= 0 || height <= 0) return
  const surface = ck.MakeSurface(width, height)
  if (!surface) throw new Error(`CanvasKit could not make a ${width}×${height} CPU surface for a layer's image`)
  try {
    const into = surface.getCanvas()
    into.clear(ck.TRANSPARENT)
    into.scale(scale, scale)
    into.translate(-left, -top)
    draw(into)
    const image = surface.makeImageSnapshot()
    const paint = new ck.Paint()
    canvas.drawImageRect(
      image,
      ck.XYWHRect(0, 0, width, height),
      ck.LTRBRect(left, top, left + width / scale, top + height / scale),
      paint,
    )
    paint.delete()
    image.delete()
  } finally {
    surface.dispose()
  }
}

/** A parent's layers cut into what draws on its own: a layer, or a mask with the layers it masks. */
function maskUnits(layers: readonly SceneLayer[]): SceneLayer[][] {
  const units: SceneLayer[][] = []
  for (const layer of layers) {
    const last = units.at(-1)
    if (last?.[0]?.props.mask && !layer.props.mask) last.push(layer)
    else units.push([layer])
  }
  return units
}

/** Whether a layer, or one inside it, mixes with what is behind it in a way the file can't. */
function readsBackdrop(layer: SceneLayer, target: VectorTarget): boolean {
  const { props } = layer
  if (props.effects.some((e) => e.type === 'backgroundBlur' && e.radius > 0)) return true
  if (target === 'svg' && props.blendMode !== 'normal' && props.blendMode !== 'pass-through') return true
  return layer.children.some((child) => readsBackdrop(child, target))
}

/** Everything a unit draws: its first layer's reach, which for a mask is all that shows. */
function unitReach(ck: CanvasKit, unit: SceneLayer[], resources: Resources): Rect {
  const [first] = unit
  return first ? layerReach(ck, first, resources) : { x: 0, y: 0, width: 0, height: 0 }
}

function drawUnit(
  ck: CanvasKit,
  canvas: Canvas,
  unit: SceneLayer[],
  target: VectorTarget,
  vector: Resources,
  raster: Resources,
  scale: number,
) {
  const [first] = unit
  if (!first) return
  if (target === 'pdf' || unit.every((layer) => svgSafe(layer))) {
    drawLayers(ck, canvas, unit, vector)
    return
  }
  if (unit.length === 1 && plainContainer(first)) {
    drawContainer(ck, canvas, first, vector, raster, scale)
    return
  }
  drawImage(ck, canvas, unitReach(ck, unit, raster), scale, (into) => drawLayers(ck, into, unit, raster))
}

/** Whether Skia's SVG writer draws a layer and everything in it exactly as the CPU does. */
function svgSafe(layer: SceneLayer): boolean {
  const { props } = layer
  if (props.mask || props.opacity !== 1 || props.effects.length > 0) return false
  if (props.blendMode !== 'normal' && props.blendMode !== 'pass-through') return false
  // A group or box in normal mode draws its children into a layer of its own, which SVG drops.
  if ((layer.type === 'group' || layer.type === 'box') && props.blendMode === 'normal') return false
  if ('fills' in props && !props.fills.every(svgPaint)) return false
  if ('strokes' in props && !props.strokes.every((s) => svgPaint(s.paint))) return false
  return layer.children.every(svgSafe)
}

/** A group or box whose own drawing adds nothing an offscreen layer would change. */
function plainContainer(layer: SceneLayer): boolean {
  const { props } = layer
  return (
    (layer.type === 'group' || layer.type === 'box') &&
    props.opacity === 1 &&
    props.effects.length === 0 &&
    (props.blendMode === 'normal' || props.blendMode === 'pass-through') &&
    !props.mask
  )
}

/**
 * A group or box drawn by its children alone, as drawLayer would without an offscreen layer,
 * so each child that SVG can hold stays vectors.
 */
function drawContainer(
  ck: CanvasKit,
  canvas: Canvas,
  layer: SceneLayer,
  vector: Resources,
  raster: Resources,
  scale: number,
) {
  const { props } = layer
  canvas.save()
  if (props.rotation !== 0) canvas.rotate(props.rotation, props.x + props.width / 2, props.y + props.height / 2)
  if (layer.type === 'box') {
    const path = boxPath(ck, layer.props)
    const fills = layer.props.fills
    if (fills.every(svgPaint)) for (const fill of fills) fillPath(ck, canvas, path, fill, props, vector)
    else
      drawImage(ck, canvas, props, scale, (into) => {
        for (const fill of fills) fillPath(ck, into, path, fill, props, raster)
      })
    canvas.save()
    if (layer.props.clip) canvas.clipPath(path, ck.ClipOp.Intersect, true)
    for (const unit of maskUnits(layer.children)) drawUnit(ck, canvas, unit, 'svg', vector, raster, scale)
    canvas.restore()
    // The strokes over what is inside, outside the clip, as drawContent draws them. The canvas is
    // turned already, so a picture of them covers the box layer's own rect and their reach.
    const { strokes } = layer.props
    if (strokes.every((s) => svgPaint(s.paint))) strokePath(ck, canvas, path, layer.props, vector, null)
    else
      drawImage(ck, canvas, outset(layer.props, strokeReach(strokes, false)), scale, (into) =>
        strokePath(ck, into, path, layer.props, raster, null),
      )
    path.delete()
  } else {
    for (const unit of maskUnits(layer.children)) drawUnit(ck, canvas, unit, 'svg', vector, raster, scale)
  }
  canvas.restore()
}
