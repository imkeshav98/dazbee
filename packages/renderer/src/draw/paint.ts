import type { Canvas, CanvasKit, Image, Paint as CkPaint, Path, Shader } from '@dazbee/canvaskit'
import type { ImagePaint, Paint, Rect } from '@dazbee/schema'

import { color } from '../color.ts'
import type { Resources } from '../resources.ts'
import { imageColorMatrix } from './adjust.ts'

export function fillPath(ck: CanvasKit, canvas: Canvas, path: Path, fill: Paint, box: Rect, resources: Resources) {
  // A PDF reader can drop a see-through image pattern's alpha, so a vector export draws the image
  // whole inside a layer that holds its opacity instead.
  const faded = resources.vector && fill.type === 'image' && fill.opacity < 1
  const paint = paintFor(ck, faded ? { ...fill, opacity: 1 } : fill, box, resources)
  if (!paint) return
  if (faded) {
    const layer = new ck.Paint()
    layer.setAlphaf(fill.opacity)
    canvas.saveLayer(layer, path.getBounds())
    layer.delete()
  }
  canvas.drawPath(path, paint)
  if (faded) canvas.restore()
  paint.delete()
}

/**
 * A CanvasKit paint for one schema paint, or null for a hidden one. Gradient and image geometry is
 * placed in the layer's box; the paint's own opacity multiplies its colours' alpha.
 */
export function paintFor(ck: CanvasKit, fill: Paint, box: Rect, resources: Resources): CkPaint | null {
  if (fill.visible === false) return null
  const paint = new ck.Paint()
  paint.setAntiAlias(true)
  let shader: Shader | null = null
  const unitBox = ck.Matrix.multiply(ck.Matrix.translated(box.x, box.y), ck.Matrix.scaled(box.width, box.height))
  switch (fill.type) {
    case 'solid':
      paint.setColor(color(ck, fill.color))
      break
    case 'linear':
      shader = ck.Shader.MakeLinearGradient(
        [fill.from.x, fill.from.y],
        [fill.to.x, fill.to.y],
        fill.stops.map((s) => color(ck, s.color)),
        fill.stops.map((s) => s.offset),
        ck.TileMode.Clamp,
        unitBox,
      )
      break
    case 'radial':
      shader = ck.Shader.MakeRadialGradient(
        [fill.center.x, fill.center.y],
        fill.radius,
        fill.stops.map((s) => color(ck, s.color)),
        fill.stops.map((s) => s.offset),
        ck.TileMode.Clamp,
        unitBox,
      )
      break
    case 'angular': {
      // Turned about its centre in the unit box, so offset 0 starts at the angle.
      const turn = ck.Matrix.rotated((fill.angle * Math.PI) / 180, fill.center.x, fill.center.y)
      shader = ck.Shader.MakeSweepGradient(
        fill.center.x,
        fill.center.y,
        fill.stops.map((s) => color(ck, s.color)),
        fill.stops.map((s) => s.offset),
        ck.TileMode.Clamp,
        ck.Matrix.multiply(unitBox, turn),
      )
      break
    }
    case 'image': {
      const image = resources.images.get(fill.assetId)
      if (!image) throw new Error(`no image for asset "${fill.assetId}"`)
      shader = imageShader(ck, image, fill, box)
      paint.setAlphaf(fill.opacity)
      const matrix = imageColorMatrix(fill.adjust, fill.filter)
      if (matrix) {
        const filter = ck.ColorFilter.MakeMatrix(matrix)
        paint.setColorFilter(filter)
        filter.delete()
      }
      break
    }
  }
  const opacity = fill.opacity ?? 1
  if (fill.type !== 'image' && opacity < 1) paint.setAlphaf((paint.getColor()[3] ?? 1) * opacity)
  if (shader) {
    paint.setShader(shader)
    shader.delete()
  }
  return paint
}

/**
 * Where an image fill puts its image in a box: the part of the image it shows (`src`, in image
 * pixels) and where that part is drawn (`dst`). Fill covers the box, fit fits inside it, crop shows
 * the crop rect stretched to it, and tile starts the image at the box's corner at its own size.
 */
export function imagePlacement(
  image: Pick<Rect, 'width' | 'height'>,
  fill: ImagePaint,
  box: Rect,
): { src: Rect; dst: Rect } {
  const { width: iw, height: ih } = image
  const whole = { x: 0, y: 0, width: iw, height: ih }
  if (fill.fit === 'tile') return { src: whole, dst: { x: box.x, y: box.y, width: iw, height: ih } }
  if (fill.fit === 'crop' && fill.crop) return { src: fill.crop, dst: box }
  if (fill.fit === 'fill' || fill.fit === 'crop') {
    const scale = Math.max(box.width / iw, box.height / ih)
    const src = {
      width: box.width / scale,
      height: box.height / scale,
      x: (iw - box.width / scale) / 2,
      y: (ih - box.height / scale) / 2,
    }
    return { src, dst: box }
  }
  const scale = Math.min(box.width / iw, box.height / ih)
  const dst = {
    width: iw * scale,
    height: ih * scale,
    x: box.x + (box.width - iw * scale) / 2,
    y: box.y + (box.height - ih * scale) / 2,
  }
  return { src: whole, dst }
}

/** Places an image in a box as `imagePlacement` says: tile repeats it, fit leaves clear what it doesn't cover. */
function imageShader(ck: CanvasKit, image: Image, fill: ImagePaint, box: Rect): Shader {
  const sampling = [ck.FilterMode.Linear, ck.MipmapMode.None] as const
  if (fill.fit === 'tile') {
    return image.makeShaderOptions(
      ck.TileMode.Repeat,
      ck.TileMode.Repeat,
      ...sampling,
      ck.Matrix.translated(box.x, box.y),
    )
  }
  const { src, dst } = imagePlacement({ width: image.width(), height: image.height() }, fill, box)
  const matrix = ck.Matrix.multiply(
    ck.Matrix.translated(dst.x, dst.y),
    ck.Matrix.scaled(dst.width / src.width, dst.height / src.height),
    ck.Matrix.translated(-src.x, -src.y),
  )
  const tile = fill.fit === 'fit' ? ck.TileMode.Decal : ck.TileMode.Clamp
  return image.makeShaderOptions(tile, tile, ...sampling, matrix)
}
