import type { Canvas, CanvasKit, ImageFilter } from '@dazbee/canvaskit'
import type { BackgroundBlur, DropShadow, InnerShadow, LayerBlur } from '@dazbee/schema'

import { color } from '../color.ts'
import type { Resources } from '../resources.ts'
import type { Scene, SceneLayer } from '../scene.ts'
import { laidOut } from '../text/layout.ts'
import { LUMA_TO_ALPHA } from './adjust.ts'
import { fillPath } from './paint.ts'
import { booleanPath, EVERYWHERE, framePath, outlineOf, rectPath, shapePath } from './paths.ts'
import { drawnBounds, rotated, sigma, withEffects } from './reach.ts'
import { drawShape, strokePath } from './strokes.ts'

export type TextLayer = Extract<SceneLayer, { type: 'text' }>

/**
 * Draws a scene. The one drawing path for every surface: the same calls run on the CPU surface for
 * exports and on WebGL for the editor screen (ADR-0005), so only the surface differs.
 */
export function drawScene(ck: CanvasKit, canvas: Canvas, scene: Scene, resources: Resources) {
  canvas.clear(ck.TRANSPARENT)
  drawPageContent(ck, canvas, scene, resources)
}

/**
 * Draws a scene onto part of a bigger canvas, such as one frame of the editor's infinite canvas:
 * nothing outside the page shows and nothing else on the canvas is cleared. The caller places it.
 */
export function drawPage(ck: CanvasKit, canvas: Canvas, scene: Scene, resources: Resources) {
  canvas.save()
  canvas.clipRect(ck.XYWHRect(0, 0, scene.width, scene.height), ck.ClipOp.Intersect, true)
  drawPageContent(ck, canvas, scene, resources)
  canvas.restore()
}

function drawPageContent(ck: CanvasKit, canvas: Canvas, scene: Scene, resources: Resources) {
  const page = { x: 0, y: 0, width: scene.width, height: scene.height }
  const pagePath = rectPath(ck, page)
  for (const fill of scene.fills) fillPath(ck, canvas, pagePath, fill, page, resources)
  pagePath.delete()
  const { layers } = resources
  drawLayers(
    ck,
    canvas,
    scene.layers,
    resources,
    layers
      ? (layer) =>
          canvas.drawPicture(layers.picture(ck, layer, resources, (into) => drawLayer(ck, into, layer, resources)))
      : (layer) => drawLayer(ck, canvas, layer, resources),
  )
}

/**
 * Draws one parent's layers in order. A mask isn't drawn (#48): the layers after it, up to the next
 * mask, are drawn together, then kept only where the mask is opaque or, for a luminance mask, bright.
 */
export function drawLayers(
  ck: CanvasKit,
  canvas: Canvas,
  layers: readonly SceneLayer[],
  resources: Resources,
  draw = (layer: SceneLayer) => drawLayer(ck, canvas, layer, resources),
) {
  for (let i = 0; i < layers.length; i++) {
    const mask = layers[i] as SceneLayer
    if (!mask.props.mask) {
      draw(mask)
      continue
    }
    let end = i + 1
    while (end < layers.length && !layers[end]?.props.mask) end++
    const masked = layers.slice(i + 1, end)
    i = end - 1
    if (masked.length === 0) continue
    // Nothing shows outside what the mask draws, so the offscreen layers need be no bigger.
    const reach = rotated(
      withEffects(drawnBounds(ck, mask, resources), mask.props.effects),
      mask.props,
      mask.props.rotation,
    )
    const bounds = ck.XYWHRect(reach.x - 1, reach.y - 1, reach.width + 2, reach.height + 2)
    canvas.saveLayer(undefined, bounds)
    for (const layer of masked) draw(layer)
    const keep = new ck.Paint()
    keep.setBlendMode(ck.BlendMode.DstIn)
    const luminance = mask.props.mask === 'luminance'
    if (luminance) {
      const filter = ck.ColorFilter.MakeMatrix(LUMA_TO_ALPHA)
      keep.setColorFilter(filter)
      filter.delete()
    }
    canvas.saveLayer(keep, bounds)
    keep.delete()
    // Over black, what the mask leaves transparent is dark, and so hides too.
    if (luminance) canvas.drawColor(ck.BLACK, ck.BlendMode.Src)
    draw(mask)
    canvas.restore()
    canvas.restore()
  }
}

