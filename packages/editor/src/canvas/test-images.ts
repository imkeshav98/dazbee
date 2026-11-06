// Images the hit test tests draw with CanvasKit, to read their alpha maps: half clear, faint and a
// cut-out disc.
import { loadCanvasKit } from '@dazbee/renderer/node'

const ck = await loadCanvasKit()

/** An image drawn with CanvasKit: `paint` draws on a clear canvas of its size. */
const drawImage = (
  width: number,
  height: number,
  paint: (fill: (rect: Float32Array, alpha: number) => void) => void,
) => {
  const surface = ck.MakeSurface(width, height)
  if (!surface) throw new Error('no surface')
  const canvas = surface.getCanvas()
  canvas.clear(ck.TRANSPARENT)
  paint((rect, alpha) => {
    const p = new ck.Paint()
    p.setColor(ck.Color(200, 40, 40, alpha))
    canvas.drawRect(rect, p)
    p.delete()
  })
  const image = surface.makeImageSnapshot()
  surface.delete()
  return image
}
/** A 200 × 100 image: its left half opaque, its right half clear. */
export const HALF = drawImage(200, 100, (fill) => fill(ck.XYWHRect(0, 0, 100, 100), 1))
/** A 200 × 100 image: its left half 5% opaque, its right half 20%. */
export const FAINT = drawImage(200, 100, (fill) => {
  fill(ck.XYWHRect(0, 0, 100, 100), 0.05)
  fill(ck.XYWHRect(100, 0, 100, 100), 0.2)
})
/** A 3000 × 2000 cut-out: a disc filling it, its corners clear. */
export const CUT_OUT = (() => {
  const surface = ck.MakeSurface(3000, 2000)
  if (!surface) throw new Error('no surface')
  const canvas = surface.getCanvas()
  canvas.clear(ck.TRANSPARENT)
  const p = new ck.Paint()
  p.setColor(ck.Color(20, 120, 220, 1))
  canvas.drawOval(ck.XYWHRect(0, 0, 3000, 2000), p)
  p.delete()
  const image = surface.makeImageSnapshot()
  surface.delete()
  return image
})()
