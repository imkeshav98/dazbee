// Where a design's frames are: a page's frames in order, the cover frame, where the frame rule puts
// a new one, and the frame a layer is in.
import { inOrder } from './primitives.ts'

/** The gap the frame rule leaves between a page's rightmost frame and a new one. */
export const FRAME_GAP = 200

/** A page's frames as `[id, frame]` pairs, by order, ties broken by id. */
export function framesOf<F extends { readonly pageId: string; readonly order: string }>(
  design: { readonly frames: Readonly<Record<string, F>> },
  pageId: string,
): [string, F][] {
  return inOrder(design.frames).filter(([, frame]) => frame.pageId === pageId)
}

/**
 * The design's cover frame: the first frame, by order, of the first page, by order, that has one.
 * Thumbnails, templates and the Recent filter show it. Undefined when no page has a frame.
 */
export function coverFrame<F extends { readonly pageId: string; readonly order: string }>(design: {
  readonly pages: Readonly<Record<string, { readonly order: string }>>
  readonly frames: Readonly<Record<string, F>>
}): [string, F] | undefined {
  for (const [pageId] of inOrder(design.pages)) {
    const first = framesOf(design, pageId)[0]
    if (first) return first
  }
  return undefined
}

/**
 * Where the frame rule puts a new frame among a page's frames: at 0, 0 on an empty page, else
 * FRAME_GAP right of the frame whose right edge is furthest right (the first of those that tie),
 * its top aligned with that frame's.
 */
export function newFramePosition(frames: readonly { x: number; y: number; width: number }[]): {
  x: number
  y: number
} {
  let rightmost: { x: number; y: number; width: number } | undefined
  for (const frame of frames) {
    if (!rightmost || frame.x + frame.width > rightmost.x + rightmost.width) rightmost = frame
  }
  if (!rightmost) return { x: 0, y: 0 }
  return { x: rightmost.x + rightmost.width + FRAME_GAP, y: rightmost.y }
}

/**
 * The frame a layer is in, walking up its parents; a frame id gives itself. Undefined when the
 * chain ends at no frame or loops. Takes only what it reads, so a design as stored or as JSON fits.
 */
export function frameIdOf(
  design: {
    readonly frames: Readonly<Record<string, unknown>>
    readonly nodes: Readonly<Record<string, { readonly parentId: string } | undefined>>
  },
  id: string,
): string | undefined {
  const seen = new Set<string>()
  for (let up: string | undefined = id; up !== undefined && !seen.has(up); up = design.nodes[up]?.parentId) {
    if (Object.hasOwn(design.frames, up)) return up
    if (!Object.hasOwn(design.nodes, up)) return undefined
    seen.add(up)
  }
  return undefined
}
