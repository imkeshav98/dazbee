// Cropping an image fill on the stage: a press on the image or one of its corners, the drag
// that pans or scales it, and the whole image with its corner handles as the overlay draws it.
import type { Session } from '@dazbee/doc'
import type { Point } from '@dazbee/schema'

import { type Camera, toScreen, toWorld } from '../canvas/camera.ts'
import { type Frame, scope } from '../canvas/frames.ts'
import type { ThumbnailCache } from '../canvas/thumbnails.ts'
import type { CropTarget, EditorBoxes } from '../layers/boxes.ts'
import { type Box, drawnFrom, localTo, pageFrom, round } from '../layers/transform.ts'
import { runQuietly } from '../run-quietly.ts'
import type { EditorSelection } from '../selection.ts'
import { cornersOfRect, cropOf, panned, scaled } from './crop.ts'
import { HANDLE_REACH } from './press.ts'

/** A drag of the image being cropped, or of one of its corners, from the press until it ends: one undo step. */
export interface CropDrag {
  kind: 'crop'
  frame: Frame
  around: Box[]
  id: string
  corner: number | null
  grab: Point
  start: CropTarget
  end: () => void
}

export interface CroppingDeps {
  canvas: HTMLCanvasElement
  session: Session
  selection: Pick<EditorSelection, 'cropping' | 'crop'>
  thumbnails: Pick<ThumbnailCache, 'ghost'>
  camera: () => Camera
  /** The frame of the grid as last drawn with a key, if there is one. */
  frameOf: (key: string | undefined) => Frame | undefined
  boxes: Pick<EditorBoxes, 'cropTarget'>
  /** A box on the overlay with a class, turned as the layer is. */
  outline: (className: string, frame: Frame, box: Box) => HTMLElement
  /** Draws the overlay. */
  drawOverlay: () => void
}

export interface EditorCropping {
  /**
   * A press while cropping: on a corner of the image, a drag that scales it; on the image,
   * one that moves it. Each drag is one undo step. Anywhere else ends the crop and returns null,
   * so the press does what a press does.
   */
  press(e: PointerEvent, screen: Point): CropDrag | null
  /** Writes the crop a drag gives, in this format, as the fill's own crop. */
  drag(g: CropDrag, p: Point): void
  /** Ends a crop drag, closing its undo step. */
  release(g: CropDrag): void
  /** The crop being made, as the overlay shows it. */
  parts(): HTMLElement[]
}

export function editorCropping({
  canvas,
  session,
  selection,
  thumbnails,
  camera,
  frameOf,
  boxes: { cropTarget },
  outline,
  drawOverlay,
}: CroppingDeps): EditorCropping {
  /** The crop being made (#48): the whole image, faint outside the layer, a handle on each corner. */
  function cropParts(): HTMLElement[] {
    const cropping = selection.cropping()
    const frame = cropping && frameOf(cropping.frame)
    const target = frame && cropping && cropTarget(frame, cropping.id)
    if (!frame || !target) return []
    const { box, rect, around } = target
    const whole = outline('crop-image', frame, drawnFrom({ ...rect, rotation: 0 }, around))
    const ghost = document.createElement('div')
    ghost.className = 'crop-ghost'
    ghost.style.backgroundImage = `url("${thumbnails.ghost(target.image)}")`
    // Clear over the box, where the layer shows the image itself.
    const [l, t, r, b] = [box.x - rect.x, box.y - rect.y, box.x + box.width - rect.x, box.y + box.height - rect.y].map(
      (v, i) => `${(v / (i % 2 === 0 ? rect.width : rect.height)) * 100}%`,
    )
    ghost.style.clipPath = `polygon(evenodd, 0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${l} ${t}, ${l} ${b}, ${r} ${b}, ${r} ${t}, ${l} ${t})`
    whole.append(ghost)
    for (const i of cornersOfRect(rect).keys()) {
      const handle = document.createElement('div')
      handle.className = 'handle'
      handle.dataset.cropCorner = String(i)
      Object.assign(handle.style, { left: `${i === 1 || i === 2 ? 100 : 0}%`, top: `${i >= 2 ? 100 : 0}%` })
      whole.append(handle)
    }
    const shown = outline('selection', frame, drawnFrom(box, around.slice(0, -1)))
    shown.dataset.cropping = cropping?.id
    return [whole, shown]
  }

  /**
   * A press while cropping (#48): on a corner of the image it scales it, on the image it moves it,
   * and anywhere else it ends the crop and acts as a press does. Each drag is one undo step.
   */
  function startCrop(e: PointerEvent, screen: Point): CropDrag | null {
    const cropping = selection.cropping()
    const frame = cropping && frameOf(cropping.frame)
    const target = frame && cropping && cropTarget(frame, cropping.id)
    if (!frame || !target || !cropping) {
      selection.crop(null)
      return null
    }
    const { rect, around } = target
    const onScreen = (q: Point) => {
      const page = pageFrom(q, around)
      return toScreen(camera(), { x: frame.x + page.x, y: frame.y + page.y })
    }
    const corner = cornersOfRect(rect).findIndex((q) => {
      const c = onScreen(q)
      return Math.hypot(c.x - screen.x, c.y - screen.y) <= HANDLE_REACH
    })
    const world = toWorld(camera(), screen)
    const grab = localTo({ x: world.x - frame.x, y: world.y - frame.y }, around)
    const onImage =
      grab.x >= rect.x && grab.x <= rect.x + rect.width && grab.y >= rect.y && grab.y <= rect.y + rect.height
    if (corner === -1 && !onImage) {
      selection.crop(null)
      drawOverlay()
      return null
    }
    canvas.setPointerCapture(e.pointerId)
    return {
      kind: 'crop',
      frame,
      around,
      id: cropping.id,
      corner: corner === -1 ? null : corner,
      grab,
      start: target,
      end: session.beginGesture(),
    }
  }
  /** Writes the crop a drag gives, in this format, as the fill's own crop. */
  function cropTo(g: CropDrag, p: Point) {
    const { start } = g
    const rect =
      g.corner === null
        ? panned(start.rect, start.box, p.x - g.grab.x, p.y - g.grab.y)
        : scaled(start.rect, start.box, g.corner, p)
    const c = cropOf(rect, start.size, start.box)
    const crop = {
      x: Math.max(0, round(c.x)),
      y: Math.max(0, round(c.y)),
      width: round(c.width),
      height: round(c.height),
    }
    const fills = start.fills.map((f, i) => (i === start.index ? { ...start.fill, fit: 'crop' as const, crop } : f))
    runQuietly(() => session.run('node.update', { ids: [g.id], scope: scope(g.frame), patch: { fills } }))
    drawOverlay()
  }
  /** Ends a crop drag, closing its undo step. */
  function release(g: CropDrag) {
    g.end()
  }

  return {
    press: startCrop,
    drag: cropTo,
    release,
    parts: cropParts,
  }
}
