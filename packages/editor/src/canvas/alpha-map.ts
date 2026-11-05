// How opaque an image is across it, kept small: drawn once from the decoded image on a CPU surface,
// so a click can tell a photo's see-through parts from the parts that show without reading the
// screen's pixels.
import type { CanvasKit, Image } from '@dazbee/canvaskit'

/** An image's opacity at a smaller size: one byte a pixel, row by row, 0 clear to 255 opaque. */
export interface AlphaMap {
  width: number
  height: number
  /** The size of the image it was drawn from, which points into it are given in. */
  imageWidth: number
  imageHeight: number
  alpha: Uint8Array
}

/** The longest side of an alpha map, in pixels. */
export const ALPHA_MAP_SIDE = 256

/** An image's alpha map, at most ALPHA_MAP_SIDE on its long side, drawn on a CPU surface. */
export function alphaMap(ck: CanvasKit, image: Image): AlphaMap {
  const imageWidth = image.width()
  const imageHeight = image.height()
  const scale = Math.min(1, ALPHA_MAP_SIDE / Math.max(imageWidth, imageHeight))
  const width = Math.max(1, Math.round(imageWidth * scale))
  const height = Math.max(1, Math.round(imageHeight * scale))
  const surface = ck.MakeSurface(width, height)
  if (!surface) throw new Error('could not make the surface for an alpha map')
  try {
    const canvas = surface.getCanvas()
    canvas.clear(ck.TRANSPARENT)
    canvas.drawImageRectOptions(
      image,
      ck.XYWHRect(0, 0, imageWidth, imageHeight),
      ck.XYWHRect(0, 0, width, height),
      ck.FilterMode.Linear,
      ck.MipmapMode.None,
      null,
    )
    const pixels = canvas.readPixels(0, 0, {
      width,
      height,
      colorType: ck.ColorType.RGBA_8888,
      alphaType: ck.AlphaType.Unpremul,
      colorSpace: ck.ColorSpace.SRGB,
    })
    if (!pixels) throw new Error('could not read the pixels of an alpha map')
    const alpha = new Uint8Array(width * height)
    for (let i = 0; i < alpha.length; i++) alpha[i] = pixels[i * 4 + 3] ?? 0
    return { width, height, imageWidth, imageHeight, alpha }
  } finally {
    surface.delete()
  }
}

/** How opaque the image is at a point in its own pixels, from 0 to 1; 0 outside it. */
export function opacityAt(map: AlphaMap, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= map.imageWidth || y >= map.imageHeight) return 0
  const col = Math.min(map.width - 1, Math.floor((x * map.width) / map.imageWidth))
  const row = Math.min(map.height - 1, Math.floor((y * map.height) / map.imageHeight))
  return (map.alpha[row * map.width + col] ?? 0) / 255
}