function drawLayer(ck: CanvasKit, canvas: Canvas, layer: SceneLayer, resources: Resources) {
  const { props } = layer
  canvas.save()
  if (props.rotation !== 0) canvas.rotate(props.rotation, props.x + props.width / 2, props.y + props.height / 2)

  // Frosted glass first: what is already drawn behind the layer, blurred inside its outline.
  const glass = props.effects.find((e): e is BackgroundBlur => e.type === 'backgroundBlur' && e.radius > 0)
  if (glass) blurBehind(ck, canvas, layer, glass.radius)

  const content = () => drawContent(ck, canvas, layer, resources)
  const own = props.effects.filter((e) => e.type !== 'backgroundBlur')
  // A group or frame is drawn by itself first unless it passes through; other layers only for a mode that isn't normal.
  const container = layer.type === 'group' || layer.type === 'frame'
  const together = props.blendMode !== 'pass-through' && (props.blendMode !== 'normal' || container)
  const needsLayer = props.opacity < 1 || together || own.length > 0
  if (!needsLayer) {
    content()
  } else {
    // An offscreen layer only as big as what the layer draws, effects included; a page-sized one
    // for every translucent layer made the 300-layer stress fixture take 15 s (#18).
    // One pixel more for anti-aliased edges.
    const reach = withEffects(drawnBounds(ck, layer, resources), props.effects)
    const bounds = ck.XYWHRect(reach.x - 1, reach.y - 1, reach.width + 2, reach.height + 2)
    const layerPaint = new ck.Paint()
    layerPaint.setAlphaf(props.opacity)
    layerPaint.setBlendMode(blendMode(ck, props.blendMode))
    canvas.saveLayer(layerPaint, bounds)
    layerPaint.delete()
    // Changes no pixel, but keeps a recorded picture from folding the layer's opacity into its one
    // draw (Skia's SkRecordOptimize), which rounds differently: the editor draws through pictures
    // and must match exports exactly (#36).
    canvas.clipRect(EVERYWHERE, ck.ClipOp.Intersect, false)
    // Shadows and glows behind the content, in their order.
    for (const effect of own) {
      if (effect.type === 'dropShadow') withFilter(ck, canvas, dropShadow(ck, effect), bounds, content)
      if (effect.type === 'glow') withFilter(ck, canvas, dropShadow(ck, { ...effect, x: 0, y: 0 }), bounds, content)
    }
    // The first blur that blurs; a zero-radius one before it no longer hides it.
    const blur = props.effects.find((e): e is LayerBlur => e.type === 'layerBlur' && e.radius > 0)
    if (blur) {
      withFilter(
        ck,
        canvas,
        ck.ImageFilter.MakeBlur(sigma(blur.radius), sigma(blur.radius), ck.TileMode.Decal, null),
        bounds,
        content,
      )
    } else {
      content()
    }
    // Inner shadows over the content, each kept inside it.
    for (const effect of own) {
      if (effect.type === 'innerShadow') withFilter(ck, canvas, innerShadow(ck, effect), bounds, content)
    }
    canvas.restore()
  }
  canvas.restore()
}

/**
 * Blurs what the canvas already holds under a layer's outline: a layer of nothing, whose
 * backdrop is the blurred canvas, clipped to the outline. Edges clamp, so the blur doesn't
 * fade in from outside what it reads.
 */
function blurBehind(ck: CanvasKit, canvas: Canvas, layer: SceneLayer, radius: number) {
  const outline = outlineOf(ck, layer)
  const [left = 0, top = 0, right = 0, bottom = 0] = outline.computeTightBounds()
  canvas.save()
  canvas.clipPath(outline, ck.ClipOp.Intersect, true)
  outline.delete()
  const blur = ck.ImageFilter.MakeBlur(sigma(radius), sigma(radius), ck.TileMode.Clamp, null)
  canvas.saveLayer(undefined, ck.LTRBRect(left, top, right, bottom), blur, 0, ck.TileMode.Clamp)
  canvas.restore()
  canvas.restore()
  blur.delete()
}

function drawContent(ck: CanvasKit, canvas: Canvas, layer: SceneLayer, resources: Resources) {
  switch (layer.type) {
    case 'graphic': {
      const path = shapePath(ck, layer)
      drawShape(ck, canvas, path, layer.props, resources, layer.props.shape.kind === 'line' ? layer.props.shape : null)
      path.delete()
      return
    }
    case 'boolean': {
      const path = booleanPath(ck, layer)
      drawShape(ck, canvas, path, layer.props, resources, null)
      path.delete()
      return
    }
    case 'text':
      return drawText(ck, canvas, layer, resources)
    case 'frame': {
      const { props } = layer
      const path = framePath(ck, props)
      for (const fill of props.fills) fillPath(ck, canvas, path, fill, props, resources)
      canvas.save()
      if (props.clip) canvas.clipPath(path, ck.ClipOp.Intersect, true)
      drawLayers(ck, canvas, layer.children, resources)
      canvas.restore()
      // Over what is inside, and never cut by the clip, so an outside stroke shows whole.
      strokePath(ck, canvas, path, props, resources, null)
      path.delete()
      return
    }
    case 'group':
      drawLayers(ck, canvas, layer.children, resources)
      return
  }
}

