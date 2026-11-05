// The frames of a page as the canvas shows them: each stored frame where it was placed, by
// its frame id, in world units.
import { type Design, framesOf, type Point, type Rect } from '@dazbee/schema'

/** A frame as the canvas shows it: the stored frame, by its id, in world units (design pixels at 100%) on its page. */
export interface Frame {
  /** The frame's id. */
  id: string
  pageId: string
  name: string
  x: number
  y: number
  width: number
  height: number
}

/** The canvas frame of a stored frame, or undefined for an id the design lacks. */
export function frameIn(design: Design, frameId: string): Frame | undefined {
  if (!Object.hasOwn(design.frames, frameId)) return undefined
  const stored = design.frames[frameId]
  return stored && canvasFrame(frameId, stored)
}

/** A page's frames, by order, and the box round them; null bounds for a page with none. */
export function pageFrames(design: Design, pageId: string): { frames: Frame[]; bounds: Rect | null } {
  const frames = framesOf(design, pageId).map(([id, stored]) => canvasFrame(id, stored))
  if (!frames.length) return { frames, bounds: null }
  const left = Math.min(...frames.map((f) => f.x))
  const top = Math.min(...frames.map((f) => f.y))
  const right = Math.max(...frames.map((f) => f.x + f.width))
  const bottom = Math.max(...frames.map((f) => f.y + f.height))
  return { frames, bounds: { x: left, y: top, width: right - left, height: bottom - top } }
}

export const intersects = (a: Rect, b: Rect) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height

/** The frame under a world point: the topmost (last by order) of those that hold it. */
export const frameAt = (frames: readonly Frame[], p: Point) =>
  frames.findLast((f) => p.x >= f.x && p.x <= f.x + f.width && p.y >= f.y && p.y <= f.y + f.height)

/** The frame under a world point, else the one whose edge is nearest it (the first of those that tie); none with no frames. */
export function frameNearest(frames: readonly Frame[], p: Point): Frame | undefined {
  const under = frameAt(frames, p)
  if (under) return under
  let nearest: Frame | undefined
  let best = Infinity
  for (const f of frames) {
    const away = Math.hypot(Math.max(f.x - p.x, 0, p.x - f.x - f.width), Math.max(f.y - p.y, 0, p.y - f.y - f.height))
    if (away < best) [nearest, best] = [f, away]
  }
  return nearest
}

function canvasFrame(id: string, stored: Design['frames'][string]): Frame {
  const { pageId, name, x, y, width, height } = stored
  return { id, pageId, name, x, y, width, height }
}
