import { describe, expect, it } from 'vitest'

import { loadCanvasKit } from '@dazbee/renderer/node'

import { alphaMap, opacityAt } from './alpha-map.ts'

const ck = await loadCanvasKit()

/** An image of a size with its left half drawn at `alpha` and its right half clear. */
const halfImage = (width: number, height: number, alpha: number) => {
  const surface = ck.MakeSurface(width, height)
  if (!surface) throw new Error('no surface')
  const canvas = surface.getCanvas()
  canvas.clear(ck.TRANSPARENT)
  const paint = new ck.Paint()
  paint.setColor(ck.Color(10, 200, 90, alpha))
  canvas.drawRect(ck.XYWHRect(0, 0, width / 2, height), paint)
  paint.delete()
  const image = surface.makeImageSnapshot()
  surface.delete()
  return image
}

describe('alphaMap', () => {
  it('draws a big image at most 256 px on its long side, keeping its shape', () => {
    const map = alphaMap(ck, halfImage(3000, 2000, 1))
    expect([map.width, map.height]).toEqual([256, 171])
    expect([map.imageWidth, map.imageHeight]).toEqual([3000, 2000])
  })

  it('keeps a small image at its own size', () => {
    const map = alphaMap(ck, halfImage(40, 20, 1))
    expect([map.width, map.height]).toEqual([40, 20])
  })
})

describe('opacityAt', () => {
  it("reads how opaque the image is at a point in the image's own pixels, and 0 outside it", () => {
    const map = alphaMap(ck, halfImage(3000, 2000, 0.5))
    expect(opacityAt(map, 700, 1000)).toBeCloseTo(0.5, 1)
    expect(opacityAt(map, 2300, 1000)).toBe(0)
    expect(opacityAt(map, -10, 1000)).toBe(0)
    expect(opacityAt(map, 700, 2000)).toBe(0)
  })
})