function withFilter(ck: CanvasKit, canvas: Canvas, filter: ImageFilter, bounds: Float32Array | null, draw: () => void) {
  const paint = new ck.Paint()
  paint.setImageFilter(filter)
  canvas.saveLayer(paint, bounds)
  draw()
  canvas.restore()
  paint.delete()
  filter.delete()
}

function dropShadow(ck: CanvasKit, effect: Pick<DropShadow, 'x' | 'y' | 'blur' | 'spread' | 'color'>) {
  const spread =
    effect.spread > 0
      ? ck.ImageFilter.MakeDilate(effect.spread, effect.spread, null)
      : effect.spread < 0
        ? ck.ImageFilter.MakeErode(-effect.spread, -effect.spread, null)
        : null
  const shadow = ck.ImageFilter.MakeDropShadowOnly(
    effect.x,
    effect.y,
    sigma(effect.blur),
    sigma(effect.blur),
    color(ck, effect.color),
    spread,
  )
  spread?.delete()
  return shadow
}

/**
 * An inner shadow: the layer's outside, coloured, grown inwards by the spread, moved and
 * blurred, then kept only where the layer is. The colour matrix turns transparent into the
 * shadow colour and opaque into nothing, working on unpremultiplied values in 0 to 1.
 */
function innerShadow(ck: CanvasKit, effect: InnerShadow) {
  const [r = 0, g = 0, b = 0, a = 0] = color(ck, effect.color)
  const outside = ck.ColorFilter.MakeMatrix([0, 0, 0, 0, r, 0, 0, 0, 0, g, 0, 0, 0, 0, b, 0, 0, 0, -a, a])
  const colored = ck.ImageFilter.MakeColorFilter(outside, null)
  outside.delete()
  const spread = effect.spread > 0 ? ck.ImageFilter.MakeDilate(effect.spread, effect.spread, colored) : colored
  const moved = ck.ImageFilter.MakeOffset(effect.x, effect.y, spread)
  const blurred = ck.ImageFilter.MakeBlur(sigma(effect.blur), sigma(effect.blur), ck.TileMode.Decal, moved)
  const inside = ck.ImageFilter.MakeBlend(ck.BlendMode.SrcIn, null, blurred)
  for (const f of new Set([colored, spread, moved, blurred])) f.delete()
  return inside
}

function drawText(ck: CanvasKit, canvas: Canvas, layer: TextLayer, resources: Resources) {
  const { blocks, dy, done } = laidOut(ck, layer.props, resources)
  const x = layer.props.x
  const y = layer.props.y + dy
  for (const b of blocks) {
    canvas.drawParagraph(b.paragraph, x + b.x, y + b.y)
    const outline = b.outline
    if (outline && resources.vector) drawAsShapes(ck, canvas, (into) => into.drawParagraph(outline, x + b.x, y + b.y))
    else if (outline) canvas.drawParagraph(outline, x + b.x, y + b.y)
    if (b.marker) canvas.drawParagraph(b.marker, x + b.markerX, y + b.y + b.markerY)
  }
  done()
}

/** Draws text as the glyphs' outlines, so a PDF holds the text once, as the fill pass's text. */
function drawAsShapes(ck: CanvasKit, canvas: Canvas, draw: (into: Canvas) => void) {
  const recorder = new ck.PictureRecorder()
  draw(recorder.beginRecording(EVERYWHERE))
  const picture = recorder.finishRecordingAsPicture()
  recorder.delete()
  ck.DrawTextAsPaths(canvas, picture)
  picture.delete()
}

function blendMode(ck: CanvasKit, mode: SceneLayer['props']['blendMode']) {
  const b = ck.BlendMode
  return {
    normal: b.SrcOver,
    multiply: b.Multiply,
    screen: b.Screen,
    overlay: b.Overlay,
    darken: b.Darken,
    lighten: b.Lighten,
    'color-dodge': b.ColorDodge,
    'color-burn': b.ColorBurn,
    'hard-light': b.HardLight,
    'soft-light': b.SoftLight,
    difference: b.Difference,
    exclusion: b.Exclusion,
    hue: b.Hue,
    saturation: b.Saturation,
    color: b.Color,
    luminosity: b.Luminosity,
    // Only reached when a pass-through group needs its own layer for opacity or effects.
    'pass-through': b.SrcOver,
  }[mode]
}
