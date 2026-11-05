// The view onto the infinite canvas (#36). A screen point, in CSS pixels from the stage's corner,
// is world × zoom + (x, y); world units are design pixels.
import type { Point, Rect } from '@dazbee/schema'

import { intersects } from './frames.ts'

export interface Camera {
  x: number
  y: number
  zoom: number
}
export interface Viewport {
  width: number
  height: number
}

/** Screen pixels at each edge of the stage that floating chrome covers (#83). */
export interface Insets {
  top: number
  right: number
  bottom: number
  left: number
}

export const MIN_ZOOM = 0.01
export const MAX_ZOOM = 64
export const NO_INSETS: Insets = { top: 0, right: 0, bottom: 0, left: 0 }
/** Fitting never zooms in past this, so a 320×50 banner doesn't fill the screen. */
const MAX_FIT_ZOOM = 4

/** The room a frame's label takes over its top, which showing a frame keeps in view too. */
const LABEL_ROOM = 24
/** How far in from the clear part's edges a label brought into view sits, and the room past its frame's corner its name takes. */
const LABEL_PAD = 16
const LABEL_NAME_ROOM = 120

/** Narrower than this, the stage is a phone's (#125). */
const PHONE_WIDTH = 640
/** On a phone, the room kept above the ads for their frame labels. */
const PHONE_TOP = 32

const clampZoom = (zoom: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom))

export const toWorld = (c: Camera, p: Point): Point => ({ x: (p.x - c.x) / c.zoom, y: (p.y - c.y) / c.zoom })
export const toScreen = (c: Camera, p: Point): Point => ({ x: p.x * c.zoom + c.x, y: p.y * c.zoom + c.y })

/** The camera at a new zoom with the world point under `at` (a screen point) still under it. */
export function zoomAt(c: Camera, at: Point, zoom: number): Camera {
  const next = clampZoom(zoom)
  const world = toWorld(c, at)
  return { zoom: next, x: at.x - world.x * next, y: at.y - world.y * next }
}

/**
 * The camera that shows the whole rect, centred in the part of the viewport the insets leave
 * clear, with `padding` screen pixels around it. On a phone the ads fill its width (16 px padding
 * by default) and sit at the top of the clear part, above where the property sheet opens.
 */
export function fit(rect: Rect, viewport: Viewport, padding?: number, insets: Insets = NO_INSETS): Camera {
  const phone = viewport.width < PHONE_WIDTH
  const pad = padding ?? (phone ? 16 : 48)
  const above = phone ? Math.max(pad, PHONE_TOP) : pad
  const clear = {
    width: viewport.width - insets.left - insets.right,
    height: viewport.height - insets.top - insets.bottom,
  }
  const room = { width: Math.max(1, clear.width - 2 * pad), height: Math.max(1, clear.height - above - pad) }
  const zoom = clampZoom(
    Math.min(MAX_FIT_ZOOM, room.width / Math.max(1, rect.width), room.height / Math.max(1, rect.height)),
  )
  return {
    zoom,
    x: insets.left + clear.width / 2 - (rect.x + rect.width / 2) * zoom,
    y: phone ? insets.top + above - rect.y * zoom : insets.top + clear.height / 2 - (rect.y + rect.height / 2) * zoom,
  }
}

/**
 * The camera that shows a rect whole with room for its label over it, in the part of the viewport
 * the insets leave clear: the camera as it is when that part shows them already; else one that
 * centres them there, at the same zoom when they fit LABEL_PAD in from its edges, else zoomed out
 * only as far as they need to.
 */
export function reveal(c: Camera, rect: Rect, viewport: Viewport, insets: Insets = NO_INSETS): Camera {
  const start = toScreen(c, { x: rect.x, y: rect.y })
  const end = toScreen(c, { x: rect.x + rect.width, y: rect.y + rect.height })
  const right = viewport.width - insets.right
  const bottom = viewport.height - insets.bottom
  if (start.x >= insets.left && start.y - LABEL_ROOM >= insets.top && end.x <= right && end.y <= bottom) return c
  const room = {
    width: Math.max(1, right - insets.left - 2 * LABEL_PAD),
    height: Math.max(1, bottom - insets.top - LABEL_ROOM - 2 * LABEL_PAD),
  }
  const zoom = clampZoom(Math.min(c.zoom, room.width / Math.max(1, rect.width), room.height / Math.max(1, rect.height)))
  return {
    zoom,
    x: (insets.left + right) / 2 - (rect.x + rect.width / 2) * zoom,
    y: (insets.top + LABEL_ROOM + bottom) / 2 - (rect.y + rect.height / 2) * zoom,
  }
}

/**
 * The camera at the same zoom that shows a frame's label: its row over the frame's top start corner,
 * with room for its name past the corner, in the part of the viewport the insets leave clear. Along
 * each axis the camera stays as it is where that part shows the label already, else it pans the
 * least to bring the label LABEL_PAD in from the clear part's edge.
 */
export function revealLabel(c: Camera, rect: Rect, viewport: Viewport, insets: Insets = NO_INSETS): Camera {
  const corner = toScreen(c, { x: rect.x, y: rect.y })
  const right = viewport.width - insets.right - LABEL_NAME_ROOM
  const bottom = viewport.height - insets.bottom
  const dx = panInto(corner.x, insets.left, right)
  const dy = panInto(corner.y, insets.top + LABEL_ROOM, bottom)
  return dx === 0 && dy === 0 ? c : { zoom: c.zoom, x: c.x + dx, y: c.y + dy }
}

/** The part of the world the viewport shows. */
export function visibleRect(c: Camera, viewport: Viewport): Rect {
  const corner = toWorld(c, { x: 0, y: 0 })
  return { x: corner.x, y: corner.y, width: viewport.width / c.zoom, height: viewport.height / c.zoom }
}

/** The frames the viewport shows any part of: the ones the screen draws. */
export function framesInView<F extends Rect>(frames: readonly F[], c: Camera, viewport: Viewport): F[] {
  const view = visibleRect(c, viewport)
  return frames.filter((frame) => intersects(frame, view))
}

/**
 * How far a screen coordinate moves to lie between `start` and `end`: nothing when it does already,
 * else to LABEL_PAD inside the edge it is past, kept between the two, and at `start` where `end` is
 * before it.
 */
function panInto(at: number, start: number, end: number): number {
  if (at >= start && at <= end) return 0
  const to = at < start ? start + LABEL_PAD : end - LABEL_PAD
  return Math.max(start, Math.min(to, end)) - at
}
